import type { AutomationEvent, ConsumeResetOutcome } from '../../shared/types'

export const LEDGER_VERSION = 1
export const MAX_LEDGER_EVENTS = 200
export const MAX_LEDGER_RECORDS = 1_000

export type AutomationRecordStatus =
  | 'armed'
  | 'waiting'
  | 'uncertain'
  | 'redeemed'
  | 'unavailable'
  | 'expired'

export interface AutomationRecord {
  profileId: string
  creditId: string
  creditExpiresAt: number
  idempotencyKey: string
  status: AutomationRecordStatus
  attempts: number
  createdAt: number
  lastAttemptAt: number | null
  lastOutcome: ConsumeResetOutcome | null
  lastError: string | null
  completedAt: number | null
}

export interface LedgerData {
  version: typeof LEDGER_VERSION
  records: Record<string, AutomationRecord>
  events: AutomationEvent[]
}

export function emptyLedger(): LedgerData {
  return { version: LEDGER_VERSION, records: {}, events: [] }
}
