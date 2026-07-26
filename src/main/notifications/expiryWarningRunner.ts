import {
  selectDueExpiryWarnings,
  type ExpiryWarningCandidate,
  type ExpiryWarningStage
} from '../../shared/expiryWarnings'
import type { ProfileRuntimeState, ProfileSettings } from '../../shared/types'
import type { ExpiryWarningStore } from './expiryWarningStore'
import type { ExpiryWarningStageUpdate } from './expiryWarningStoreTypes'

export const EXPIRY_WARNING_EVALUATION_INTERVAL_MS = 15_000
export const EXPIRY_WARNING_DELIVERY_RETRY_MS = 5 * 60 * 1_000

export interface ExpiryWarningDeliveryRequest {
  candidate: ExpiryWarningCandidate
  stage: ExpiryWarningStage
}

export type ExpiryWarningDeliveryResult =
  | { status: 'delivered' }
  | { status: 'unsupported' }
  | { status: 'failed'; error: string }

export interface ExpiryWarningIntervalScheduler {
  setInterval(callback: () => void, intervalMs: number): unknown
  clearInterval(handle: unknown): void
}

export interface ExpiryWarningRunnerOptions {
  store: ExpiryWarningStore
  getProfiles: () => ProfileSettings[]
  getRuntimeStates: () => ProfileRuntimeState[]
  isEnabled: () => boolean
  deliver: (
    request: ExpiryWarningDeliveryRequest
  ) => ExpiryWarningDeliveryResult | Promise<ExpiryWarningDeliveryResult>
  onDeliveryResult?: (
    request: ExpiryWarningDeliveryRequest,
    result: ExpiryWarningDeliveryResult
  ) => void
  onError?: (error: unknown) => void
  now?: () => number
  scheduler?: ExpiryWarningIntervalScheduler
}

const systemScheduler: ExpiryWarningIntervalScheduler = {
  setInterval: (callback, intervalMs) => setInterval(callback, intervalMs),
  clearInterval: (handle) => clearInterval(handle as NodeJS.Timeout)
}

export class ExpiryWarningRunner {
  private currentTick: Promise<void> | null = null
  private timer: unknown
  private started = false
  private stopped = false
  private readonly now: () => number
  private readonly scheduler: ExpiryWarningIntervalScheduler
  private readonly retryAfterByIdentity = new Map<string, number>()

  constructor(private readonly options: ExpiryWarningRunnerOptions) {
    this.now = options.now ?? Date.now
    this.scheduler = options.scheduler ?? systemScheduler
  }

  start(): void {
    if (this.stopped) throw new Error('ExpiryWarningRunner cannot restart after shutdown.')
    if (this.started) return
    this.started = true
    this.timer = this.scheduler.setInterval(() => {
      void this.tick().catch((error) => this.reportError(error))
    }, EXPIRY_WARNING_EVALUATION_INTERVAL_MS)
    void this.tick().catch((error) => this.reportError(error))
  }

  async tick(nowMs = this.now()): Promise<void> {
    if (this.stopped) return
    if (this.currentTick) return this.currentTick

    const operation = this.performTick(nowMs)
    this.currentTick = operation
    try {
      await operation
    } finally {
      if (this.currentTick === operation) this.currentTick = null
    }
  }

  async shutdown(): Promise<void> {
    this.stopped = true
    if (this.started) {
      this.scheduler.clearInterval(this.timer)
      this.started = false
    }
    await this.currentTick
  }

  private async performTick(nowMs: number): Promise<void> {
    if (!this.options.isEnabled()) return
    const candidates = selectDueExpiryWarnings(
      this.options.getProfiles(),
      this.options.getRuntimeStates(),
      nowMs / 1_000
    )
    await Promise.all(candidates.map((candidate) => this.handleCandidate(candidate, nowMs)))
  }

  private async handleCandidate(
    candidate: ExpiryWarningCandidate,
    nowMs: number
  ): Promise<void> {
    try {
      const record = this.options.store.getRecord(candidate.identity)
      const unhandledStages = candidate.dueStages.filter((stage) => !record?.stages[stage])
      if (unhandledStages.length === 0) return

      const urgentStage = candidate.dueStages[candidate.dueStages.length - 1]
      if (!urgentStage) return
      if (record?.stages[urgentStage]) {
        await this.options.store.recordStages(
          candidate,
          unhandledStages.map((stage) => ({ stage, disposition: 'superseded' })),
          nowMs
        )
        return
      }

      if ((this.retryAfterByIdentity.get(candidate.identity) ?? 0) > nowMs) return

      const request = { candidate, stage: urgentStage } satisfies ExpiryWarningDeliveryRequest
      let result: ExpiryWarningDeliveryResult
      try {
        result = await this.options.deliver(request)
      } catch (error) {
        result = {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error)
        }
        this.reportError(error)
      }
      this.options.onDeliveryResult?.(request, result)
      if (result.status !== 'delivered') {
        this.retryAfterByIdentity.set(
          candidate.identity,
          nowMs + EXPIRY_WARNING_DELIVERY_RETRY_MS
        )
        return
      }
      this.retryAfterByIdentity.delete(candidate.identity)

      const updates: ExpiryWarningStageUpdate[] = unhandledStages.map((stage) => ({
        stage,
        disposition: stage === urgentStage ? 'delivered' : 'superseded'
      }))
      await this.options.store.recordStages(candidate, updates, nowMs)
    } catch (error) {
      this.retryAfterByIdentity.set(
        candidate.identity,
        nowMs + EXPIRY_WARNING_DELIVERY_RETRY_MS
      )
      this.reportError(error)
    }
  }

  private reportError(error: unknown): void {
    if (this.options.onError) this.options.onError(error)
    else console.error(error)
  }
}
