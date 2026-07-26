import type {
  ResetHistoryEvent,
  ResetHistoryEventKind,
  ResetHistoryWindow
} from '../../shared/resetHistory'
import {
  RESET_HISTORY_VERSION,
  type ResetHistoryData,
  type ResetWindowObservation
} from './resetHistoryTypes'

export function parseResetHistory(value: unknown): ResetHistoryData {
  const input = requireRecord(value, 'Reset history')
  if (input.version !== RESET_HISTORY_VERSION) {
    throw new Error(`Unsupported reset history version: ${String(input.version)}`)
  }
  const rawObservations = requireRecord(input.observations, 'Reset history observations')
  if (!Array.isArray(input.events)) throw new Error('Reset history events are invalid.')

  const observations = Object.fromEntries(
    Object.entries(rawObservations).map(([key, observation]) => [key, parseObservation(observation)])
  )
  const events = input.events.map(parseEvent)
  return { version: RESET_HISTORY_VERSION, observations, events }
}

function parseObservation(value: unknown): ResetWindowObservation {
  const input = requireRecord(value, 'Reset history observation')
  requireString(input.profileId, 'observation profileId')
  requireString(input.usageLimitId, 'observation usageLimitId')
  requireWindow(input.usageWindow, 'observation usageWindow')
  for (const field of [
    'windowDurationMinutes',
    'usedPercent',
    'resetsAt',
    'windowStartedAt',
    'observedAt'
  ] as const) {
    requireNumber(input[field], `observation ${field}`)
  }
  return input as unknown as ResetWindowObservation
}

function parseEvent(value: unknown): ResetHistoryEvent {
  const input = requireRecord(value, 'Reset history event')
  requireString(input.id, 'event id')
  requireString(input.profileId, 'event profileId')
  requireKind(input.kind)
  requireNumber(input.occurredAt, 'event occurredAt')
  requireNumber(input.recordedAt, 'event recordedAt')
  requireNullableString(input.creditId, 'event creditId')
  if (
    input.bankedOutcome !== null &&
    input.bankedOutcome !== 'reset' &&
    input.bankedOutcome !== 'alreadyRedeemed'
  ) {
    throw new Error('Reset history event bankedOutcome is invalid.')
  }
  requireNullableString(input.usageLimitId, 'event usageLimitId')
  if (input.usageWindow !== null) requireWindow(input.usageWindow, 'event usageWindow')
  for (const field of [
    'windowDurationMinutes',
    'usedPercentBefore',
    'usedPercentAfter',
    'previousResetsAt',
    'nextResetsAt'
  ] as const) {
    requireNullableNumber(input[field], `event ${field}`)
  }
  return input as unknown as ResetHistoryEvent
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`)
  }
  return value as Record<string, unknown>
}

function requireString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !value) throw new Error(`Reset history ${label} is invalid.`)
}

function requireNullableString(value: unknown, label: string): void {
  if (value !== null && typeof value !== 'string') {
    throw new Error(`Reset history ${label} is invalid.`)
  }
}

function requireNumber(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Reset history ${label} is invalid.`)
  }
}

function requireNullableNumber(value: unknown, label: string): void {
  if (value !== null) requireNumber(value, label)
}

function requireWindow(value: unknown, label: string): asserts value is ResetHistoryWindow {
  if (value !== 'primary' && value !== 'secondary') {
    throw new Error(`Reset history ${label} is invalid.`)
  }
}

function requireKind(value: unknown): asserts value is ResetHistoryEventKind {
  if (value !== 'observed-reset' && value !== 'banked-reset') {
    throw new Error('Reset history event kind is invalid.')
  }
}
