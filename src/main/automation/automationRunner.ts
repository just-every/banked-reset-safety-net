import type { AppSettings, ProfileRuntimeState, ProfileSettings, ResetCredit } from '../../shared/types'
import type { SettingsStore } from '../settings/settingsStore'
import { AutomationLedger } from './automationLedger'
import { earliestAvailableCredit, isCreditDue, shouldAttemptRecord } from './decision'
import type { RedemptionLease } from './redemptionLock'
import { RedemptionLock } from './redemptionLock'

export interface AutomationNotification {
  title: string
  body: string
}

export interface AutomationSessionGateway {
  readResetCredits(
    profile: ProfileSettings,
    executable: string
  ): Promise<{ availableCount: number; credits: ResetCredit[] | null }>
  consumeCredit(
    profile: ProfileSettings,
    executable: string,
    creditId: string,
    idempotencyKey: string
  ): Promise<'reset' | 'nothingToReset' | 'noCredit' | 'alreadyRedeemed'>
}

export interface AutomationRunnerOptions {
  settings: SettingsStore
  ledger: AutomationLedger
  sessions: AutomationSessionGateway
  redemptionLock: RedemptionLock
  getRuntimeStates: () => ProfileRuntimeState[]
  getResolvedExecutable: () => string | null
  onChange: () => void
  onRefreshNeeded: () => Promise<void>
  notify: (notification: AutomationNotification) => void
}

export class AutomationRunner {
  private readonly activeProfiles = new Set<string>()
  private currentTick: Promise<void> | null = null
  private stopped = false

  constructor(private readonly options: AutomationRunnerOptions) {}

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

  async shutdown(): Promise<void> {
    this.stopped = true
    await this.currentTick
  }

  private async performTick(nowMs: number): Promise<void> {
    const settings = this.options.settings.get()
    const runtimeByProfile = new Map(
      this.options.getRuntimeStates().map((runtime) => [runtime.profileId, runtime])
    )
    const executable = this.options.getResolvedExecutable()
    if (!executable) return

    const tasks: Promise<void>[] = []
    for (const profile of settings.profiles) {
      if (!profile.enabled || !profile.autoRedeemEnabled || this.activeProfiles.has(profile.id)) {
        continue
      }
      const runtime = runtimeByProfile.get(profile.id)
      if (!runtime || runtime.status !== 'ready') continue
      const credit = earliestAvailableCredit(runtime, nowMs)
      if (!credit || credit.expiresAt === null || !isCreditDue(profile, credit, nowMs)) continue

      const record = this.options.ledger.getRecord(profile.id, credit.id)
      if (!shouldAttemptRecord(record, credit.expiresAt, nowMs)) continue
      tasks.push(this.runProfile(profile, credit, executable, nowMs))
    }
    await Promise.all(tasks)
  }

