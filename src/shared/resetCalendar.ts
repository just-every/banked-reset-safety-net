import type { CreditUsePlan } from './usage'
import type { UsageWindow } from './types'

const DAY_SECONDS = 86_400
const MINIMUM_HORIZON_DAYS = 28

export type ResetCalendarEventKind = 'scheduled' | 'banked-use' | 'banked-expiry'

export interface ResetCalendarEvent {
  kind: ResetCalendarEventKind
  timestamp: number
}

export interface ResetCalendarDay {
  key: string
  timestamp: number
  dayOfMonth: number
  isToday: boolean
  isOutsideFocusMonth: boolean
  events: ResetCalendarEvent[]
}

export interface ResetCalendarModel {
  label: string
  days: ResetCalendarDay[]
}

export function buildResetCalendar(
  usageWindow: UsageWindow | null,
  plans: CreditUsePlan[],
  nowSeconds: number
): ResetCalendarModel {
  const latestExpiry = Math.max(
    nowSeconds + MINIMUM_HORIZON_DAYS * DAY_SECONDS,
    ...plans.map((plan) => plan.credit.expiresAt ?? nowSeconds)
  )
  const start = startOfLocalWeek(nowSeconds)
  const end = endOfLocalWeek(latestExpiry)
  const todayKey = localDateKey(nowSeconds)
  const focusMonth = new Date(nowSeconds * 1_000).getMonth()
  const events = collectEvents(usageWindow, plans, start, end)
  const days: ResetCalendarDay[] = []

  for (let cursor = start; cursor <= end; cursor = addLocalDays(cursor, 1)) {
    const date = new Date(cursor * 1_000)
    const key = localDateKey(cursor)
    days.push({
      key,
      timestamp: cursor,
      dayOfMonth: date.getDate(),
      isToday: key === todayKey,
      isOutsideFocusMonth: date.getMonth() !== focusMonth,
      events: events.get(key) ?? []
    })
  }

  return { label: calendarRangeLabel(start, end), days }
}

function collectEvents(
  usageWindow: UsageWindow | null,
  plans: CreditUsePlan[],
  start: number,
  end: number
): Map<string, ResetCalendarEvent[]> {
  const events = new Map<string, ResetCalendarEvent[]>()
  const add = (kind: ResetCalendarEventKind, timestamp: number): void => {
    if (timestamp < start || timestamp > end + DAY_SECONDS) return
    const key = localDateKey(timestamp)
    const dayEvents = events.get(key) ?? []
    if (!dayEvents.some((event) => event.kind === kind && event.timestamp === timestamp)) {
      dayEvents.push({ kind, timestamp })
      dayEvents.sort((left, right) => left.timestamp - right.timestamp)
      events.set(key, dayEvents)
    }
  }

  if (usageWindow?.resetsAt !== null && usageWindow?.resetsAt !== undefined) {
    const intervalSeconds = (usageWindow.windowDurationMinutes ?? 0) * 60
    if (intervalSeconds > 0) {
      let resetAt = usageWindow.resetsAt
      if (resetAt < start) {
        resetAt += Math.ceil((start - resetAt) / intervalSeconds) * intervalSeconds
      }
      for (; resetAt <= end + DAY_SECONDS; resetAt += intervalSeconds) {
        add('scheduled', resetAt)
      }
    }
  }

  for (const plan of plans) {
    add('banked-use', plan.recommendedAt)
    if (plan.credit.expiresAt !== null) add('banked-expiry', plan.credit.expiresAt)
  }

  return events
}

function startOfLocalWeek(timestamp: number): number {
  const date = startOfLocalDay(timestamp)
  const mondayOffset = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - mondayOffset)
  return date.getTime() / 1_000
}

function endOfLocalWeek(timestamp: number): number {
  const start = startOfLocalWeek(timestamp)
  return addLocalDays(start, 6)
}

function startOfLocalDay(timestamp: number): Date {
  const date = new Date(timestamp * 1_000)
  date.setHours(0, 0, 0, 0)
  return date
}

function addLocalDays(timestamp: number, days: number): number {
  const date = new Date(timestamp * 1_000)
  date.setDate(date.getDate() + days)
  return date.getTime() / 1_000
}

function localDateKey(timestamp: number): string {
  const date = new Date(timestamp * 1_000)
  return [
    String(date.getFullYear()),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-')
}

function calendarRangeLabel(start: number, end: number): string {
  const startDate = new Date(start * 1_000)
  const endDate = new Date(end * 1_000)
  const sameYear = startDate.getFullYear() === endDate.getFullYear()
  const sameMonth = sameYear && startDate.getMonth() === endDate.getMonth()
  const month = new Intl.DateTimeFormat(undefined, { month: 'long' })
  if (sameMonth) return `${month.format(startDate)} ${startDate.getFullYear()}`
  const endLabel = new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric'
  }).format(endDate)
  return `${month.format(startDate)} – ${endLabel}`
}
