import type {
  ConsumeResetOutcome,
  ManualUseResult,
  ProfileSettings,
  ResetCredit
} from '../../shared/types'
import type { RedemptionSnapshot } from '../codex/codexSession'
import {
  requireRedemptionAccountBinding,
  sameAccountBinding
} from './accountBinding'
import type { AutomationRecord } from './automationLedger'
import { isTerminal } from './automationLedgerRecords'
import type { RedemptionAuthorizationKind } from './automationLedgerTypes'
import type {
  AutomationRunnerOptions,
  VerifiedManualRedemptionAuthorization
} from './automationRunnerTypes'
import { shouldAttemptRecord } from './decision'
import {
  bindingFromRecord,
  creditFromRecord,
  type NewAttemptAuthorization,
  requireFreshEarliest,
  requireManualProfile,
  requireMatchingPreparedBinding,
  requireNoConflictingCreditIdentity,
  revalidateNewAuthorization,
  revalidateRecoveryAuthorization
} from './redemptionAuthorization'
import {
  errorMessage,
  RedemptionOutcomeRecorder
} from './redemptionOutcomeRecorder'
import type { RedemptionLease } from './redemptionLock'

export class GuardedRedemptionExecutor {
  private readonly outcomes: RedemptionOutcomeRecorder

  constructor(private readonly options: AutomationRunnerOptions) {
    this.outcomes = new RedemptionOutcomeRecorder(options)
  }

  async executeManual(
    authorization: VerifiedManualRedemptionAuthorization
  ): Promise<ManualUseResult> {
    const executable = this.options.getResolvedExecutable()
    if (!executable) throw new Error('Codex CLI is not available.')
    const profile = requireManualProfile(this.options.settings, authorization)
    return this.executeNewAttempt({
      kind: 'manual',
      profile,
      credit: authorization.credit,
      executable,
      settingsRevision: authorization.settingsRevision,
      accountBinding: authorization.accountBinding
    })
  }

  executeAutomatic(
    profile: ProfileSettings,
    credit: ResetCredit,
    executable: string,
    settingsRevision: number
  ): Promise<ManualUseResult> {
    return this.executeNewAttempt({
      kind: 'automatic',
      profile,
      credit,
      executable,
      settingsRevision
    })
  }

  async recoverUncertainAttempt(
    observedProfile: ProfileSettings,
    observedRecord: AutomationRecord,
    executable: string
  ): Promise<void> {
    const credit = creditFromRecord(observedRecord)
    let lease: RedemptionLease | null = null
    try {
      const settingsRevision = this.options.settings.getRevision()
      const profile = revalidateRecoveryAuthorization(
        this.options.settings,
        observedProfile,
        observedRecord
      )
      lease = await this.options.redemptionLock.acquire(credit)
      if (!lease) return
      const record = this.options.ledger.getRecord(profile.id, credit.id)
      if (
        !record ||
        record.status !== 'uncertain' ||
        record.attempts < 1 ||
        record.idempotencyKey !== observedRecord.idempotencyKey
      ) {
        return
      }

      const firstSnapshot = await this.options.sessions.readRedemptionSnapshot(
        profile,
        executable
      )
      const firstBinding = requireRedemptionAccountBinding(firstSnapshot)
      const storedBinding = bindingFromRecord(record)
      if (storedBinding) {
        if (!sameAccountBinding(storedBinding, firstBinding)) {
          throw new Error('Codex account or canonical home changed before retry.')
        }
        requireNoConflictingCreditIdentity(firstSnapshot, credit)
      } else {
        requireFreshEarliest(firstSnapshot, credit)
        await this.options.ledger.ensureIntent(profile.id, credit, firstBinding)
      }

      await this.options.ledger.markAttempt(
        profile.id,
        credit.id,
        record.authorizationKind ?? 'automatic'
      )
      this.options.onChange()

      const finalSnapshot = await this.options.sessions.readRedemptionSnapshot(
        profile,
        executable
      )
      const finalBinding = requireRedemptionAccountBinding(finalSnapshot)
      if (!sameAccountBinding(firstBinding, finalBinding)) {
        throw new Error('Codex account or canonical home changed before retry.')
      }
      if (storedBinding) requireNoConflictingCreditIdentity(finalSnapshot, credit)
      else requireFreshEarliest(finalSnapshot, credit)

      try {
        await this.sendAuthorizedRequest(
          profile,
          credit,
          executable,
          record.idempotencyKey,
          record.authorizationKind ?? 'automatic',
          () => {
            if (this.options.settings.getRevision() !== settingsRevision) {
              throw new Error(
                'Settings changed while interrupted reset recovery was prepared.'
              )
            }
            return revalidateRecoveryAuthorization(
              this.options.settings,
              observedProfile,
              record
            )
          }
        )
      } catch {
        return
      }
    } catch (error) {
      await this.options.ledger.markError(
        observedProfile.id,
        observedRecord.creditId,
        errorMessage(error)
      )
      await this.options.ledger.addEvent(
        observedProfile.id,
        observedRecord.creditId,
        'error',
        `${observedProfile.name}: interrupted reset recovery failed closed. ${errorMessage(error)}`
      )
      this.options.onChange()
    } finally {
      await this.outcomes.releaseLease(lease, observedProfile, credit)
    }
  }

