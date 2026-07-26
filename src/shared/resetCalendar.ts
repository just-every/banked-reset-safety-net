import type { CreditUsePlan } from './creditPlanning'
import type { ResetHistoryEvent } from './resetHistory'
import type { UsageWindow } from './types'

const DAY_SECONDS = 86_400
const MINIMUM_HORIZON_DAYS = 28

export type ResetCalendarEventKind =
  | 'scheduled'
  | 'banked-use'
  | 'banked-expiry'
  | 'observed-reset'
  | 'banked-reset'

export interface ResetCalendarEvent {
  kind: ResetCalendarEventKind
  timestamp: number
  historyEvent: ResetHistoryEvent | null
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
  nowSeconds: number,
  history: ResetHistoryEvent[] = [],
  focusSeconds?: number
): ResetCalendarModel {
  const latestExpiry = Math.max(
    nowSeconds + MINIMUM_HORIZON_DAYS * DAY_SECONDS,
    ...plans.map((plan) => plan.credit.expiresAt ?? nowSeconds)
  )
  const start =
    focusSeconds === undefined ? startOfLocalWeek(nowSeconds) : startOfCalendarMonth(focusSeconds)
  const end =
    focusSeconds === undefined ? endOfLocalWeek(latestExpiry) : endOfCalendarMonth(focusSeconds)
  const todayKey = localDateKey(nowSeconds)
  const focusDate = new Date((focusSeconds ?? nowSeconds) * 1_000)
  const events = collectEvents(usageWindow, plans, history, nowSeconds, start, end)
  const days: ResetCalendarDay[] = []

  for (let cursor = start; cursor <= end; cursor = addLocalDays(cursor, 1)) {
    const date = new Date(cursor * 1_000)
    const key = localDateKey(cursor)
    days.push({
      key,
      timestamp: cursor,
      dayOfMonth: date.getDate(),
      isToday: key === todayKey,
      isOutsideFocusMonth:
        date.getMonth() !== focusDate.getMonth() ||
        date.getFullYear() !== focusDate.getFullYear(),
      events: events.get(key) ?? []
    })
  }

  return {
    label:
      focusSeconds === undefined
        ? calendarRangeLabel(start, end)
        : new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(focusDate),
    days
  }
}

function collectEvents(
  usageWindow: UsageWindow | null,
  plans: CreditUsePlan[],
  history: ResetHistoryEvent[],
  nowSeconds: number,
  start: number,
  end: number
): Map<string, ResetCalendarEvent[]> {
  const events = new Map<string, ResetCalendarEvent[]>()
  const add = (
    kind: ResetCalendarEventKind,
    timestamp: number,
    historyEvent: ResetHistoryEvent | null = null
  ): void => {
    if (timestamp < start || timestamp > end + DAY_SECONDS) return
    const key = localDateKey(timestamp)
    const dayEvents = events.get(key) ?? []
    if (!dayEvents.some((event) => event.kind === kind && event.timestamp === timestamp)) {
      dayEvents.push({ kind, timestamp, historyEvent })
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
        if (resetAt >= nowSeconds) add('scheduled', resetAt)
      }
    }
  }

  for (const plan of plans) {
    if (plan.recommendedAt >= nowSeconds) add('banked-use', plan.recommendedAt)
    if (plan.credit.expiresAt !== null && plan.credit.expiresAt >= nowSeconds) {
      add('banked-expiry', plan.credit.expiresAt)
    }
  }

  for (const event of history) add(event.kind, event.occurredAt / 1_000, event)

  return events
}

function startOfCalendarMonth(timestamp: number): number {
  const date = new Date(timestamp * 1_000)
  date.setDate(1)
  date.setHours(0, 0, 0, 0)
  return startOfLocalWeek(date.getTime() / 1_000)
}

function endOfCalendarMonth(timestamp: number): number {
  const date = new Date(timestamp * 1_000)
  date.setMonth(date.getMonth() + 1, 0)
  date.setHours(0, 0, 0, 0)
  return endOfLocalWeek(date.getTime() / 1_000)
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
