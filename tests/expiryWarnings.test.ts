import { describe, expect, it } from 'vitest'
import {
  EXPIRY_WARNING_DAY_SECONDS,
  expiryWarningIdentity,
  selectDueExpiryWarnings
} from '../src/shared/expiryWarnings'
import type {
  ProfileRuntimeState,
  ProfileSettings,
  ResetCredit
} from '../src/shared/types'

const NOW_SECONDS = 2_000_000

describe('expiry-warning policy', () => {
  it('selects the 24-hour stage at its exact boundary', () => {
    const profile = testProfile()
    const credit = testCredit(NOW_SECONDS + EXPIRY_WARNING_DAY_SECONDS)

    expect(selectDueExpiryWarnings([profile], [readyRuntime(profile.id, [credit])], NOW_SECONDS)).toEqual([
      expect.objectContaining({
        identity: expiryWarningIdentity(credit),
        creditId: credit.id,
        expiresAt: credit.expiresAt,
        dueStages: ['day-before'],
        profileIds: [profile.id],
        profileNames: [profile.name]
      })
    ])
  })

  it('emits no candidate before the first warning boundary', () => {
    const profile = testProfile()
    const credit = testCredit(NOW_SECONDS + EXPIRY_WARNING_DAY_SECONDS + 1)

    expect(
      selectDueExpiryWarnings([profile], [readyRuntime(profile.id, [credit])], NOW_SECONDS)
    ).toEqual([])
  })

  it('reports all crossed stages so catch-up can supersede the less urgent warning', () => {
    const profile = testProfile({ leadTimeMinutes: 30 })
    const credit = testCredit(NOW_SECONDS + 30 * 60)

    expect(selectDueExpiryWarnings([profile], [readyRuntime(profile.id, [credit])], NOW_SECONDS)).toEqual([
      expect.objectContaining({
        useByAt: NOW_SECONDS,
        dueStages: ['day-before', 'use-by']
      })
    ])
  })

  it('deduplicates one backend credit globally and uses the earliest configured use-by point', () => {
    const first = testProfile({ id: 'profile-a', name: 'Alpha', leadTimeMinutes: 30 })
    const second = testProfile({ id: 'profile-b', name: 'Beta', leadTimeMinutes: 60 })
    const credit = testCredit(NOW_SECONDS + 45 * 60)
    const candidates = selectDueExpiryWarnings(
      [second, first],
      [readyRuntime(first.id, [credit]), readyRuntime(second.id, [credit])],
      NOW_SECONDS
    )

    expect(candidates).toEqual([
      expect.objectContaining({
        identity: expiryWarningIdentity(credit),
        leadTimeMinutes: 60,
        useByAt: NOW_SECONDS - 15 * 60,
        profileIds: ['profile-a', 'profile-b'],
        profileNames: ['Alpha', 'Beta'],
        dueStages: ['day-before', 'use-by']
      })
    ])
  })

  it('treats the same credit ID with a changed expiry as a new identity', () => {
    const original = testCredit(NOW_SECONDS + 60)
    const changed = { ...original, expiresAt: NOW_SECONDS + 120 }

    expect(expiryWarningIdentity(original)).not.toBe(expiryWarningIdentity(changed))
  })

  it('requires an enabled ready profile and an available future Codex reset with expiry', () => {
    const enabled = testProfile({ id: 'enabled' })
    const disabled = testProfile({ id: 'disabled', enabled: false })
    const available = testCredit(NOW_SECONDS + 60)
    const ignoredCredits: ResetCredit[] = [
      { ...available, id: 'redeemed', status: 'redeemed' },
      { ...available, id: 'unknown-type', resetType: 'unknown' },
      { ...available, id: 'no-expiry', expiresAt: null },
      { ...available, id: 'expired', expiresAt: NOW_SECONDS }
    ]

    expect(
      selectDueExpiryWarnings(
        [enabled, disabled],
        [
          { ...readyRuntime(enabled.id, [available, ...ignoredCredits]), status: 'error' },
          readyRuntime(disabled.id, [available])
        ],
        NOW_SECONDS
      )
    ).toEqual([])

    expect(
      selectDueExpiryWarnings(
        [enabled],
        [readyRuntime(enabled.id, [available, ...ignoredCredits])],
        NOW_SECONDS
      ).map((candidate) => candidate.creditId)
    ).toEqual(['credit-1'])
  })
})

function testProfile(overrides: Partial<ProfileSettings> = {}): ProfileSettings {
  return {
    id: 'profile-1',
    name: 'Codex',
    codexHome: '/test/codex',
    enabled: true,
    autoRedeemEnabled: false,
    leadTimeMinutes: 30,
    ...overrides
  }
}

function testCredit(expiresAt: number): ResetCredit {
  return {
    id: 'credit-1',
    resetType: 'codexRateLimits',
    status: 'available',
    grantedAt: 1,
    expiresAt,
    title: 'Full reset',
    description: null
  }
}

function readyRuntime(profileId: string, credits: ResetCredit[]): ProfileRuntimeState {
  return {
    profileId,
    status: 'ready',
    usageLimits: [],
    availableCount: credits.length,
    credits,
    refreshedAt: 1,
    error: null
  }
}
