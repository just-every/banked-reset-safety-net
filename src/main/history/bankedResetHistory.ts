import type { ResetHistoryEvent } from '../../shared/resetHistory'
import { sortResetHistory } from '../../shared/resetHistory'
import type { AutomationRecord } from '../automation/automationLedger'

export function bankedResetHistory(records: AutomationRecord[]): ResetHistoryEvent[] {
  return records.flatMap((record) => {
    if (
      record.status !== 'redeemed' ||
      record.completedAt === null ||
      (record.lastOutcome !== 'reset' && record.lastOutcome !== 'alreadyRedeemed')
    ) {
      return []
    }
    return [
      {
        id: `banked:${record.profileId}:${record.creditId}:${record.completedAt}`,
        profileId: record.profileId,
        kind: 'banked-reset' as const,
        occurredAt: record.completedAt,
        recordedAt: record.completedAt,
        creditId: record.creditId,
        bankedOutcome: record.lastOutcome,
        usageLimitId: null,
        usageWindow: null,
        windowDurationMinutes: null,
        usedPercentBefore: null,
        usedPercentAfter: null,
        previousResetsAt: null,
        nextResetsAt: null
      }
    ]
  })
}

export function combineResetHistory(
  observedEvents: ResetHistoryEvent[],
  records: AutomationRecord[]
): ResetHistoryEvent[] {
  return sortResetHistory([...observedEvents, ...bankedResetHistory(records)])
}
