import type { ConsumeResetOutcome, ResetCredit } from '../../shared/types'

export interface InitializeResult {
  userAgent: string
  codexHome: string
  platformFamily: string
  platformOs: string
}

export interface RateLimitResetCredits {
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

export function parseRateLimitResetCredits(value: unknown): RateLimitResetCredits {
  const response = requireRecord(value, 'rate limits response')
  const summaryValue = response.rateLimitResetCredits
  if (summaryValue === null || summaryValue === undefined) {
    return { availableCount: 0, credits: null }
  }

  const summary = requireRecord(summaryValue, 'rateLimitResetCredits')
  if (!Number.isSafeInteger(summary.availableCount) || Number(summary.availableCount) < 0) {
    throw new Error('rateLimitResetCredits.availableCount is invalid.')
  }
  if (summary.credits !== null && !Array.isArray(summary.credits)) {
    throw new Error('rateLimitResetCredits.credits is invalid.')
  }

  return {
    availableCount: Number(summary.availableCount),
    credits: summary.credits === null ? null : summary.credits.map(parseCredit)
  }
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
