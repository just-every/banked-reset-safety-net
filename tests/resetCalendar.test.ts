import { describe, expect, it } from 'vitest'
import { buildResetCalendar } from '../src/shared/resetCalendar'
import type { CreditUsePlan } from '../src/shared/usage'
import type { UsageWindow } from '../src/shared/types'

describe('reset calendar', () => {
  it('lays out complete local weeks with scheduled, banked-use, and expiry days', () => {
    const now = localSeconds(2026, 6, 18, 12)
    const weeklyWindow: UsageWindow = {
      usedPercent: 24,
      windowDurationMinutes: 10_080,
      resetsAt: localSeconds(2026, 6, 20, 9)
    }
    const plan = creditPlan(
      localSeconds(2026, 6, 27, 8, 30),
      localSeconds(2026, 6, 27, 9)
    )

    const calendar = buildResetCalendar(weeklyWindow, [plan], now)

    expect(calendar.days.length % 7).toBe(0)
    expect(new Date(calendar.days[0].timestamp * 1_000).getDay()).toBe(1)
    expect(new Date(calendar.days.at(-1)!.timestamp * 1_000).getDay()).toBe(0)
    expect(calendar.days.find(day(2026, 6, 18))?.isToday).toBe(true)
    expect(calendar.days.find(day(2026, 6, 20))?.events.map(({ kind }) => kind)).toEqual([
      'scheduled'
    ])
    expect(
      calendar.days.find(day(2026, 6, 27))?.events.map(({ kind }) => kind).sort()
    ).toEqual(['banked-expiry', 'banked-use', 'scheduled'])
  })

  it('does not invent scheduled resets without a usable normal interval', () => {
    const now = localSeconds(2026, 6, 18, 12)
    const calendar = buildResetCalendar(
      { usedPercent: 10, windowDurationMinutes: null, resetsAt: null },
      [creditPlan(localSeconds(2026, 6, 22, 8), localSeconds(2026, 6, 22, 9))],
      now
    )

    expect(
      calendar.days.flatMap(({ events }) => events).map(({ kind }) => kind)
    ).toEqual(['banked-use', 'banked-expiry'])
  })
})

function localSeconds(
  year: number,
  month: number,
  date: number,
  hours = 0,
  minutes = 0
): number {
  return new Date(year, month, date, hours, minutes).getTime() / 1_000
}

function day(year: number, month: number, date: number): (candidate: { timestamp: number }) => boolean {
  return (candidate) => {
    const value = new Date(candidate.timestamp * 1_000)
    return value.getFullYear() === year && value.getMonth() === month && value.getDate() === date
  }
}

function creditPlan(recommendedAt: number, expiresAt: number): CreditUsePlan {
  return {
    credit: {
      id: 'credit-1',
      resetType: 'codexRateLimits',
      status: 'available',
      grantedAt: 1,
      expiresAt,
      title: 'Full reset',
      description: null
    },
    useByAt: recommendedAt,
    recommendedAt,
    recommendation: 'use-by',
    normalResetsBeforeUse: 1
  }
}
