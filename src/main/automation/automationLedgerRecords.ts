import type { ResetCredit } from '../../shared/types'
import { idempotencyKeyForCredit } from './redemptionIdentity'
import {
  MAX_LEDGER_RECORDS,
  type AutomationRecord,
  type AutomationRecordStatus,
  type LedgerData
} from './automationLedgerTypes'

export function requireRecord(
  data: LedgerData,
  profileId: string,
  creditId: string
): AutomationRecord {
  const record = data.records[recordKey(profileId, creditId)]
  if (!record) throw new Error('Automation intent is missing.')
  return record
}

export function recordKey(profileId: string, creditId: string): string {
  return `${profileId}:${creditId}`
}

export function pruneRecords(data: LedgerData): void {
  const entries = Object.entries(data.records)
  if (entries.length <= MAX_LEDGER_RECORDS) return
  const active = entries.filter(([, record]) => !isTerminal(record.status))
  const terminal = entries
    .filter(([, record]) => isTerminal(record.status))
    .sort(([, left], [, right]) => right.createdAt - left.createdAt)
  const retainedTerminal = terminal.slice(0, Math.max(0, MAX_LEDGER_RECORDS - active.length))
  data.records = Object.fromEntries([...active, ...retainedTerminal])
}

export function idempotencyKeyForIntent(
  data: LedgerData,
  credit: ResetCredit,
  excluded?: AutomationRecord
): string {
  return (
    matchingIdentityRecord(data, credit, excluded)?.idempotencyKey ??
    idempotencyKeyForCredit(credit)
  )
}

export function isTerminal(status: AutomationRecordStatus): boolean {
  return status === 'redeemed' || status === 'unavailable' || status === 'expired'
}

function matchingIdentityRecord(
  data: LedgerData,
  credit: ResetCredit,
  excluded?: AutomationRecord
): AutomationRecord | null {
  if (credit.expiresAt === null) return null
  return (
    Object.values(data.records).find(
      (record) =>
        record !== excluded &&
        record.creditId === credit.id &&
        record.creditExpiresAt === credit.expiresAt
    ) ?? null
  )
}
