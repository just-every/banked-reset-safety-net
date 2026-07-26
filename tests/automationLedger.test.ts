import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
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
    await ledger.ensureIntent(
      'profile-1',
      {
        id: 'credit-1',
        resetType: 'codexRateLimits',
        status: 'available',
        grantedAt: 1_000,
        expiresAt: 2_000,
        title: 'Full reset',
        description: null
      },
      { accountFingerprint: 'account-1', canonicalCodexHome: '/tmp/codex' }
    )

    await Promise.all(
      Array.from({ length: 20 }, () =>
        ledger.markAttempt('profile-1', 'credit-1', 'automatic')
      )
    )

    expect(ledger.getRecord('profile-1', 'credit-1')?.attempts).toBe(20)
  })

  it('migrates a valid v1 ledger in memory without rewriting it on a read-only launch', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'reset-net-ledger-v1-'))
    const ledgerPath = path.join(directory, 'ledger.json')
    const original = `${JSON.stringify({
      version: 1,
      records: {
        'profile-1:credit-1': record('profile-1', 'existing-key')
      },
      events: []
    }, null, 2)}\n`
    await writeFile(ledgerPath, original, 'utf8')

    const ledger = new AutomationLedger(ledgerPath)
    await ledger.initialize()

    expect(await readFile(ledgerPath, 'utf8')).toBe(original)
    expect(ledger.getRecord('profile-1', 'credit-1')).toMatchObject({
      idempotencyKey: 'existing-key',
      accountFingerprint: null,
      canonicalCodexHome: null
    })

    await ledger.addEvent('profile-1', null, 'info', 'A real mutation')
    expect(JSON.parse(await readFile(ledgerPath, 'utf8'))).toMatchObject({ version: 2 })
  })

  it('fails closed when one active credit identity appears under different accounts', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'reset-net-ledger-account-conflict-'))
    const ledger = new AutomationLedger(path.join(directory, 'ledger.json'))
    await ledger.initialize()
    const value = {
      id: 'credit-1',
      resetType: 'codexRateLimits' as const,
      status: 'available' as const,
      grantedAt: 1_000,
      expiresAt: 2_000,
      title: 'Full reset',
      description: null
    }
    await ledger.ensureIntent('profile-1', value, {
      accountFingerprint: 'account-1',
      canonicalCodexHome: '/tmp/first'
    })

    await expect(
      ledger.ensureIntent('profile-2', value, {
        accountFingerprint: 'account-2',
        canonicalCodexHome: '/tmp/second'
      })
    ).rejects.toThrow('different Codex account')
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
