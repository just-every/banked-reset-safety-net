import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { AutomationLedger } from '../src/main/automation/automationLedger'

describe('automation ledger persistence', () => {
  it('fails closed when active records disagree on one credit idempotency key', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'reset-net-ledger-invalid-'))
    const ledgerPath = path.join(directory, 'ledger.json')
    await writeFile(
      ledgerPath,
      JSON.stringify({
        version: 1,
        records: {
          'profile-1:credit-1': record('profile-1', 'first-key'),
          'profile-2:credit-1': record('profile-2', 'second-key')
        },
        events: []
      }),
      'utf8'
    )

    await expect(new AutomationLedger(ledgerPath).initialize()).rejects.toThrow(
      'Automation ledger has conflicting active idempotency keys for one reset.'
    )
  })

  it('serializes concurrent mutations without losing attempts', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'reset-net-ledger-concurrent-'))
    const ledger = new AutomationLedger(path.join(directory, 'ledger.json'))
    await ledger.initialize()
    await ledger.ensureIntent('profile-1', {
      id: 'credit-1',
      resetType: 'codexRateLimits',
      status: 'available',
      grantedAt: 1_000,
      expiresAt: 2_000,
      title: 'Full reset',
      description: null
    })

    await Promise.all(
      Array.from({ length: 20 }, () => ledger.markAttempt('profile-1', 'credit-1'))
    )

    expect(ledger.getRecord('profile-1', 'credit-1')?.attempts).toBe(20)
  })
})

function record(profileId: string, idempotencyKey: string): Record<string, unknown> {
  return {
    profileId,
    creditId: 'credit-1',
    creditExpiresAt: 2_000,
    idempotencyKey,
    status: 'armed',
    attempts: 0,
    createdAt: 1_000,
    lastAttemptAt: null,
    lastOutcome: null,
    lastError: null,
    completedAt: null
  }
}
