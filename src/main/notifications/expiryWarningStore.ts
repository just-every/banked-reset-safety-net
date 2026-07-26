import type { ExpiryWarningCandidate } from '../../shared/expiryWarnings'
import { expiryWarningIdentity } from '../../shared/expiryWarnings'
import { readJsonFile, writeJsonFileAtomic } from '../persistence/jsonFile'
import {
  emptyExpiryWarningState,
  EXPIRY_WARNING_RECORD_RETENTION_MS,
  MAX_EXPIRY_WARNING_RECORDS,
  type ExpiryWarningStageUpdate,
  type ExpiryWarningStateData,
  type ExpiryWarningStateRecord
} from './expiryWarningStoreTypes'
import { parseExpiryWarningState } from './expiryWarningStoreValidation'

type ExpiryWarningCreditReference = Pick<
  ExpiryWarningCandidate,
  'identity' | 'resetType' | 'creditId' | 'expiresAt'
>

export class ExpiryWarningStore {
  private data: ExpiryWarningStateData | null = null
  private writeChain: Promise<void> = Promise.resolve()

  constructor(private readonly filePath: string) {}

  async initialize(nowMs = Date.now()): Promise<void> {
    const stored = await readJsonFile(this.filePath)
    this.data = stored === null ? emptyExpiryWarningState() : parseExpiryWarningState(stored)
    const pruned = pruneExpiryWarningRecords(this.data, nowMs)
    if (stored === null || pruned) await this.persist()
  }

  getRecord(identity: string): ExpiryWarningStateRecord | null {
    const record = this.requireData().records[identity]
    return record ? structuredClone(record) : null
  }

  getRecords(): ExpiryWarningStateRecord[] {
    return structuredClone(Object.values(this.requireData().records))
  }

  async recordStages(
    credit: ExpiryWarningCreditReference,
    updates: ExpiryWarningStageUpdate[],
    nowMs = Date.now()
  ): Promise<void> {
    if (updates.length === 0) return
    assertCreditReference(credit)
    assertUniqueStageUpdates(updates)
    if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
      throw new Error('Expiry-warning record time is invalid.')
    }

    await this.mutate((data) => {
      const existing = data.records[credit.identity]
      if (
        existing &&
        (existing.creditId !== credit.creditId ||
          existing.expiresAt !== credit.expiresAt ||
          existing.resetType !== credit.resetType)
      ) {
        throw new Error('Stored expiry-warning identity does not match the current credit.')
      }
      const record =
        existing ??
        ({
          identity: credit.identity,
          resetType: credit.resetType,
          creditId: credit.creditId,
          expiresAt: credit.expiresAt,
          stages: {}
        } satisfies ExpiryWarningStateRecord)

      for (const update of updates) {
        if (record.stages[update.stage]) continue
        record.stages[update.stage] = {
          disposition: update.disposition,
          recordedAt: nowMs
        }
      }
      data.records[credit.identity] = record
      pruneExpiryWarningRecords(data, nowMs)
    })
  }

  private async mutate(mutator: (data: ExpiryWarningStateData) => void): Promise<void> {
    const operation = this.writeChain.then(async () => {
      const next = structuredClone(this.requireData())
      mutator(next)
      await writeJsonFileAtomic(this.filePath, next)
      this.data = next
    })
    this.writeChain = operation.then(
      () => undefined,
      () => undefined
    )
    return operation
  }

  private requireData(): ExpiryWarningStateData {
    if (this.data === null) throw new Error('ExpiryWarningStore has not been initialized.')
    return this.data
  }

  private async persist(): Promise<void> {
    await writeJsonFileAtomic(this.filePath, this.requireData())
  }
}

export function pruneExpiryWarningRecords(
  data: ExpiryWarningStateData,
  nowMs: number
): boolean {
  let changed = false
  for (const [identity, record] of Object.entries(data.records)) {
    if (record.expiresAt * 1_000 + EXPIRY_WARNING_RECORD_RETENTION_MS < nowMs) {
      delete data.records[identity]
      changed = true
    }
  }

  const records = Object.values(data.records)
  if (records.length <= MAX_EXPIRY_WARNING_RECORDS) return changed

  records.sort((left, right) => compareRecordsForRetention(left, right, nowMs))
  const retained = new Set(
    records.slice(0, MAX_EXPIRY_WARNING_RECORDS).map((record) => record.identity)
  )
  for (const identity of Object.keys(data.records)) {
    if (retained.has(identity)) continue
    delete data.records[identity]
    changed = true
  }
  return changed
}

function compareRecordsForRetention(
  left: ExpiryWarningStateRecord,
  right: ExpiryWarningStateRecord,
  nowMs: number
): number {
  const leftActive = left.expiresAt * 1_000 >= nowMs
  const rightActive = right.expiresAt * 1_000 >= nowMs
  if (leftActive !== rightActive) return leftActive ? -1 : 1
  if (leftActive) return left.expiresAt - right.expiresAt

  const handledDifference = latestRecordedAt(right) - latestRecordedAt(left)
  return handledDifference || right.expiresAt - left.expiresAt
}

function latestRecordedAt(record: ExpiryWarningStateRecord): number {
  return Math.max(0, ...Object.values(record.stages).map((stage) => stage.recordedAt))
}

function assertCreditReference(credit: ExpiryWarningCreditReference): void {
  const expectedIdentity = expiryWarningIdentity({
    id: credit.creditId,
    resetType: credit.resetType,
    expiresAt: credit.expiresAt
  })
  if (credit.identity !== expectedIdentity) {
    throw new Error('Expiry-warning credit identity is invalid.')
  }
}

function assertUniqueStageUpdates(updates: ExpiryWarningStageUpdate[]): void {
  const stages = new Set<string>()
  for (const update of updates) {
    if (
      (update.stage !== 'day-before' && update.stage !== 'use-by') ||
      (update.disposition !== 'delivered' && update.disposition !== 'superseded')
    ) {
      throw new Error('Expiry-warning stage update is invalid.')
    }
    if (stages.has(update.stage)) throw new Error('Expiry-warning stage update is duplicated.')
    stages.add(update.stage)
  }
}
