import type { ResetHistoryEvent, ResetHistoryWindow } from '../../shared/resetHistory'
import { resetWindowStartedAt } from '../../shared/resetHistory'
import type { ProfileRuntimeState, UsageLimit, UsageWindow } from '../../shared/types'
import { selectPlanningLimit } from '../../shared/usage'
import { readJsonFile, writeJsonFileAtomic } from '../persistence/jsonFile'
import {
  emptyResetHistory,
  type ResetHistoryData,
  type ResetWindowObservation
} from './resetHistoryTypes'
import { parseResetHistory } from './resetHistoryValidation'

const BANKED_MATCH_TOLERANCE_MS = 2 * 60 * 1_000

export class ResetHistoryStore {
  private data: ResetHistoryData | null = null
  private writeChain: Promise<void> = Promise.resolve()

  constructor(private readonly filePath: string) {}

  async initialize(): Promise<void> {
    const stored = await readJsonFile(this.filePath)
    this.data = stored === null ? emptyResetHistory() : parseResetHistory(stored)
    if (stored === null) await this.persist()
  }

  getEvents(): ResetHistoryEvent[] {
    return structuredClone(this.requireData().events)
  }

  async observeProfiles(
    profiles: ProfileRuntimeState[],
    bankedEvents: ResetHistoryEvent[],
    observedAt = Date.now()
  ): Promise<void> {
    await this.mutate((data) => {
      for (const profile of profiles) {
        if (profile.status !== 'ready') continue
        const limit = selectPlanningLimit(profile.usageLimits)
        if (!limit) continue
        removeNonPlanningHistory(data, profile.profileId, limit.id)
        observeWindow(
          data,
          profile.profileId,
          limit,
          'primary',
          limit.primary,
          bankedEvents,
          observedAt
        )
        observeWindow(
          data,
          profile.profileId,
          limit,
          'secondary',
          limit.secondary,
          bankedEvents,
          observedAt
        )
      }
    })
  }

  private async mutate(mutator: (data: ResetHistoryData) => void): Promise<void> {
    const operation = this.writeChain.then(async () => {
      mutator(this.requireData())
      await this.persist()
    })
    this.writeChain = operation.then(
      () => undefined,
      () => undefined
    )
    return operation
  }

  private requireData(): ResetHistoryData {
    if (this.data === null) throw new Error('ResetHistoryStore has not been initialized.')
    return this.data
  }

  private async persist(): Promise<void> {
    await writeJsonFileAtomic(this.filePath, this.requireData())
  }
}

function removeNonPlanningHistory(
  data: ResetHistoryData,
  profileId: string,
  planningLimitId: string
): void {
  data.events = data.events.filter(
    (event) =>
      event.kind !== 'observed-reset' ||
      event.profileId !== profileId ||
      event.usageLimitId === planningLimitId
  )
  for (const [key, observation] of Object.entries(data.observations)) {
    if (observation.profileId === profileId && observation.usageLimitId !== planningLimitId) {
      delete data.observations[key]
    }
  }
}

function observeWindow(
  data: ResetHistoryData,
  profileId: string,
  limit: UsageLimit,
  usageWindow: ResetHistoryWindow,
  window: UsageWindow | null,
  bankedEvents: ResetHistoryEvent[],
  observedAt: number
): void {
  if (!window || window.resetsAt === null || window.windowDurationMinutes === null) return
  const windowStartedAt = resetWindowStartedAt(window)
  if (windowStartedAt === null || windowStartedAt > observedAt) return

  const key = observationKey(profileId, limit.id, usageWindow)
  const previous = data.observations[key]
  const observation: ResetWindowObservation = {
    profileId,
    usageLimitId: limit.id,
    usageWindow,
    windowDurationMinutes: window.windowDurationMinutes,
    usedPercent: window.usedPercent,
    resetsAt: window.resetsAt * 1_000,
    windowStartedAt,
    observedAt
  }
  data.observations[key] = observation

  if (previous && windowStartedAt <= previous.windowStartedAt) return
  if (matchesBankedReset(profileId, windowStartedAt, bankedEvents)) return

  const eventId = `observed:${key}:${windowStartedAt}`
  if (data.events.some((event) => event.id === eventId)) return
  data.events.push({
    id: eventId,
    profileId,
    kind: 'observed-reset',
    occurredAt: windowStartedAt,
    recordedAt: observedAt,
    creditId: null,
    bankedOutcome: null,
    usageLimitId: limit.id,
    usageWindow,
    windowDurationMinutes: window.windowDurationMinutes,
    usedPercentBefore: previous?.usedPercent ?? null,
    usedPercentAfter: window.usedPercent,
    previousResetsAt: previous?.resetsAt ?? null,
    nextResetsAt: window.resetsAt * 1_000
  })
}

function matchesBankedReset(
  profileId: string,
  windowStartedAt: number,
  events: ResetHistoryEvent[]
): boolean {
  return events.some(
    (event) =>
      event.kind === 'banked-reset' &&
      event.profileId === profileId &&
      Math.abs(event.occurredAt - windowStartedAt) <= BANKED_MATCH_TOLERANCE_MS
  )
}

function observationKey(
  profileId: string,
  usageLimitId: string,
  usageWindow: ResetHistoryWindow
): string {
  return JSON.stringify([profileId, usageLimitId, usageWindow])
}
