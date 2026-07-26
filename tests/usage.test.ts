import { describe, expect, it } from 'vitest'
import { buildCreditUsePlans } from '../src/shared/creditPlanning'
import {
  calculateUsagePace,
  displayUsageLimits,
  formatUsagePaceDifference,
  formatUsagePercent,
  formatUsageWindowDuration,
  selectPlanningLimit
} from '../src/shared/usage'
import type { ResetCredit, UsageLimit, UsageWindow } from '../src/shared/types'

describe('usage pacing and reset planning', () => {
  const window: UsageWindow = {
    usedPercent: 25,
    windowDurationMinutes: 100,
    resetsAt: 10_000
  }

  it('compares usage consumed with time elapsed in the current window', () => {
    const pace = calculateUsagePace(window, 5_500)

    expect(pace.expectedUsedPercent).toBe(25)
    expect(pace.remainingPercent).toBe(75)
    expect(pace.status).toBe('on-pace')
    expect(pace.projectedExhaustionAt).toBe(10_000)
  })

  it('classifies meaningful overuse and underuse', () => {
    expect(calculateUsagePace({ ...window, usedPercent: 40 }, 5_500).status).toBe('over')
    expect(calculateUsagePace({ ...window, usedPercent: 10 }, 5_500).status).toBe('under')
  })

  it('uses projected exhaustion for the earliest credit when the current usage will run out', () => {
    const plans = buildCreditUsePlans(
      [credit('first', 9_000), credit('second', 21_800)],
      { ...window, usedPercent: 50 },
      30,
      5_500
    )

    expect(plans[0]).toMatchObject({
      recommendedAt: 7_000,
      recommendation: 'projected-exhaustion',
      useByAt: 7_200,
      normalResetsBeforeUse: 0
    })
    expect(plans[1]).toMatchObject({
      recommendedAt: 19_000,
      recommendation: 'balanced-spacing',
      normalResetsBeforeUse: 2
    })
  })

  it('balances multiple banked resets inside the hard-reset interval containing their deadlines', () => {
    const plans = buildCreditUsePlans(
      [credit('first', 12_060), credit('second', 15_060), credit('third', 21_060)],
      window,
      1,
      5_500
    )

    expect(plans).toMatchObject([
      { useByAt: 12_000, recommendedAt: 12_000, recommendation: 'use-by' },
      { useByAt: 15_000, recommendedAt: 14_000, recommendation: 'balanced-spacing' },
      { useByAt: 21_000, recommendedAt: 19_000, recommendation: 'balanced-spacing' }
    ])
  })

  it('moves an earlier use to make room when two credits share a tight deadline', () => {
    const plans = buildCreditUsePlans(
      [credit('first', 13_060), credit('second', 13_060)],
      window,
      1,
      5_500
    )

    expect(plans.map((plan) => plan.recommendedAt)).toEqual([11_500, 13_000])
    expect(plans.map((plan) => plan.recommendation)).toEqual([
      'balanced-spacing',
      'use-by'
    ])
  })

  it('falls back to the safety cutoff when Codex supplies no hard-reset interval', () => {
    const plans = buildCreditUsePlans(
      [credit('first', 20_000)],
      { ...window, windowDurationMinutes: null },
      30,
      5_500
    )

    expect(plans[0]).toMatchObject({
      recommendedAt: 18_200,
      recommendation: 'use-by'
    })
  })

  it('shows and plans from only the normal Codex limit', () => {
    const modelLimit: UsageLimit = {
      id: 'gpt-5.3-codex',
      name: 'GPT-5.3-Codex',
      primary: window,
      secondary: null,
      planType: 'pro',
      rateLimitReachedType: null
    }
    const codexLimit: UsageLimit = {
      id: 'codex',
      name: null,
      primary: window,
      secondary: null,
      planType: 'pro',
      rateLimitReachedType: null
    }

    expect(displayUsageLimits([modelLimit, codexLimit])).toEqual([codexLimit])
    expect(selectPlanningLimit([modelLimit])).toBeNull()
    expect(selectPlanningLimit([modelLimit, codexLimit])).toBe(codexLimit)
  })

  it('formats usage windows and percentages', () => {
    expect(formatUsageWindowDuration(10_080)).toBe('1-week')
    expect(formatUsageWindowDuration(300)).toBe('5-hour')
    expect(formatUsagePercent(12.25)).toBe('12.3%')
    expect(formatUsagePaceDifference(7.23)).toBe('7.2 pts ahead')
    expect(formatUsagePaceDifference(-6)).toBe('6.0 pts behind')
    expect(formatUsagePaceDifference(0)).toBe('At ideal pace')
    expect(formatUsagePaceDifference(null)).toBe('Timing unavailable')
  })
})

function credit(id: string, expiresAt: number): ResetCredit {
  return {
    id,
    resetType: 'codexRateLimits',
    status: 'available',
    grantedAt: 1,
    expiresAt,
    title: 'Full reset',
    description: null
  }
}
