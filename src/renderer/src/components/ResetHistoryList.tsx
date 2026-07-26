import type { ResetHistoryEvent } from '../../../shared/resetHistory'

export function ResetHistoryList({ events }: { events: ResetHistoryEvent[] }): React.JSX.Element {
  const recent = [...events].sort((left, right) => right.occurredAt - left.occurredAt).slice(0, 8)

  return (
    <div className="reset-history">
      <div className="reset-history-heading">
        <strong>Recorded reset history</strong>
        <span>{events.length} {events.length === 1 ? 'event' : 'events'}</span>
      </div>
      {recent.length === 0 ? (
        <p className="reset-history-empty">
          The current window will be recorded after the first successful refresh.
        </p>
      ) : (
        <div className="reset-history-list">
          {recent.map((event) => (
            <div className={`reset-history-row is-${event.kind}`} key={event.id}>
              <span className="reset-history-dot" />
              <div>
                <strong>{historyLabel(event)}</strong>
                <p>{historyDetail(event)}</p>
              </div>
              <time>{formatDateTime(event.occurredAt)}</time>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function historyLabel(event: ResetHistoryEvent): string {
  if (event.kind === 'banked-reset') {
    return event.bankedOutcome === 'alreadyRedeemed'
      ? 'Banked reset confirmed used'
      : 'Banked reset used'
  }
  const window = event.usageWindow === 'secondary' ? 'secondary' : 'primary'
  return `${event.usageLimitId ?? 'Codex'} ${window} reset applied`
}

function historyDetail(event: ResetHistoryEvent): string {
  if (event.kind === 'banked-reset') {
    return event.bankedOutcome === 'alreadyRedeemed'
      ? 'The guarded ledger confirmed it was already redeemed at this time.'
      : 'Confirmed by the guarded redemption ledger.'
  }
  if (event.previousResetsAt !== null && event.nextResetsAt !== null) {
    return `Next reset moved from ${formatDateTime(event.previousResetsAt)} to ${formatDateTime(event.nextResetsAt)}.`
  }
  if (event.nextResetsAt !== null) {
    return `Active window observed; next reset is ${formatDateTime(event.nextResetsAt)}.`
  }
  return 'Observed from Codex usage-window timing.'
}

function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(timestamp))
}
