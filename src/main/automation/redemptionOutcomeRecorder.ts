import type {
  ConsumeResetOutcome,
  ProfileSettings,
  ResetCredit
} from '../../shared/types'
import type { RedemptionAuthorizationKind } from './automationLedgerTypes'
import type { AutomationRunnerOptions } from './automationRunnerTypes'
import type { RedemptionLease } from './redemptionLock'

export class RedemptionOutcomeRecorder {
  constructor(private readonly options: AutomationRunnerOptions) {}

  async recordPreflightFailure(
    profile: ProfileSettings,
    credit: ResetCredit,
    error: unknown,
    timestamp: number
  ): Promise<void> {
    const message = errorMessage(error)
    if (this.options.ledger.getRecord(profile.id, credit.id)) {
      await this.options.ledger.markPreflightError(profile.id, credit.id, message, timestamp)
    }
    await this.options.ledger.addEvent(
      profile.id,
      credit.id,
      'error',
      `${profile.name}: could not re-check the reset before use. ${message}`,
      timestamp
    )
    this.options.onChange()
  }

  async recordInterruptedAttempt(
    profile: ProfileSettings,
    credit: ResetCredit,
    error: unknown
  ): Promise<void> {
    const message = errorMessage(error)
    await this.options.ledger.markError(profile.id, credit.id, message)
    await this.options.ledger.addEvent(
      profile.id,
      credit.id,
      'error',
      `${profile.name}: reset request was interrupted; the same idempotency key will be retried. ${message}`
    )
  }

  async handleOutcome(
    profile: ProfileSettings,
    credit: ResetCredit,
    outcome: ConsumeResetOutcome,
    kind: RedemptionAuthorizationKind
  ): Promise<string> {
    if (outcome === 'reset' || outcome === 'alreadyRedeemed') {
      const message =
        outcome === 'reset'
          ? kind === 'manual'
            ? `${profile.name}: manually used ${credit.title ?? 'reset'} before it expired.`
            : `${profile.name}: used ${credit.title ?? 'reset'} before it expired.`
          : `${profile.name}: confirmed the reset had already been used by this guarded request.`
      await this.options.ledger.addEvent(profile.id, credit.id, 'success', message)
      this.options.notify({ title: 'Codex reset used', body: message })
      return message
    }

    if (outcome === 'nothingToReset') {
      const message =
        kind === 'manual'
          ? `${profile.name}: usage did not need resetting; no further manual request will be made.`
          : `${profile.name}: usage did not need resetting yet; Banked Reset Safety Net will retry before expiry.`
      await this.options.ledger.addEvent(profile.id, credit.id, 'info', message)
      if (
        kind === 'automatic' &&
        this.options.ledger.getRecord(profile.id, credit.id)?.attempts === 1
      ) {
        this.options.notify({ title: 'Reset not needed yet', body: message })
      }
      return message
    }

    const message = `${profile.name}: Codex reported that the reset is no longer available.`
    await this.options.ledger.addEvent(profile.id, credit.id, 'warning', message)
    this.options.notify({ title: 'Codex reset unavailable', body: message })
    return message
  }

  async addStoppedEvent(
    profile: ProfileSettings,
    credit: ResetCredit,
    error: unknown
  ): Promise<void> {
    await this.options.ledger.addEvent(
      profile.id,
      credit.id,
      'warning',
      `${profile.name}: automatic reset use stopped before redemption. ${errorMessage(error)}`
    )
    this.options.onChange()
  }

  async releaseLease(
    lease: RedemptionLease | null,
    profile: ProfileSettings,
    credit: ResetCredit
  ): Promise<void> {
    if (!lease) return
    try {
      await lease.release()
    } catch (error) {
      await this.options.ledger.addEvent(
        profile.id,
        credit.id,
        'error',
        `${profile.name}: could not release the redemption lock. ${errorMessage(error)}`
      )
      this.options.onChange()
    }
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
