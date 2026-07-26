import type { ExpiryWarningStage } from '../../shared/expiryWarnings'

export const EXPIRY_WARNING_STATE_VERSION = 1
export const MAX_EXPIRY_WARNING_RECORDS = 1_000
export const EXPIRY_WARNING_RECORD_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000

export type ExpiryWarningStageDisposition = 'delivered' | 'superseded'

export interface ExpiryWarningStageRecord {
  disposition: ExpiryWarningStageDisposition
  recordedAt: number
}

export interface ExpiryWarningStateRecord {
  identity: string
  resetType: 'codexRateLimits'
  creditId: string
  expiresAt: number
  stages: Partial<Record<ExpiryWarningStage, ExpiryWarningStageRecord>>
}

export interface ExpiryWarningStateData {
  version: typeof EXPIRY_WARNING_STATE_VERSION
  records: Record<string, ExpiryWarningStateRecord>
}

export interface ExpiryWarningStageUpdate {
  stage: ExpiryWarningStage
  disposition: ExpiryWarningStageDisposition
}

export function emptyExpiryWarningState(): ExpiryWarningStateData {
  return { version: EXPIRY_WARNING_STATE_VERSION, records: {} }
}
