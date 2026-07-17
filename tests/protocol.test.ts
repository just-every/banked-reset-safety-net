import { describe, expect, it } from 'vitest'
import {
  parseConsumeOutcome,
  parseRateLimitResetCredits
} from '../src/main/codex/protocol'

describe('Codex app-server protocol normalization', () => {
  it('parses expiry details from account/rateLimits/read', () => {
    const result = parseRateLimitResetCredits({
      rateLimits: {},
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
  })

  it('rejects unknown redemption outcomes', () => {
    expect(() => parseConsumeOutcome({ outcome: 'maybe' })).toThrow('Unknown reset outcome')
  })
})
