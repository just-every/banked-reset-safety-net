import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { expiryWarningIdentity } from '../src/shared/expiryWarnings'
import {
  ExpiryWarningStore,
  pruneExpiryWarningRecords
} from '../src/main/notifications/expiryWarningStore'
import {
  emptyExpiryWarningState,
  EXPIRY_WARNING_RECORD_RETENTION_MS,
  EXPIRY_WARNING_STATE_VERSION,
  MAX_EXPIRY_WARNING_RECORDS,
  type ExpiryWarningStateRecord
} from '../src/main/notifications/expiryWarningStoreTypes'

const NOW_MS = 2_000_000_000_000
const NOW_SECONDS = NOW_MS / 1_000

describe('ExpiryWarningStore', () => {
  it('persists delivered and superseded stages across restart', async () => {
    const filePath = await temporaryStatePath()
    const reference = creditReference('credit-1', NOW_SECONDS + 1_800)
    const first = new ExpiryWarningStore(filePath)
    await first.initialize(NOW_MS)
    await first.recordStages(
      reference,
      [
        { stage: 'day-before', disposition: 'superseded' },
        { stage: 'use-by', disposition: 'delivered' }
      ],
      NOW_MS
    )

    const reloaded = new ExpiryWarningStore(filePath)
    await reloaded.initialize(NOW_MS)

    expect(reloaded.getRecord(reference.identity)?.stages).toEqual({
      'day-before': { disposition: 'superseded', recordedAt: NOW_MS },
      'use-by': { disposition: 'delivered', recordedAt: NOW_MS }
    })
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toMatchObject({
      version: EXPIRY_WARNING_STATE_VERSION
    })
  })

  it('serializes concurrent writes without losing independent stages', async () => {
    const filePath = await temporaryStatePath()
    const reference = creditReference('credit-1', NOW_SECONDS + 1_800)
    const store = new ExpiryWarningStore(filePath)
    await store.initialize(NOW_MS)

    await Promise.all([
      store.recordStages(
        reference,
        [{ stage: 'day-before', disposition: 'delivered' }],
        NOW_MS
      ),
      store.recordStages(
        reference,
        [{ stage: 'use-by', disposition: 'delivered' }],
        NOW_MS + 1
      )
    ])

    expect(store.getRecord(reference.identity)?.stages).toEqual({
      'day-before': { disposition: 'delivered', recordedAt: NOW_MS },
      'use-by': { disposition: 'delivered', recordedAt: NOW_MS + 1 }
    })
  })

  it('keeps changed expiries as distinct durable identities', async () => {
    const filePath = await temporaryStatePath()
    const first = creditReference('credit-1', NOW_SECONDS + 1_800)
    const second = creditReference('credit-1', NOW_SECONDS + 1_801)
    const store = new ExpiryWarningStore(filePath)
    await store.initialize(NOW_MS)

    await store.recordStages(
      first,
      [{ stage: 'day-before', disposition: 'delivered' }],
      NOW_MS
    )
    await store.recordStages(
      second,
      [{ stage: 'day-before', disposition: 'delivered' }],
      NOW_MS
    )

    expect(store.getRecords().map((record) => record.identity).sort()).toEqual(
      [first.identity, second.identity].sort()
    )
  })

  it('rejects malformed or identity-inconsistent persisted state', async () => {
    const filePath = await temporaryStatePath()
    await writeFile(
      filePath,
      JSON.stringify({
        version: EXPIRY_WARNING_STATE_VERSION,
        records: {
          wrong: {
            identity: 'wrong',
            resetType: 'codexRateLimits',
            creditId: 'credit-1',
            expiresAt: NOW_SECONDS + 1_800,
            stages: {}
          }
        }
      }),
      'utf8'
    )

    await expect(new ExpiryWarningStore(filePath).initialize(NOW_MS)).rejects.toThrow(
      'identity'
    )
  })

  it('prunes retained state to a fixed bound while prioritizing upcoming credits', () => {
    const data = emptyExpiryWarningState()
    const records = Array.from({ length: MAX_EXPIRY_WARNING_RECORDS + 2 }, (_, index) =>
      stateRecord(`credit-${index}`, NOW_SECONDS + index + 1)
    )
    for (const record of records) data.records[record.identity] = record

    expect(pruneExpiryWarningRecords(data, NOW_MS)).toBe(true)
    expect(Object.keys(data.records)).toHaveLength(MAX_EXPIRY_WARNING_RECORDS)
    expect(data.records[records[0]!.identity]).toBeDefined()
    expect(data.records[records.at(-1)!.identity]).toBeUndefined()
  })

  it('removes records after the bounded post-expiry retention period', () => {
    const data = emptyExpiryWarningState()
    const expired = stateRecord(
      'expired-credit',
      (NOW_MS - EXPIRY_WARNING_RECORD_RETENTION_MS) / 1_000 - 1
    )
    data.records[expired.identity] = expired

    expect(pruneExpiryWarningRecords(data, NOW_MS)).toBe(true)
    expect(data.records).toEqual({})
  })
})

async function temporaryStatePath(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'expiry-warning-state-'))
  return path.join(directory, 'notification-state.json')
}

function creditReference(creditId: string, expiresAt: number) {
  const credit = { id: creditId, resetType: 'codexRateLimits' as const, expiresAt }
  return {
    identity: expiryWarningIdentity(credit),
    resetType: credit.resetType,
    creditId,
    expiresAt
  }
}

function stateRecord(creditId: string, expiresAt: number): ExpiryWarningStateRecord {
  const reference = creditReference(creditId, expiresAt)
  return {
    ...reference,
    stages: {
      'day-before': {
        disposition: 'delivered',
        recordedAt: NOW_MS
      }
    }
  }
}
