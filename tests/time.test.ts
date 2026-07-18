import { describe, expect, it } from 'vitest'
import { formatHomePathForDisplay } from '../src/shared/pathDisplay'
import { findNextExpiringCredit, formatCountdown, formatTrayCountdown } from '../src/shared/time'
import type { ProfileRuntimeState } from '../src/shared/types'

describe('countdown helpers', () => {
  it('formats full and compact countdowns', () => {
    const now = Date.UTC(2026, 6, 18, 0, 0, 0)
    const expiry = now / 1_000 + 3_661
    expect(formatCountdown(expiry, now)).toBe('1h 1m 1s')
    expect(formatTrayCountdown(expiry, now)).toBe('2h')
  })

  it('selects the earliest future available credit', () => {
    const profile = runtimeState([
      credit('later', 300),
      credit('redeemed', 50, 'redeemed'),
      credit('next', 100)
    ])
    expect(findNextExpiringCredit([profile], 10)?.credit.id).toBe('next')
  })

  it('keeps account paths private in the visible UI', () => {
    expect(formatHomePathForDisplay('/Users/alex/.codex')).toBe('~/.codex')
    expect(formatHomePathForDisplay('/home/alex/.codex_work')).toBe('~/.codex_work')
    expect(formatHomePathForDisplay('C:\\Users\\alex\\.codex')).toBe('~\\.codex')
    expect(formatHomePathForDisplay('/srv/codex')).toBe('/srv/codex')
  })
})

function runtimeState(credits: ProfileRuntimeState['credits']): ProfileRuntimeState {
  return {
    profileId: 'profile-1',
    status: 'ready',
    usageLimits: [],
    availableCount: credits.length,
    credits,
    refreshedAt: 1,
    error: null
  }
}

function credit(
  id: string,
  expiresAt: number,
  status: 'available' | 'redeemed' = 'available'
): ProfileRuntimeState['credits'][number] {
  return {
    id,
    resetType: 'codexRateLimits',
    status,
    grantedAt: 1,
    expiresAt,
    title: 'Full reset',
    description: null
  }
}
