import type { ProfileSettings, ResetCredit } from '../../shared/types'
import type { RedemptionSnapshot } from '../codex/codexSession'
import type { SettingsStore } from '../settings/settingsStore'
import {
  sameAccountBinding,
  type RedemptionAccountBinding
} from './accountBinding'
import type { AutomationRecord } from './automationLedger'
import {
  earliestAvailableCreditFromCredits,
  isCreditDue,
  sameCreditIdentity
} from './decision'
import type { VerifiedManualRedemptionAuthorization } from './automationRunnerTypes'

export interface NewAttemptAuthorization {
  kind: 'automatic' | 'manual'
  profile: ProfileSettings
  credit: ResetCredit
  executable: string
  settingsRevision: number
  accountBinding?: RedemptionAccountBinding
}

export function requireFreshEarliest(
  snapshot: RedemptionSnapshot,
  observedCredit: ResetCredit
): void {
  const freshEarliest = earliestAvailableCreditFromCredits(
    snapshot.rateLimits.credits ?? [],
    Date.now()
  )
  if (!sameCreditIdentity(freshEarliest, observedCredit)) {
    throw new Error('The selected reset is no longer the earliest available exact credit.')
  }
}

export function requireMatchingPreparedBinding(
  authorization: NewAttemptAuthorization,
  binding: RedemptionAccountBinding
): void {
  if (
    authorization.kind === 'manual' &&
    (!authorization.accountBinding ||
      !sameAccountBinding(authorization.accountBinding, binding))
  ) {
    throw new Error('The confirmed account or canonical home changed before manual reset use.')
  }
}

export function revalidateNewAuthorization(
  settings: SettingsStore,
  authorization: NewAttemptAuthorization,
  nowMs: number
): ProfileSettings {
  const current = settings
    .get()
    .profiles.find((profile) => profile.id === authorization.profile.id)
  if (!current || !current.enabled) {
    throw new Error('Reset tracking was disabled before the request.')
  }
  if (current.codexHome !== authorization.profile.codexHome) {
    throw new Error('Codex home changed before the reset request.')
  }
  if (settings.getRevision() !== authorization.settingsRevision) {
    throw new Error('Settings changed while the reset request was being prepared.')
  }
  if (
    authorization.credit.expiresAt === null ||
    authorization.credit.expiresAt * 1_000 <= nowMs
  ) {
    throw new Error('The reset expired before the request.')
  }
  if (authorization.kind === 'automatic') {
    if (!current.autoRedeemEnabled) {
      throw new Error('Automatic reset use was disabled before the request.')
    }
    if (!isCreditDue(current, authorization.credit, nowMs)) {
      throw new Error('Reset is outside the configured automatic-use window.')
    }
  }
  return current
}

export function requireManualProfile(
  settings: SettingsStore,
  authorization: VerifiedManualRedemptionAuthorization
): ProfileSettings {
  const profile = settings
    .get()
    .profiles.find((candidate) => candidate.id === authorization.profileId)
  if (!profile || !profile.enabled) {
    throw new Error('Reset tracking was disabled before manual reset use.')
  }
  if (profile.codexHome !== authorization.codexHome) {
    throw new Error('Codex home changed before manual reset use.')
  }
  if (settings.getRevision() !== authorization.settingsRevision) {
    throw new Error('Settings changed after the manual reset was reviewed.')
  }
  return profile
}

export function revalidateRecoveryAuthorization(
  settings: SettingsStore,
  observedProfile: ProfileSettings,
  record: AutomationRecord
): ProfileSettings {
  const current = settings
    .get()
    .profiles.find((profile) => profile.id === observedProfile.id)
  if (!current || !current.enabled) {
    throw new Error('Reset tracking was disabled before recovery.')
  }
  if (current.codexHome !== observedProfile.codexHome) {
    throw new Error('Codex home changed before recovery.')
  }
  if (record.creditExpiresAt * 1_000 <= Date.now()) {
    throw new Error('The reset expired before recovery.')
  }
  if (
    (record.authorizationKind ?? 'automatic') === 'automatic' &&
    !current.autoRedeemEnabled
  ) {
    throw new Error('Automatic reset use was disabled before recovery.')
  }
  return current
}

export function canRecover(profile: ProfileSettings, record: AutomationRecord): boolean {
  if (!profile.enabled) return false
  return (record.authorizationKind ?? 'automatic') === 'manual' || profile.autoRedeemEnabled
}

export function bindingFromRecord(
  record: AutomationRecord
): RedemptionAccountBinding | null {
  if (record.accountFingerprint === null || record.canonicalCodexHome === null) return null
  return {
    accountFingerprint: record.accountFingerprint,
    canonicalCodexHome: record.canonicalCodexHome
  }
}

export function creditFromRecord(record: AutomationRecord): ResetCredit {
  return {
    id: record.creditId,
    resetType: 'codexRateLimits',
    status: 'available',
    grantedAt: 0,
    expiresAt: record.creditExpiresAt,
    title: null,
    description: null
  }
}

export function requireNoConflictingCreditIdentity(
  snapshot: RedemptionSnapshot,
  expected: ResetCredit
): void {
  const matchingId = snapshot.rateLimits.credits?.find((credit) => credit.id === expected.id)
  if (matchingId && !sameCreditIdentity(matchingId, expected)) {
    throw new Error('Codex returned a conflicting identity for the interrupted reset.')
  }
}
