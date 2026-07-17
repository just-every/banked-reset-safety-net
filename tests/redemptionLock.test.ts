import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { AutomationLedger } from '../src/main/automation/automationLedger'
import {
  idempotencyKeyForCredit,
  redemptionLockKey
} from '../src/main/automation/redemptionIdentity'
import { RedemptionLock, type RedemptionLease } from '../src/main/automation/redemptionLock'
import type { ResetCredit } from '../src/shared/types'

describe('redemption identity and locking', () => {
  it('uses one deterministic idempotency UUID for the same backend credit', () => {
    const key = idempotencyKeyForCredit(credit())
    expect(key).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
    expect(idempotencyKeyForCredit({ ...credit() })).toBe(key)
    expect(idempotencyKeyForCredit({ ...credit(), expiresAt: 20_001 })).not.toBe(key)
  })

  it('persists the same idempotency key across local profiles', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'reset-net-ledger-identity-'))
    const ledger = new AutomationLedger(path.join(directory, 'ledger.json'))
    await ledger.initialize()
    const [first, second] = await Promise.all([
      ledger.ensureIntent('profile-1', credit()),
      ledger.ensureIntent('profile-2', credit())
    ])
    expect(second.idempotencyKey).toBe(first.idempotencyKey)
  })

  it('allows exactly one process-level lease for a credit identity', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'reset-net-lock-'))
    const firstLock = new RedemptionLock(directory)
    const secondLock = new RedemptionLock(directory)
    const leases = await Promise.all([firstLock.acquire(credit()), secondLock.acquire(credit())])
    const acquired = leases.filter((lease): lease is RedemptionLease => lease !== null)

    expect(acquired).toHaveLength(1)
    await acquired[0]!.release()
    const reacquired = await secondLock.acquire(credit())
    expect(reacquired).not.toBeNull()
    await reacquired!.release()
  })

  it('does not serialize unrelated credits', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'reset-net-lock-parallel-'))
    const lock = new RedemptionLock(directory)
    const [first, second] = await Promise.all([
      lock.acquire(credit()),
      lock.acquire({ ...credit(), id: 'credit-2' })
    ])
    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    await Promise.all([first!.release(), second!.release()])
  })

  it('recovers an atomic lock left by a dead process', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'reset-net-stale-lock-'))
    const value = credit()
    const identityHash = redemptionLockKey(value)
    await mkdir(directory, { recursive: true })
    await writeFile(
      path.join(directory, `${identityHash}.lock`),
      JSON.stringify({
        version: 1,
        pid: 2_147_483_647,
        leaseId: 'dead-process',
        acquiredAt: 1,
        identityHash
      }),
      'utf8'
    )

    const lease = await new RedemptionLock(directory).acquire(value)
    expect(lease).not.toBeNull()
    await lease!.release()
  })
})

function credit(): ResetCredit {
  return {
    id: 'credit-1',
    resetType: 'codexRateLimits',
    status: 'available',
    grantedAt: 10_000,
    expiresAt: 20_000,
    title: 'Full reset',
    description: null
  }
}
