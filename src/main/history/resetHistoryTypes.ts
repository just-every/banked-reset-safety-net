import type { ResetHistoryEvent, ResetHistoryWindow } from '../../shared/resetHistory'

export const RESET_HISTORY_VERSION = 1

export interface ResetWindowObservation {
  profileId: string
  usageLimitId: string
  usageWindow: ResetHistoryWindow
  windowDurationMinutes: number
  usedPercent: number
  resetsAt: number
  windowStartedAt: number
  observedAt: number
}

export interface ResetHistoryData {
  version: typeof RESET_HISTORY_VERSION
  observations: Record<string, ResetWindowObservation>
  events: ResetHistoryEvent[]
}

export function emptyResetHistory(): ResetHistoryData {
  return { version: RESET_HISTORY_VERSION, observations: {}, events: [] }
}
