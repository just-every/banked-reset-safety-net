import { describe, expect, it } from 'vitest'
import { formatHomePathForDisplay } from '../src/shared/pathDisplay'
import { formatCountdown, formatTrayCountdown } from '../src/shared/time'

describe('countdown helpers', () => {
  it('formats full and compact countdowns', () => {
    const now = Date.UTC(2026, 6, 18, 0, 0, 0)
    const expiry = now / 1_000 + 3_661
    expect(formatCountdown(expiry, now)).toBe('1h 1m 1s')
    expect(formatTrayCountdown(expiry, now)).toBe('2h')
  })

  it('keeps account paths private in the visible UI', () => {
    expect(formatHomePathForDisplay('/Users/alex/.codex')).toBe('~/.codex')
    expect(formatHomePathForDisplay('/home/alex/.codex_work')).toBe('~/.codex_work')
    expect(formatHomePathForDisplay('C:\\Users\\alex\\.codex')).toBe('~\\.codex')
    expect(formatHomePathForDisplay('/srv/codex')).toBe('/srv/codex')
  })
})
