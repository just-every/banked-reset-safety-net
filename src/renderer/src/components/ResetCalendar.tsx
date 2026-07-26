import { useState } from 'react'
import type { CreditUsePlan } from '../../../shared/creditPlanning'
import { buildResetCalendar } from '../../../shared/resetCalendar'
import type {
  ResetCalendarEvent,
  ResetCalendarEventKind
} from '../../../shared/resetCalendar'
import type { ResetHistoryEvent } from '../../../shared/resetHistory'
import type { UsageWindow } from '../../../shared/types'
import { ResetHistoryList } from './ResetHistoryList'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function ResetCalendar({
  usageWindow,
  plans,
  history,
  now
}: {
  usageWindow: UsageWindow
  plans: CreditUsePlan[]
  history: ResetHistoryEvent[]
  now: number
}): React.JSX.Element {
  const [focus, setFocus] = useState(now)
  const calendar = buildResetCalendar(usageWindow, plans, now / 1_000, history, focus / 1_000)
  return (
    <section className="reset-calendar-section">
      <div className="calendar-heading">
        <div>
          <h3><span className="calendar-icon" aria-hidden="true" /> Reset calendar</h3>
          <p>Applied reset history, future resets, banked use dates, and expiries</p>
        </div>
        <div className="calendar-navigation">
          <button type="button" onClick={() => setFocus(addMonths(focus, -1))} aria-label="Previous month">‹</button>
          <strong>{calendar.label}</strong>
          <button type="button" onClick={() => setFocus(addMonths(focus, 1))} aria-label="Next month">›</button>
          {sameMonth(focus, now) ? null : (
            <button type="button" className="calendar-today" onClick={() => setFocus(now)}>Today</button>
          )}
        </div>
      </div>

      <div className="calendar-legend" aria-label="Calendar legend">
        <span className="is-scheduled">Scheduled reset</span>
        <span className="is-observed-reset">Applied</span>
        <span className="is-banked-reset">Bank used</span>
        <span className="is-banked-use">Best use</span>
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
      <ResetHistoryList events={history} />
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
  if (kind === 'observed-reset') return 'Applied'
  if (kind === 'banked-reset') return 'Bank used'
  if (kind === 'banked-use') return 'Use'
  return 'Expires'
}

function eventTitle(event: ResetCalendarEvent): string {
  const label =
    event.kind === 'scheduled'
      ? 'Scheduled normal reset'
      : event.kind === 'observed-reset'
        ? 'OpenAI reset applied'
        : event.kind === 'banked-reset'
          ? 'Banked reset used'
      : event.kind === 'banked-use'
        ? 'Recommended banked reset use'
        : 'Banked reset expiry'
  const time = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  return `${label}: ${time.format(new Date(event.timestamp * 1_000))}`
}

function addMonths(timestamp: number, months: number): number {
  const date = new Date(timestamp)
  date.setDate(1)
  date.setMonth(date.getMonth() + months)
  return date.getTime()
}

function sameMonth(left: number, right: number): boolean {
  const leftDate = new Date(left)
  const rightDate = new Date(right)
  return (
    leftDate.getFullYear() === rightDate.getFullYear() &&
    leftDate.getMonth() === rightDate.getMonth()
  )
}
