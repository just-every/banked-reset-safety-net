import type { UsageWindow } from './types'

export type ResetHistoryEventKind = 'observed-reset' | 'banked-reset'
export type ResetHistoryWindow = 'primary' | 'secondary'

export interface ResetHistoryEvent {
  id: string
  profileId: string
  kind: ResetHistoryEventKind
  occurredAt: number
  recordedAt: number
  creditId: string | null
  bankedOutcome: 'reset' | 'alreadyRedeemed' | null
  usageLimitId: string | null
  usageWindow: ResetHistoryWindow | null
  windowDurationMinutes: number | null
  usedPercentBefore: number | null
  usedPercentAfter: number | null
  previousResetsAt: number | null
  nextResetsAt: number | null
}

export function resetWindowStartedAt(window: UsageWindow): number | null {
  if (window.resetsAt === null || window.windowDurationMinutes === null) return null
  return (window.resetsAt - window.windowDurationMinutes * 60) * 1_000
}

export function sortResetHistory(events: ResetHistoryEvent[]): ResetHistoryEvent[] {
  return [...events].sort(
    (left, right) => right.occurredAt - left.occurredAt || right.recordedAt - left.recordedAt
  )
}
