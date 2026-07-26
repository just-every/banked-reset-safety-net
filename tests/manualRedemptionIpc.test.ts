import { describe, expect, it } from 'vitest'
import {
  parseManualAcknowledgeArguments,
  parseManualCancelArguments,
  parseManualConfirmArguments,
  parseManualPrepareArguments
} from '../src/main/manual/manualRedemptionIpc'

describe('manual redemption IPC boundary', () => {
  it('accepts only the documented identifiers and exact phrase', () => {
    expect(parseManualPrepareArguments(['profile-1', 'credit-1'])).toEqual({
      profileId: 'profile-1',
      creditId: 'credit-1'
    })
    expect(parseManualAcknowledgeArguments(['challenge-1'])).toEqual({
      challengeId: 'challenge-1'
    })
    expect(parseManualConfirmArguments(['challenge-1', 'USE RESET ABCD1234'])).toEqual({
      challengeId: 'challenge-1',
      exactResponse: 'USE RESET ABCD1234'
    })
    expect(parseManualCancelArguments(['challenge-1'])).toEqual({
      challengeId: 'challenge-1'
    })
  })

  it('rejects malformed prepare arguments without accepting authority fields', () => {
    const invalidValues: unknown[][] = [
      [],
      ['profile-1'],
      ['profile-1', 'credit-1', { expiresAt: 1 }],
      [null, 'credit-1'],
      ['profile-1', ''],
      ['profile-1', { id: 'credit-1' }]
    ]
    for (const values of invalidValues) {
      expect(() => parseManualPrepareArguments(values)).toThrow()
    }
  })

  it('rejects malformed confirmation arguments', () => {
    const invalidValues: unknown[][] = [
      [],
      ['challenge-1'],
      ['challenge-1', ''],
      ['challenge-1', 'USE RESET CODE', { account: 'forged' }],
      [1, 'USE RESET CODE'],
      ['challenge-1', 1]
    ]
    for (const values of invalidValues) {
      expect(() => parseManualConfirmArguments(values)).toThrow()
    }
  })
})
