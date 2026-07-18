import type {
  ResetCalendarEvent,
  ResetCalendarEventKind,
  ResetCalendarModel
} from '../../../shared/resetCalendar'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function ResetCalendar({ calendar }: { calendar: ResetCalendarModel }): React.JSX.Element {
  return (
    <section className="reset-calendar-section">
      <div className="calendar-heading">
        <div>
          <h3><span className="calendar-icon" aria-hidden="true" /> Reset calendar</h3>
          <p>Natural resets, banked use dates, and final expiries</p>
        </div>
        <strong>{calendar.label}</strong>
      </div>

      <div className="calendar-legend" aria-label="Calendar legend">
        <span className="is-scheduled">Scheduled reset</span>
        <span className="is-banked-use">Banked use</span>
        <span className="is-banked-expiry">Expiry</span>
      </div>

      <div className="calendar-grid weekdays" aria-hidden="true">
        {WEEKDAYS.map((weekday) => <span key={weekday}>{weekday}</span>)}
      </div>
      <div className="calendar-grid days">
        {calendar.days.map((day) => (
          <div
            className={`calendar-day ${day.isToday ? 'is-today' : ''} ${day.isOutsideFocusMonth ? 'is-outside' : ''} ${day.events.length > 0 ? 'has-events' : ''}`}
            key={day.key}
          >
            <time dateTime={day.key}>{day.dayOfMonth}</time>
            <div className="calendar-events">
              {uniqueEventKinds(day.events).map((event) => (
                <span
                  className={`calendar-event is-${event.kind}`}
                  key={event.kind}
                  title={eventTitle(event)}
                >
                  {eventLabel(event.kind)}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function uniqueEventKinds(events: ResetCalendarEvent[]): ResetCalendarEvent[] {
  return events.filter(
    (event, index) => events.findIndex((candidate) => candidate.kind === event.kind) === index
  )
}

function eventLabel(kind: ResetCalendarEventKind): string {
  if (kind === 'scheduled') return 'Reset'
  if (kind === 'banked-use') return 'Use'
  return 'Expires'
}

function eventTitle(event: ResetCalendarEvent): string {
  const label =
    event.kind === 'scheduled'
      ? 'Scheduled normal reset'
      : event.kind === 'banked-use'
        ? 'Recommended banked reset use'
        : 'Banked reset expiry'
  const time = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  return `${label}: ${time.format(new Date(event.timestamp * 1_000))}`
}