  async expireRecord(record: AutomationRecord, nowMs: number): Promise<void> {
    await this.options.ledger.markExpired(record.profileId, record.creditId, nowMs)
    this.options.onChange()
  }

  addStoppedEvent(
    profile: ProfileSettings,
    credit: ResetCredit,
    error: unknown
  ): Promise<void> {
    return this.outcomes.addStoppedEvent(profile, credit, error)
  }

  private async executeNewAttempt(
    authorization: NewAttemptAuthorization
  ): Promise<ManualUseResult> {
    const { profile: observedProfile, credit: observedCredit, executable } = authorization
    let lease: RedemptionLease | null = null
    try {
      const profile = revalidateNewAuthorization(
        this.options.settings,
        authorization,
        Date.now()
      )
      lease = await this.options.redemptionLock.acquire(observedCredit)
      if (!lease) throw new Error('Another process is already handling this reset.')
      if (observedCredit.expiresAt === null) throw new Error('A reset expiry is required.')

      const lockedRecord = this.options.ledger.getRecord(profile.id, observedCredit.id)
      if (lockedRecord && isTerminal(lockedRecord.status)) {
        throw new Error('This reset already has a terminal ledger outcome.')
      }
      if (
        authorization.kind === 'automatic' &&
        !shouldAttemptRecord(lockedRecord, observedCredit.expiresAt, Date.now())
      ) {
        throw new Error('This automatic reset attempt is not due for retry.')
      }

      const firstSnapshot = await this.options.sessions.readRedemptionSnapshot(
        profile,
        executable
      )
      const firstBinding = requireRedemptionAccountBinding(firstSnapshot)
      requireMatchingPreparedBinding(authorization, firstBinding)
      requireFreshEarliest(firstSnapshot, observedCredit)

      const intent = await this.options.ledger.ensureIntent(
        profile.id,
        observedCredit,
        firstBinding
      )
      await this.options.ledger.markAttempt(
        profile.id,
        observedCredit.id,
        authorization.kind
      )
      this.options.onChange()

      let finalSnapshot: RedemptionSnapshot
      try {
        finalSnapshot = await this.options.sessions.readRedemptionSnapshot(
          profile,
          executable
        )
        const finalBinding = requireRedemptionAccountBinding(finalSnapshot)
        if (!sameAccountBinding(firstBinding, finalBinding)) {
          throw new Error('Codex account or canonical home changed before reset use.')
        }
        requireMatchingPreparedBinding(authorization, finalBinding)
        requireFreshEarliest(finalSnapshot, observedCredit)
      } catch (error) {
        await this.outcomes.recordPreflightFailure(
          profile,
          observedCredit,
          error,
          Date.now()
        )
        throw error
      }

      return await this.sendAuthorizedRequest(
        profile,
        observedCredit,
        executable,
        intent.idempotencyKey,
        authorization.kind,
        () => revalidateNewAuthorization(this.options.settings, authorization, Date.now())
      )
    } finally {
      await this.outcomes.releaseLease(lease, observedProfile, observedCredit)
    }
  }

  private async sendAuthorizedRequest(
    profile: ProfileSettings,
    credit: ResetCredit,
    executable: string,
    idempotencyKey: string,
    kind: RedemptionAuthorizationKind,
    authorizeBeforeSend: () => ProfileSettings
  ): Promise<ManualUseResult> {
    let authorizedAtWrite = false
    let outcome: ConsumeResetOutcome
    try {
      outcome = await this.options.sessions.consumeCredit(
        profile,
        executable,
        credit.id,
        idempotencyKey,
        () => {
          authorizeBeforeSend()
          authorizedAtWrite = true
        }
      )
    } catch (error) {
      if (authorizedAtWrite) {
        await this.outcomes.recordInterruptedAttempt(profile, credit, error)
      } else {
        await this.outcomes.recordPreflightFailure(profile, credit, error, Date.now())
      }
      throw error
    }

    await this.options.ledger.markOutcome(profile.id, credit.id, outcome)
    const message = await this.outcomes.handleOutcome(profile, credit, outcome, kind)
    this.options.onChange()
    await this.options.onRefreshNeeded()
    return { outcome, message }
  }
}
