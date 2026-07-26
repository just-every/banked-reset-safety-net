import {
  EXPIRY_WARNING_STAGES,
  expiryWarningIdentity,
  type ExpiryWarningStage
} from '../../shared/expiryWarnings'
import {
  EXPIRY_WARNING_STATE_VERSION,
  type ExpiryWarningStageDisposition,
  type ExpiryWarningStageRecord,
  type ExpiryWarningStateData,
  type ExpiryWarningStateRecord
} from './expiryWarningStoreTypes'

export function parseExpiryWarningState(value: unknown): ExpiryWarningStateData {
  const input = requireRecord(value, 'Expiry-warning state')
  if (input.version !== EXPIRY_WARNING_STATE_VERSION) {
    throw new Error(`Unsupported expiry-warning state version: ${String(input.version)}`)
  }
  const rawRecords = requireRecord(input.records, 'Expiry-warning records')
  const records: Record<string, ExpiryWarningStateRecord> = {}

  for (const [key, value] of Object.entries(rawRecords)) {
    const record = parseStateRecord(value)
    if (key !== record.identity) {
      throw new Error('Expiry-warning record key does not match its identity.')
    }
    const expectedIdentity = expiryWarningIdentity({
      id: record.creditId,
      resetType: record.resetType,
      expiresAt: record.expiresAt
    })
    if (record.identity !== expectedIdentity) {
      throw new Error('Expiry-warning record identity does not match its credit.')
    }
    records[key] = record
  }

  return { version: EXPIRY_WARNING_STATE_VERSION, records }
}

function parseStateRecord(value: unknown): ExpiryWarningStateRecord {
  const input = requireRecord(value, 'Expiry-warning record')
  if (
    typeof input.identity !== 'string' ||
    input.resetType !== 'codexRateLimits' ||
    typeof input.creditId !== 'string' ||
    input.creditId.length === 0 ||
    !Number.isSafeInteger(input.expiresAt) ||
    Number(input.expiresAt) <= 0
  ) {
    throw new Error('Expiry-warning record fields are invalid.')
  }

  const rawStages = requireRecord(input.stages, 'Expiry-warning record stages')
  const stages: Partial<Record<ExpiryWarningStage, ExpiryWarningStageRecord>> = {}
  for (const [stage, stageValue] of Object.entries(rawStages)) {
    if (!isExpiryWarningStage(stage)) {
      throw new Error(`Unknown expiry-warning stage: ${stage}`)
    }
    stages[stage] = parseStageRecord(stageValue)
  }

  return {
    identity: input.identity,
    resetType: 'codexRateLimits',
    creditId: input.creditId,
    expiresAt: Number(input.expiresAt),
    stages
  }
}

function parseStageRecord(value: unknown): ExpiryWarningStageRecord {
  const input = requireRecord(value, 'Expiry-warning stage record')
  if (
    !isStageDisposition(input.disposition) ||
    !Number.isSafeInteger(input.recordedAt) ||
    Number(input.recordedAt) < 0
  ) {
    throw new Error('Expiry-warning stage record fields are invalid.')
  }
  return {
    disposition: input.disposition,
    recordedAt: Number(input.recordedAt)
  }
}

function isExpiryWarningStage(value: string): value is ExpiryWarningStage {
  return (EXPIRY_WARNING_STAGES as readonly string[]).includes(value)
}

function isStageDisposition(value: unknown): value is ExpiryWarningStageDisposition {
  return value === 'delivered' || value === 'superseded'
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`)
  }
  return value as Record<string, unknown>
}
