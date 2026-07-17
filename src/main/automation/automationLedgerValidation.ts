import type {
  AutomationEvent,
  AutomationEventLevel,
  ConsumeResetOutcome
} from '../../shared/types'
import { isTerminal } from './automationLedgerRecords'
import {
  LEDGER_VERSION,
  MAX_LEDGER_EVENTS,
  type AutomationRecord,
  type AutomationRecordStatus,
  type LedgerData
} from './automationLedgerTypes'

export function parseLedger(value: unknown): LedgerData {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Automation ledger must be an object.')
  }
  const input = value as Record<string, unknown>
  if (input.version !== LEDGER_VERSION) {
    throw new Error(`Unsupported automation ledger version: ${String(input.version)}`)
  }
  if (typeof input.records !== 'object' || input.records === null || Array.isArray(input.records)) {
    throw new Error('Automation ledger records are invalid.')
  }
  if (!Array.isArray(input.events)) throw new Error('Automation ledger events are invalid.')

  const records: Record<string, AutomationRecord> = {}
  for (const [key, record] of Object.entries(input.records)) {
    records[key] = parseRecord(record)
  }
  assertConsistentActiveIdempotency(records)
  const events = input.events.map(parseEvent).slice(0, MAX_LEDGER_EVENTS)
  return { version: LEDGER_VERSION, records, events }
}

function parseRecord(value: unknown): AutomationRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Automation record is invalid.')
  }
  const input = value as Record<string, unknown>
  const stringFields = ['profileId', 'creditId', 'idempotencyKey', 'status'] as const
  for (const field of stringFields) {
    if (typeof input[field] !== 'string') throw new Error(`Automation record ${field} is invalid.`)
  }
  const numberFields = ['creditExpiresAt', 'attempts', 'createdAt'] as const
  for (const field of numberFields) {
    if (typeof input[field] !== 'number') throw new Error(`Automation record ${field} is invalid.`)
  }
  if (!isRecordStatus(input.status)) throw new Error('Automation record status is invalid.')
  if (!isNullableNumber(input.lastAttemptAt) || !isNullableNumber(input.completedAt)) {
    throw new Error('Automation record timestamps are invalid.')
  }
  if (input.lastOutcome !== null && !isConsumeOutcome(input.lastOutcome)) {
    throw new Error('Automation record outcome is invalid.')
  }
  if (input.lastError !== null && typeof input.lastError !== 'string') {
    throw new Error('Automation record error is invalid.')
  }
  return input as unknown as AutomationRecord
}

function parseEvent(value: unknown): AutomationEvent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Automation event is invalid.')
  }
  const input = value as Record<string, unknown>
  if (
    typeof input.id !== 'string' ||
    typeof input.profileId !== 'string' ||
    typeof input.timestamp !== 'number' ||
    !isEventLevel(input.level) ||
    typeof input.message !== 'string' ||
    (input.creditId !== null && typeof input.creditId !== 'string')
  ) {
    throw new Error('Automation event fields are invalid.')
  }
  return input as unknown as AutomationEvent
}

function assertConsistentActiveIdempotency(records: Record<string, AutomationRecord>): void {
  const keysByIdentity = new Map<string, string>()
  for (const record of Object.values(records)) {
    if (isTerminal(record.status)) continue
    const identity = `${record.creditId}\0${record.creditExpiresAt}`
    const existing = keysByIdentity.get(identity)
    if (existing && existing !== record.idempotencyKey) {
      throw new Error('Automation ledger has conflicting active idempotency keys for one reset.')
    }
    keysByIdentity.set(identity, record.idempotencyKey)
  }
}

function isRecordStatus(value: unknown): value is AutomationRecordStatus {
  return ['armed', 'waiting', 'uncertain', 'redeemed', 'unavailable', 'expired'].includes(
    String(value)
  )
}

function isConsumeOutcome(value: unknown): value is ConsumeResetOutcome {
  return ['reset', 'nothingToReset', 'noCredit', 'alreadyRedeemed'].includes(String(value))
}

function isEventLevel(value: unknown): value is AutomationEventLevel {
  return ['info', 'success', 'warning', 'error'].includes(String(value))
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || typeof value === 'number'
}
