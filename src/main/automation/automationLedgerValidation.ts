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
  type RedemptionAuthorizationKind,
  type LedgerData
} from './automationLedgerTypes'

export function parseLedger(value: unknown): LedgerData {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Automation ledger must be an object.')
  }
  const input = value as Record<string, unknown>
  if (input.version !== 1 && input.version !== LEDGER_VERSION) {
    throw new Error(`Unsupported automation ledger version: ${String(input.version)}`)
  }
  if (typeof input.records !== 'object' || input.records === null || Array.isArray(input.records)) {
    throw new Error('Automation ledger records are invalid.')
  }
  if (!Array.isArray(input.events)) throw new Error('Automation ledger events are invalid.')

  const records: Record<string, AutomationRecord> = {}
  for (const [key, record] of Object.entries(input.records)) {
    records[key] = parseRecord(record, input.version)
  }
  assertConsistentActiveIdempotency(records)
  const events = input.events.map(parseEvent).slice(0, MAX_LEDGER_EVENTS)
  return { version: LEDGER_VERSION, records, events }
}

function parseRecord(value: unknown, version: 1 | typeof LEDGER_VERSION): AutomationRecord {
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
  if (version === 1) {
    return {
      ...(input as unknown as Omit<
        AutomationRecord,
        'accountFingerprint' | 'canonicalCodexHome' | 'authorizationKind'
      >),
      accountFingerprint: null,
      canonicalCodexHome: null,
      authorizationKind: null
    }
  }
  if (
    !isNullableString(input.accountFingerprint) ||
    !isNullableString(input.canonicalCodexHome) ||
    !isNullableAuthorizationKind(input.authorizationKind)
  ) {
    throw new Error('Automation record account binding is invalid.')
  }
  if ((input.accountFingerprint === null) !== (input.canonicalCodexHome === null)) {
    throw new Error('Automation record account binding is incomplete.')
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
  const bindingsByIdentity = new Map<
    string,
    { idempotencyKey: string; accountFingerprint: string | null }
  >()
  for (const record of Object.values(records)) {
    if (isTerminal(record.status)) continue
    const identity = `${record.creditId}\0${record.creditExpiresAt}`
    const existing = bindingsByIdentity.get(identity)
    if (existing && existing.idempotencyKey !== record.idempotencyKey) {
      throw new Error('Automation ledger has conflicting active idempotency keys for one reset.')
    }
    if (
      existing?.accountFingerprint &&
      record.accountFingerprint &&
      existing.accountFingerprint !== record.accountFingerprint
    ) {
      throw new Error('Automation ledger has conflicting account bindings for one reset.')
    }
    bindingsByIdentity.set(identity, {
      idempotencyKey: record.idempotencyKey,
      accountFingerprint: existing?.accountFingerprint ?? record.accountFingerprint
    })
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

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isNullableAuthorizationKind(
  value: unknown
): value is RedemptionAuthorizationKind | null {
  return value === null || value === 'automatic' || value === 'manual'
}
