import {
  MAX_LEAD_TIME_MINUTES,
  type ProfileRuntimeState,
  type ProfileSettings,
  type ResetCredit
} from '../../shared/types'
import type { AutomationRecord } from './automationLedger'

const LONG_RETRY_MS = 5 * 60 * 1_000
const FINAL_RETRY_MS = 60 * 1_000
const FINAL_WINDOW_MS = 10 * 60 * 1_000
const MAX_AUTOMATIC_REMAINING_MS = MAX_LEAD_TIME_MINUTES * 60 * 1_000

export function earliestAvailableCredit(
  runtime: ProfileRuntimeState,
  nowMs = Date.now()
): ResetCredit | null {
  const nowSeconds = nowMs / 1_000
  return (
    runtime.credits.find(
      (credit) =>
        credit.resetType === 'codexRateLimits' &&
        credit.status === 'available' &&
        credit.expiresAt !== null &&
        credit.expiresAt > nowSeconds
    ) ?? null
  )
}

export function isCreditDue(
  profile: ProfileSettings,
  credit: ResetCredit,
  nowMs = Date.now()
): boolean {
  if (credit.expiresAt === null) return false
  const expiresAtMs = credit.expiresAt * 1_000
  const remainingMs = expiresAtMs - nowMs
  const dueAtMs = expiresAtMs - profile.leadTimeMinutes * 60 * 1_000
  return (
    remainingMs > 0 &&
    remainingMs <= MAX_AUTOMATIC_REMAINING_MS &&
    nowMs >= dueAtMs
  )
}

export function shouldAttemptRecord(
  record: AutomationRecord | null,
  expiresAtSeconds: number,
  nowMs = Date.now()
): boolean {
  if (!record) return true
  if (['redeemed', 'unavailable', 'expired'].includes(record.status)) return false
  if (record.lastAttemptAt === null) return true

  const retryDelay = retryDelayMs(expiresAtSeconds, nowMs)
  return nowMs - record.lastAttemptAt >= retryDelay
}

export function retryDelayMs(expiresAtSeconds: number, nowMs = Date.now()): number {
  return expiresAtSeconds * 1_000 - nowMs <= FINAL_WINDOW_MS ? FINAL_RETRY_MS : LONG_RETRY_MS
}
