import { randomUUID } from 'node:crypto'
import type {
  AutomationEvent,
  AutomationEventLevel,
  ConsumeResetOutcome,
  ResetCredit
} from '../../shared/types'
import { readJsonFile, writeJsonFileAtomic } from '../persistence/jsonFile'
import {
  idempotencyKeyForIntent,
  isTerminal,
  pruneRecords,
  recordKey,
  requireRecord
} from './automationLedgerRecords'
import {
  emptyLedger,
  MAX_LEDGER_EVENTS,
  type AutomationRecord,
  type LedgerData
} from './automationLedgerTypes'
import { parseLedger } from './automationLedgerValidation'

export type { AutomationRecord, AutomationRecordStatus } from './automationLedgerTypes'

export class AutomationLedger {
  private data: LedgerData | null = null
  private writeChain: Promise<void> = Promise.resolve()

  constructor(private readonly filePath: string) {}

  async initialize(): Promise<void> {
    const stored = await readJsonFile(this.filePath)
    this.data = stored === null ? emptyLedger() : parseLedger(stored)
    if (stored === null) await this.persist()
  }

  getRecord(profileId: string, creditId: string): AutomationRecord | null {
    const record = this.requireData().records[recordKey(profileId, creditId)]
    return record ? structuredClone(record) : null
  }

  getEvents(): AutomationEvent[] {
    return structuredClone(this.requireData().events)
  }

  async ensureIntent(
    profileId: string,
    credit: ResetCredit,
    now = Date.now()
  ): Promise<AutomationRecord> {
    if (credit.expiresAt === null) throw new Error('Cannot arm a reset without an expiry.')
    const creditExpiresAt = credit.expiresAt
    return this.mutate((data) => {
      const key = recordKey(profileId, credit.id)
      const existing = data.records[key]
      if (existing) {
        if (existing.creditExpiresAt !== creditExpiresAt) {
          throw new Error('Stored reset identity does not match the current expiry.')
        }
        if (existing.attempts === 0) {
          existing.idempotencyKey = idempotencyKeyForIntent(data, credit, existing)
        }
        return structuredClone(existing)
      }

      const record: AutomationRecord = {
        profileId,
        creditId: credit.id,
        creditExpiresAt,
        idempotencyKey: idempotencyKeyForIntent(data, credit),
        status: 'armed',
        attempts: 0,
        createdAt: now,
        lastAttemptAt: null,
        lastOutcome: null,
        lastError: null,
        completedAt: null
      }
      data.records[key] = record
      pruneRecords(data)
      return structuredClone(record)
    })
  }

  async markAttempt(profileId: string, creditId: string, now = Date.now()): Promise<void> {
    await this.mutate((data) => {
      const record = requireRecord(data, profileId, creditId)
      record.attempts += 1
      record.lastAttemptAt = now
      record.lastError = null
      record.status = 'uncertain'
    })
  }

  async markOutcome(
    profileId: string,
    creditId: string,
    outcome: ConsumeResetOutcome,
    now = Date.now()
  ): Promise<void> {
    await this.mutate((data) => {
      const record = requireRecord(data, profileId, creditId)
      record.lastOutcome = outcome
      record.lastError = null

      if (outcome === 'reset' || outcome === 'alreadyRedeemed') {
        record.status = 'redeemed'
        record.completedAt = now
      } else if (outcome === 'noCredit') {
        record.status = 'unavailable'
        record.completedAt = now
      } else {
        record.status = 'waiting'
      }
    })
  }

  async markError(
    profileId: string,
    creditId: string,
    message: string,
    now = Date.now()
  ): Promise<void> {
    await this.mutate((data) => {
      const record = requireRecord(data, profileId, creditId)
      record.status = 'uncertain'
      record.lastError = message
      record.lastAttemptAt = now
    })
  }

  async markPreflightError(
    profileId: string,
    creditId: string,
    message: string,
    now = Date.now()
  ): Promise<void> {
    await this.mutate((data) => {
      const record = requireRecord(data, profileId, creditId)
      record.status = 'waiting'
      record.lastError = message
      record.lastAttemptAt = now
    })
  }

  async markExpired(profileId: string, creditId: string, now = Date.now()): Promise<void> {
    await this.mutate((data) => {
      const record = data.records[recordKey(profileId, creditId)]
      if (!record || isTerminal(record.status)) return
      record.status = 'expired'
      record.completedAt = now
    })
  }

  async addEvent(
    profileId: string,
    creditId: string | null,
    level: AutomationEventLevel,
    message: string,
    timestamp = Date.now()
  ): Promise<void> {
    await this.mutate((data) => {
      data.events.unshift({
        id: randomUUID(),
        profileId,
        creditId,
        timestamp,
        level,
        message
      })
      data.events = data.events.slice(0, MAX_LEDGER_EVENTS)
    })
  }

  private async mutate<T>(mutator: (data: LedgerData) => T): Promise<T> {
    const operation = this.writeChain.then(async () => {
      const result = mutator(this.requireData())
      await this.persist()
      return result
    })
    this.writeChain = operation.then(
      () => undefined,
      () => undefined
    )
    return operation
  }

  private requireData(): LedgerData {
    if (this.data === null) throw new Error('AutomationLedger has not been initialized.')
    return this.data
  }

  private async persist(): Promise<void> {
    await writeJsonFileAtomic(this.filePath, this.requireData())
  }
}
