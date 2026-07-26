import type {
  AppSettings,
  ManualUseResult,
  ProfileRuntimeState
} from '../../shared/types'
import type {
  AutomationRunnerOptions,
  VerifiedManualRedemptionAuthorization
} from './automationRunnerTypes'
import { earliestAvailableCredit, isCreditDue, shouldAttemptRecord } from './decision'
import { GuardedRedemptionExecutor } from './guardedRedemptionExecutor'
import { canRecover } from './redemptionAuthorization'

export type {
  AutomationNotification,
  AutomationRunnerOptions,
  AutomationSessionGateway,
  VerifiedManualRedemptionAuthorization
} from './automationRunnerTypes'

export class AutomationRunner {
  private readonly activeProfiles = new Set<string>()
  private readonly executor: GuardedRedemptionExecutor
  private currentTick: Promise<void> | null = null
  private stopped = false

  constructor(private readonly options: AutomationRunnerOptions) {
    this.executor = new GuardedRedemptionExecutor(options)
  }

  async tick(nowMs = Date.now()): Promise<void> {
    if (this.stopped || this.currentTick) return
    const operation = this.performTick(nowMs)
    this.currentTick = operation
    try {
      await operation
    } finally {
      if (this.currentTick === operation) this.currentTick = null
    }
  }

  async executeManual(
    authorization: VerifiedManualRedemptionAuthorization
  ): Promise<ManualUseResult> {
    if (this.stopped) throw new Error('Reset automation is shutting down.')
    return this.executor.executeManual(authorization)
  }

  async shutdown(): Promise<void> {
    this.stopped = true
    await this.currentTick
  }

  private async performTick(nowMs: number): Promise<void> {
    const settings = this.options.settings.get()
    const settingsRevision = this.options.settings.getRevision()
    const executable = this.options.getResolvedExecutable()
    if (!executable) return

    const runtimeByProfile = new Map(
      this.options.getRuntimeStates().map((runtime) => [runtime.profileId, runtime])
    )
    const scheduledProfiles = new Set<string>()
    const tasks: Promise<void>[] = []

    for (const record of this.options.ledger.getRecords()) {
      if (record.status !== 'uncertain' || record.attempts < 1) continue
      if (record.creditExpiresAt * 1_000 <= nowMs) {
        tasks.push(this.executor.expireRecord(record, nowMs))
        continue
      }
      if (!shouldAttemptRecord(record, record.creditExpiresAt, nowMs)) continue
      const profile = settings.profiles.find((candidate) => candidate.id === record.profileId)
      if (!profile || !canRecover(profile, record)) continue
      if (scheduledProfiles.has(profile.id) || this.activeProfiles.has(profile.id)) continue
      scheduledProfiles.add(profile.id)
      tasks.push(
        this.runScheduledProfile(profile.id, () =>
          this.executor.recoverUncertainAttempt(profile, record, executable)
        )
      )
    }

    for (const profile of settings.profiles) {
      if (
        !profile.enabled ||
        !profile.autoRedeemEnabled ||
        scheduledProfiles.has(profile.id) ||
        this.activeProfiles.has(profile.id)
      ) {
        continue
      }
      const runtime = runtimeByProfile.get(profile.id)
      if (!runtime || runtime.status !== 'ready') continue
      const credit = earliestAvailableCredit(runtime, nowMs)
      if (!credit || credit.expiresAt === null || !isCreditDue(profile, credit, nowMs)) continue

      const record = this.options.ledger.getRecord(profile.id, credit.id)
      if (!shouldAttemptRecord(record, credit.expiresAt, nowMs)) continue
      scheduledProfiles.add(profile.id)
      tasks.push(
        this.runScheduledProfile(profile.id, async () => {
          try {
            await this.executor.executeAutomatic(
              profile,
              credit,
              executable,
              settingsRevision
            )
          } catch (error) {
            await this.executor.addStoppedEvent(profile, credit, error)
          }
        })
      )
    }
    await Promise.all(tasks)
  }

  private async runScheduledProfile(
    profileId: string,
    operation: () => Promise<void>
  ): Promise<void> {
    this.activeProfiles.add(profileId)
    try {
      await operation()
    } finally {
      this.activeProfiles.delete(profileId)
    }
  }
}

export function runtimeStatesForSettings(
  settings: AppSettings,
  states: ProfileRuntimeState[]
): ProfileRuntimeState[] {
  const ids = new Set(settings.profiles.map((profile) => profile.id))
  return states.filter((state) => ids.has(state.profileId))
}
