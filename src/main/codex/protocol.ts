import type { ConsumeResetOutcome, ResetCredit, UsageLimit, UsageWindow } from '../../shared/types'

export interface InitializeResult {
  userAgent: string
  codexHome: string
  platformFamily: string
  platformOs: string
}

export interface RateLimitsReadResult {
  usageLimits: UsageLimit[]
  availableCount: number
  credits: ResetCredit[] | null
}

export function parseInitializeResult(value: unknown): InitializeResult {
  const input = requireRecord(value, 'initialize result')
  const fields = ['userAgent', 'codexHome', 'platformFamily', 'platformOs'] as const
  for (const field of fields) {
    if (typeof input[field] !== 'string') throw new Error(`initialize result.${field} is invalid.`)
  }
  return input as unknown as InitializeResult
}

export function parseRateLimitsReadResult(value: unknown): RateLimitsReadResult {
  const response = requireRecord(value, 'rate limits response')
  const usageLimits = parseUsageLimits(response)
  const summaryValue = response.rateLimitResetCredits
  if (summaryValue === null || summaryValue === undefined) {
    return { usageLimits, availableCount: 0, credits: null }
  }

  const summary = requireRecord(summaryValue, 'rateLimitResetCredits')
  if (!Number.isSafeInteger(summary.availableCount) || Number(summary.availableCount) < 0) {
    throw new Error('rateLimitResetCredits.availableCount is invalid.')
  }
  if (summary.credits !== null && !Array.isArray(summary.credits)) {
    throw new Error('rateLimitResetCredits.credits is invalid.')
  }

  return {
    usageLimits,
    availableCount: Number(summary.availableCount),
    credits: summary.credits === null ? null : summary.credits.map(parseCredit)
  }
}

function parseUsageLimits(response: Record<string, unknown>): UsageLimit[] {
  const snapshots = new Map<string, UsageLimit>()
  const byLimitId = response.rateLimitsByLimitId

  if (byLimitId !== null && byLimitId !== undefined) {
    const record = requireRecord(byLimitId, 'rateLimitsByLimitId')
    for (const [key, value] of Object.entries(record)) {
      const snapshot = parseUsageLimit(value, `rateLimitsByLimitId.${key}`, key)
      snapshots.set(snapshot.id, snapshot)
    }
  }

  if (snapshots.size === 0) {
    const snapshot = parseUsageLimit(response.rateLimits, 'rateLimits', null)
    snapshots.set(snapshot.id, snapshot)
  }

  return [...snapshots.values()].sort((left, right) => {
    if (left.id === 'codex') return -1
    if (right.id === 'codex') return 1
    return usageLimitLabel(left).localeCompare(usageLimitLabel(right))
  })
}

function parseUsageLimit(value: unknown, label: string, fallbackId: string | null): UsageLimit {
  const input = requireRecord(value, label)
  const id = input.limitId === null || input.limitId === undefined ? fallbackId : input.limitId
  if (typeof id !== 'string' || !id) throw new Error(`${label}.limitId is invalid.`)
  if (input.limitName !== null && input.limitName !== undefined && typeof input.limitName !== 'string') {
    throw new Error(`${label}.limitName is invalid.`)
  }
  if (input.planType !== null && input.planType !== undefined && typeof input.planType !== 'string') {
    throw new Error(`${label}.planType is invalid.`)
  }
  if (
    input.rateLimitReachedType !== null &&
    input.rateLimitReachedType !== undefined &&
    typeof input.rateLimitReachedType !== 'string'
  ) {
    throw new Error(`${label}.rateLimitReachedType is invalid.`)
  }

  return {
    id,
    name: (input.limitName as string | null | undefined) ?? null,
    primary: parseUsageWindow(input.primary, `${label}.primary`),
    secondary: parseUsageWindow(input.secondary, `${label}.secondary`),
    planType: (input.planType as string | null | undefined) ?? null,
    rateLimitReachedType: (input.rateLimitReachedType as string | null | undefined) ?? null
  }
}

function parseUsageWindow(value: unknown, label: string): UsageWindow | null {
  if (value === null || value === undefined) return null
  const input = requireRecord(value, label)
  if (
    typeof input.usedPercent !== 'number' ||
    !Number.isFinite(input.usedPercent) ||
    input.usedPercent < 0 ||
    input.usedPercent > 100
  ) {
    throw new Error(`${label}.usedPercent is invalid.`)
  }
  if (
    input.windowDurationMins !== null &&
    (!Number.isSafeInteger(input.windowDurationMins) || Number(input.windowDurationMins) <= 0)
  ) {
    throw new Error(`${label}.windowDurationMins is invalid.`)
  }
  if (
    input.resetsAt !== null &&
    (!Number.isSafeInteger(input.resetsAt) || Number(input.resetsAt) <= 0)
  ) {
    throw new Error(`${label}.resetsAt is invalid.`)
  }

  return {
    usedPercent: input.usedPercent,
    windowDurationMinutes:
      input.windowDurationMins === null ? null : Number(input.windowDurationMins),
    resetsAt: input.resetsAt === null ? null : Number(input.resetsAt)
  }
}

function usageLimitLabel(limit: UsageLimit): string {
  return limit.name ?? limit.id
}

export function parseConsumeOutcome(value: unknown): ConsumeResetOutcome {
  const response = requireRecord(value, 'consume response')
  if (!['reset', 'nothingToReset', 'noCredit', 'alreadyRedeemed'].includes(String(response.outcome))) {
    throw new Error(`Unknown reset outcome: ${String(response.outcome)}`)
  }
  return response.outcome as ConsumeResetOutcome
}

function parseCredit(value: unknown): ResetCredit {
  const input = requireRecord(value, 'reset credit')
  if (typeof input.id !== 'string' || !input.id) throw new Error('Reset credit id is invalid.')
  if (!Number.isSafeInteger(input.grantedAt)) throw new Error('Reset credit grantedAt is invalid.')
  if (input.expiresAt !== null && !Number.isSafeInteger(input.expiresAt)) {
    throw new Error('Reset credit expiresAt is invalid.')
  }
  if (input.title !== null && typeof input.title !== 'string') {
    throw new Error('Reset credit title is invalid.')
  }
  if (input.description !== null && typeof input.description !== 'string') {
    throw new Error('Reset credit description is invalid.')
  }

  return {
    id: input.id,
    resetType: input.resetType === 'codexRateLimits' ? 'codexRateLimits' : 'unknown',
    status: normalizeStatus(input.status),
    grantedAt: Number(input.grantedAt),
    expiresAt: input.expiresAt === null ? null : Number(input.expiresAt),
    title: input.title as string | null,
    description: input.description as string | null
  }
}

function normalizeStatus(value: unknown): ResetCredit['status'] {
  return ['available', 'redeeming', 'redeemed'].includes(String(value))
    ? (value as ResetCredit['status'])
    : 'unknown'
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`)
  }
  return value as Record<string, unknown>
}