  private async runProfile(
    observedProfile: ProfileSettings,
    observedCredit: ResetCredit,
    executable: string,
    nowMs: number
  ): Promise<void> {
    this.activeProfiles.add(observedProfile.id)
    let lease: RedemptionLease | null = null
    try {
      const profile = this.revalidateSettings(observedProfile, observedCredit, nowMs)
      lease = await this.options.redemptionLock.acquire(observedCredit)
      if (!lease || observedCredit.expiresAt === null) return

      const lockedRecord = this.options.ledger.getRecord(profile.id, observedCredit.id)
      if (!shouldAttemptRecord(lockedRecord, observedCredit.expiresAt, Date.now())) return
      const intent = await this.options.ledger.ensureIntent(profile.id, observedCredit, nowMs)

      let freshCredit: ResetCredit | null = null
      try {
        const fresh = await this.options.sessions.readResetCredits(profile, executable)
        freshCredit =
          fresh.credits?.find(
            (credit) =>
              credit.id === observedCredit.id &&
              credit.expiresAt === observedCredit.expiresAt &&
              credit.resetType === 'codexRateLimits' &&
              credit.status === 'available'
          ) ?? null
      } catch (error) {
        await this.recordPreflightFailure(profile, observedCredit, error, nowMs)
        return
      }

      const recoveringUncertainAttempt =
        lockedRecord?.status === 'uncertain' && lockedRecord.attempts > 0
      if (!freshCredit && !recoveringUncertainAttempt) {
        await this.options.ledger.markOutcome(profile.id, observedCredit.id, 'noCredit', nowMs)
        await this.options.ledger.addEvent(
          profile.id,
          observedCredit.id,
          'warning',
          `${profile.name}: the scheduled reset is no longer available.`,
          nowMs
        )
        this.options.onChange()
        return
      }

      const finalCredit = freshCredit ?? observedCredit
      this.revalidateSettings(profile, finalCredit, Date.now())
      const authorizationRevision = this.options.settings.getRevision()

      await this.options.ledger.markAttempt(profile.id, observedCredit.id, Date.now())
      this.options.onChange()

      if (this.options.settings.getRevision() !== authorizationRevision) {
        await this.recordPreflightFailure(
          profile,
          observedCredit,
          new Error('Settings changed while the reset request was being prepared.'),
          Date.now()
        )
        return
      }

      let finalProfile: ProfileSettings
      try {
        finalProfile = this.revalidateSettings(profile, finalCredit, Date.now())
      } catch (error) {
        await this.recordPreflightFailure(profile, observedCredit, error, Date.now())
        return
      }

      try {
        const outcome = await this.options.sessions.consumeCredit(
          finalProfile,
          executable,
          observedCredit.id,
          intent.idempotencyKey
        )
        await this.options.ledger.markOutcome(profile.id, observedCredit.id, outcome)
        await this.handleOutcome(profile, observedCredit, outcome)
      } catch (error) {
        const message = errorMessage(error)
        await this.options.ledger.markError(profile.id, observedCredit.id, message)
        await this.options.ledger.addEvent(
          profile.id,
          observedCredit.id,
          'error',
          `${profile.name}: reset request was interrupted; the same idempotency key will be retried. ${message}`
        )
      }
      this.options.onChange()
      await this.options.onRefreshNeeded()
    } catch (error) {
      const message = errorMessage(error)
      await this.options.ledger.addEvent(
        observedProfile.id,
        observedCredit.id,
        'warning',
        `${observedProfile.name}: automatic reset use stopped before redemption. ${message}`
      )
      this.options.onChange()
    } finally {
      if (lease) {
        try {
          await lease.release()
        } catch (error) {
          await this.options.ledger.addEvent(
            observedProfile.id,
            observedCredit.id,
            'error',
            `${observedProfile.name}: could not release the redemption lock. ${errorMessage(error)}`
          )
          this.options.onChange()
        }
      }
      this.activeProfiles.delete(observedProfile.id)
    }
  }

  private revalidateSettings(
    observedProfile: ProfileSettings,
    credit: ResetCredit,
    nowMs: number
  ): ProfileSettings {
    const current = this.options.settings
      .get()
      .profiles.find((profile) => profile.id === observedProfile.id)
    if (!current || !current.enabled || !current.autoRedeemEnabled) {
      throw new Error('Automatic reset use was disabled before the request.')
    }
    if (current.codexHome !== observedProfile.codexHome) {
      throw new Error('Codex home changed before the reset request.')
    }
    if (!isCreditDue(current, credit, nowMs)) {
      throw new Error('Reset is outside the configured automatic-use window.')
    }
    return current
  }

  private async recordPreflightFailure(
    profile: ProfileSettings,
    credit: ResetCredit,
    error: unknown,
    timestamp: number
  ): Promise<void> {
    const message = errorMessage(error)
    await this.options.ledger.markPreflightError(profile.id, credit.id, message, timestamp)
    await this.options.ledger.addEvent(
      profile.id,
      credit.id,
      'error',
      `${profile.name}: could not re-check the reset before use. ${message}`,
      timestamp
    )
    this.options.onChange()
  }

  private async handleOutcome(
    profile: ProfileSettings,
    credit: ResetCredit,
    outcome: 'reset' | 'nothingToReset' | 'noCredit' | 'alreadyRedeemed'
  ): Promise<void> {
    if (outcome === 'reset' || outcome === 'alreadyRedeemed') {
      const message =
        outcome === 'reset'
          ? `${profile.name}: used ${credit.title ?? 'reset'} before it expired.`
          : `${profile.name}: confirmed the reset had already been used by this automation.`
      await this.options.ledger.addEvent(profile.id, credit.id, 'success', message)
      this.options.notify({ title: 'Codex reset used', body: message })
      return
    }

    if (outcome === 'nothingToReset') {
      const message = `${profile.name}: usage did not need resetting yet; Reset Net will retry before expiry.`
      await this.options.ledger.addEvent(profile.id, credit.id, 'info', message)
      if (this.options.ledger.getRecord(profile.id, credit.id)?.attempts === 1) {
        this.options.notify({ title: 'Reset not needed yet', body: message })
      }
      return
    }

    const message = `${profile.name}: Codex reported that the reset is no longer available.`
    await this.options.ledger.addEvent(profile.id, credit.id, 'warning', message)
    this.options.notify({ title: 'Codex reset unavailable', body: message })
  }
}

export function runtimeStatesForSettings(
  settings: AppSettings,
  states: ProfileRuntimeState[]
): ProfileRuntimeState[] {
  const ids = new Set(settings.profiles.map((profile) => profile.id))
  return states.filter((state) => ids.has(state.profileId))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
