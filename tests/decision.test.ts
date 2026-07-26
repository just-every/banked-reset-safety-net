import { describe, expect, it } from 'vitest'
import {
  earliestAvailableCreditFromCredits,
  isCreditDue,
  retryDelayMs,
  shouldAttemptRecord
} from '../src/main/automation/decision'
import type { AutomationRecord } from '../src/main/automation/automationLedger'
import type { ProfileSettings, ResetCredit } from '../src/shared/types'

const profile: ProfileSettings = {
  id: 'profile-1',
  name: 'Codex',
  codexHome: '/tmp/codex',
  enabled: true,
  autoRedeemEnabled: true,
  leadTimeMinutes: 30
}

const credit: ResetCredit = {
  id: 'credit-1',
  resetType: 'codexRateLimits',
  status: 'available',
  grantedAt: 1,
  expiresAt: 10_000,
  title: 'Full reset',
  description: null
}

describe('automation decisions', () => {
  it('arms at the configured lead time and never after expiry', () => {
    expect(isCreditDue(profile, credit, (10_000 - 1_800) * 1_000)).toBe(true)
    expect(isCreditDue(profile, credit, 10_000 * 1_000)).toBe(false)
  })

  it('hard-stops automatic use when more than one hour remains', () => {
    const oneHourProfile = { ...profile, leadTimeMinutes: 60 }
    const unsafePersistedProfile = { ...profile, leadTimeMinutes: 24 * 60 }
    expect(isCreditDue(oneHourProfile, credit, (10_000 - 3_600) * 1_000)).toBe(true)
    expect(
      isCreditDue(unsafePersistedProfile, credit, (10_000 - 3_600) * 1_000 - 1)
    ).toBe(false)
  })

  it('does not retry terminal records', () => {
    expect(shouldAttemptRecord(record('redeemed'), 10_000, 9_500_000)).toBe(false)
  })

  it('uses shorter retries in the final ten minutes', () => {
    expect(retryDelayMs(10_000, 9_500_000)).toBe(60_000)
    expect(retryDelayMs(10_000, 8_000_000)).toBe(300_000)
  })

  it('selects the true earliest credit independent of backend order', () => {
    const later = { ...credit, id: 'later', expiresAt: 10_100 }
    const earlier = { ...credit, id: 'earlier', expiresAt: 10_000 }
    expect(earliestAvailableCreditFromCredits([later, earlier], 1_000)?.id).toBe('earlier')
    expect(
      earliestAvailableCreditFromCredits(
        [
          { ...credit, id: 'z-credit' },
          { ...credit, id: 'a-credit' }
        ],
        1_000
      )?.id
    ).toBe('a-credit')
  })
})

function record(status: AutomationRecord['status']): AutomationRecord {
  return {
    profileId: 'profile-1',
    creditId: 'credit-1',
    creditExpiresAt: 10_000,
    idempotencyKey: 'key-1',
    status,
    attempts: 1,
    createdAt: 1,
    lastAttemptAt: 1,
    lastOutcome: status === 'redeemed' ? 'reset' : null,
    lastError: null,
    completedAt: status === 'redeemed' ? 2 : null,
    accountFingerprint: 'account-1',
    canonicalCodexHome: '/tmp/codex',
    authorizationKind: 'automatic'
  }
}
