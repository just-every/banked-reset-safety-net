import { describe, expect, it } from 'vitest'
import {
  parseConsumeOutcome,
  parseRateLimitsReadResult
} from '../src/main/codex/protocol'

describe('Codex app-server protocol normalization', () => {
  it('parses expiry details from account/rateLimits/read', () => {
    const result = parseRateLimitsReadResult({
      rateLimits: usageLimit('codex', null, 27, 300, 1_000),
      rateLimitsByLimitId: {
        spark: usageLimit('spark', 'Codex Spark', 4, 10_080, 2_000),
        codex: usageLimit('codex', null, 27, 300, 1_000)
      },
      rateLimitResetCredits: {
        availableCount: 1,
        credits: [
          {
            id: 'credit-1',
            resetType: 'codexRateLimits',
            status: 'available',
            grantedAt: 100,
            expiresAt: 200,
            title: 'Full reset',
            description: 'Granted reset'
          }
        ]
      }
    })

    expect(result.availableCount).toBe(1)
    expect(result.credits?.[0]).toMatchObject({ id: 'credit-1', expiresAt: 200 })
    expect(result.usageLimits).toEqual([
      expect.objectContaining({
        id: 'codex',
        primary: { usedPercent: 27, windowDurationMinutes: 300, resetsAt: 1_000 }
      }),
      expect.objectContaining({ id: 'spark', name: 'Codex Spark' })
    ])
  })

  it('rejects malformed normal usage instead of hiding it', () => {
    expect(() =>
      parseRateLimitsReadResult({
        rateLimits: usageLimit('codex', null, 101, 300, 1_000),
        rateLimitResetCredits: null
      })
    ).toThrow('rateLimits.primary.usedPercent is invalid')
  })

  it('rejects unknown redemption outcomes', () => {
    expect(() => parseConsumeOutcome({ outcome: 'maybe' })).toThrow('Unknown reset outcome')
  })
})

function usageLimit(
  limitId: string,
  limitName: string | null,
  usedPercent: number,
  windowDurationMins: number,
  resetsAt: number
): Record<string, unknown> {
  return {
    limitId,
    limitName,
    primary: { usedPercent, windowDurationMins, resetsAt },
    secondary: null,
    credits: null,
    individualLimit: null,
    planType: 'pro',
    rateLimitReachedType: null
  }
}
