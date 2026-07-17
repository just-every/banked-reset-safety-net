import { createHash } from 'node:crypto'
import type { ResetCredit } from '../../shared/types'

const IDEMPOTENCY_NAMESPACE = 'reset-net:codex-rate-limit-reset:v1'

export function redemptionIdentity(credit: ResetCredit): string {
  if (credit.expiresAt === null) throw new Error('A reset expiry is required for redemption.')
  return `${credit.resetType}\0${credit.id}\0${credit.expiresAt}`
}

export function redemptionLockKey(credit: ResetCredit): string {
  return createHash('sha256').update(redemptionIdentity(credit)).digest('hex')
}

/**
 * The same backend credit always gets the same UUID, even when it is visible
 * through two CODEX_HOMEs or an interrupted request resumes after a restart.
 */
export function idempotencyKeyForCredit(credit: ResetCredit): string {
  const bytes = createHash('sha256')
    .update(IDEMPOTENCY_NAMESPACE)
    .update('\0')
    .update(redemptionIdentity(credit))
    .digest()
    .subarray(0, 16)

  bytes[6] = (bytes[6]! & 0x0f) | 0x50
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
