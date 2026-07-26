import { describe, expect, it } from 'vitest'
import {
  findNextScheduledReset,
  findNextScheduledResetForProfile
} from '../src/shared/resetSchedule'
import type { ProfileRuntimeState, ProfileSettings, UsageLimit } from '../src/shared/types'

describe('next scheduled reset', () => {
  it('prefers an earlier normal reset over a later banked reset', () => {
    const profile = settings({ autoRedeemEnabled: true, leadTimeMinutes: 30 })
    const runtime = runtimeState(usageLimit(200), [credit(3_000)])

    expect(findNextScheduledReset([runtime], [profile], 100)).toEqual({
      profileId: profile.id,
      kind: 'normal',
      occursAt: 200
    })
  })

  it('uses the automatic banked-reset due time when it comes first', () => {
    const profile = settings({ autoRedeemEnabled: true, leadTimeMinutes: 1 })
    const runtime = runtimeState(usageLimit(500), [credit(200)])

    expect(findNextScheduledResetForProfile(runtime, profile, 100)).toEqual({
      profileId: profile.id,
      kind: 'banked',
      occursAt: 140
    })
  })

  it('selects the earliest per-profile reset across multiple homes', () => {
    const first = settings({ id: 'profile-1', autoRedeemEnabled: true, leadTimeMinutes: 1 })
    const second = settings({ id: 'profile-2', autoRedeemEnabled: false })
    const firstRuntime = runtimeState(usageLimit(500), [credit(200)], first.id)
    const secondRuntime = runtimeState(usageLimit(120), [], second.id)

    expect(findNextScheduledReset([firstRuntime, secondRuntime], [first, second], 100)).toEqual({
      profileId: second.id,
      kind: 'normal',
      occursAt: 120
    })
  })

  it('does not present reminder-only credits or unavailable usage as scheduled resets', () => {
    const profile = settings({ autoRedeemEnabled: false })
    const unavailable = { ...runtimeState(usageLimit(200), [credit(150)]), status: 'error' as const }

    expect(findNextScheduledReset([unavailable], [profile], 100)).toBeNull()
    expect(
      findNextScheduledReset([runtimeState(null, [credit(150)])], [profile], 100)
    ).toBeNull()
  })

  it('reports an overdue automatic banked reset as due now, not at expiry', () => {
    const profile = settings({ autoRedeemEnabled: true, leadTimeMinutes: 1 })
    const runtime = runtimeState(null, [credit(150)])

    expect(findNextScheduledReset([runtime], [profile], 100)?.occursAt).toBe(100)
  })
})

function settings(overrides: Partial<ProfileSettings> = {}): ProfileSettings {
  return {
    id: 'profile-1',
    name: 'Primary',
    codexHome: '/tmp/.codex',
    enabled: true,
    autoRedeemEnabled: false,
    leadTimeMinutes: 30,
    ...overrides
  }
}

function runtimeState(
  limit: UsageLimit | null,
  credits: ProfileRuntimeState['credits'],
  profileId = 'profile-1'
): ProfileRuntimeState {
  return {
    profileId,
    status: 'ready',
    usageLimits: limit ? [limit] : [],
    availableCount: credits.length,
    credits,
    refreshedAt: 1,
    error: null
  }
}

function usageLimit(resetsAt: number): UsageLimit
function usageLimit(resetsAt: null): null
function usageLimit(resetsAt: number | null): UsageLimit | null {
  if (resetsAt === null) return null
  return {
    id: 'codex',
    name: 'Codex',
    primary: { usedPercent: 20, windowDurationMinutes: 100, resetsAt },
    secondary: null,
    planType: 'pro',
    rateLimitReachedType: null
  }
}

function credit(expiresAt: number): ProfileRuntimeState['credits'][number] {
  return {
    id: `credit-${expiresAt}`,
    resetType: 'codexRateLimits',
    status: 'available',
    grantedAt: 1,
    expiresAt,
    title: 'Full reset',
    description: null
  }
}
