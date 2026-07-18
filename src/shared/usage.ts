import type { ResetCredit, UsageLimit, UsageWindow } from './types'

export const PACE_TOLERANCE_PERCENTAGE_POINTS = 5

export type UsagePaceStatus = 'over' | 'on-pace' | 'under' | 'unknown'

export interface UsagePace {
  remainingPercent: number
  expectedUsedPercent: number | null
  differencePercentagePoints: number | null
  status: UsagePaceStatus
  windowStartsAt: number | null
  projectedExhaustionAt: number | null
}

export interface CreditUsePlan {
  credit: ResetCredit
  useByAt: number
  recommendedAt: number
  recommendation: 'projected-exhaustion' | 'use-by'
  normalResetsBeforeUse: number
}

export function calculateUsagePace(window: UsageWindow, nowSeconds: number): UsagePace {
  const remainingPercent = Math.max(0, 100 - window.usedPercent)
  if (window.windowDurationMinutes === null || window.resetsAt === null) {
    return unknownPace(remainingPercent)
  }

  const durationSeconds = window.windowDurationMinutes * 60
  const windowStartsAt = window.resetsAt - durationSeconds
  if (nowSeconds < windowStartsAt || nowSeconds >= window.resetsAt) {
    return { ...unknownPace(remainingPercent), windowStartsAt }
  }

  const elapsedSeconds = nowSeconds - windowStartsAt
  const expectedUsedPercent = (elapsedSeconds / durationSeconds) * 100
  const differencePercentagePoints = window.usedPercent - expectedUsedPercent
  const status = paceStatus(differencePercentagePoints)
  const projectedExhaustionAt =
    window.usedPercent > 0 && elapsedSeconds > 0
      ? nowSeconds + ((100 - window.usedPercent) * elapsedSeconds) / window.usedPercent
      : null

  return {
    remainingPercent,
    expectedUsedPercent,
    differencePercentagePoints,
    status,
    windowStartsAt,
    projectedExhaustionAt
  }
}

export function selectPlanningLimit(limits: UsageLimit[]): UsageLimit | null {
  return limits.find((limit) => limit.id === 'codex' && limit.primary !== null) ?? null
}

export function displayUsageLimits(limits: UsageLimit[]): UsageLimit[] {
  return limits.filter((limit) => limit.id === 'codex')
}

export function buildCreditUsePlans(
  credits: ResetCredit[],
  usageWindow: UsageWindow | null,
  leadTimeMinutes: number,
  nowSeconds: number
): CreditUsePlan[] {
  const pace = usageWindow ? calculateUsagePace(usageWindow, nowSeconds) : null
  const durationSeconds = (usageWindow?.windowDurationMinutes ?? 0) * 60
  const normalResetAt = usageWindow?.resetsAt ?? null
  const projectedExhaustionAvailable =
    pace?.projectedExhaustionAt !== null &&
    pace?.projectedExhaustionAt !== undefined &&
    normalResetAt !== null &&
    pace.projectedExhaustionAt > nowSeconds &&
    pace.projectedExhaustionAt < normalResetAt

  return credits
    .filter(
      (credit) =>
        credit.status === 'available' &&
        credit.resetType === 'codexRateLimits' &&
        credit.expiresAt !== null
    )
    .sort(
      (left, right) =>
        (left.expiresAt ?? Number.POSITIVE_INFINITY) -
        (right.expiresAt ?? Number.POSITIVE_INFINITY)
    )
    .map((credit, index) => {
      const useByAt = (credit.expiresAt as number) - leadTimeMinutes * 60
      const projectedExhaustion = pace?.projectedExhaustionAt ?? null
      const useProjection =
        index === 0 &&
        projectedExhaustionAvailable &&
        projectedExhaustion !== null &&
        projectedExhaustion <= useByAt
      const recommendedAt = useProjection ? projectedExhaustion : useByAt
      return {
        credit,
        useByAt,
        recommendedAt,
        recommendation: useProjection ? 'projected-exhaustion' : 'use-by',
        normalResetsBeforeUse:
          normalResetAt !== null && durationSeconds > 0 && recommendedAt >= normalResetAt
            ? Math.floor((recommendedAt - normalResetAt) / durationSeconds) + 1
            : 0
      }
    })
}

export function formatUsageWindowDuration(minutes: number | null): string {
  if (minutes === null) return 'Usage'
  if (minutes % 10_080 === 0) return `${minutes / 10_080}-week`
  if (minutes % 1_440 === 0) return `${minutes / 1_440}-day`
  if (minutes % 60 === 0) return `${minutes / 60}-hour`
  return `${minutes}-minute`
}

export function formatUsagePercent(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`
}

export function formatUsagePaceDifference(differencePercentagePoints: number | null): string {
  if (differencePercentagePoints === null) return 'Timing unavailable'

  const points = Math.abs(differencePercentagePoints)
  if (points < 0.05) return 'At ideal pace'
  return `${points.toFixed(1)} pts ${differencePercentagePoints > 0 ? 'ahead' : 'behind'}`
}

export function usagePaceLabel(status: UsagePaceStatus): string {
  if (status === 'over') return 'Over pace'
  if (status === 'under') return 'Under pace'
  if (status === 'on-pace') return 'On pace'
  return 'No pace'
}

function paceStatus(differencePercentagePoints: number): UsagePaceStatus {
  if (differencePercentagePoints > PACE_TOLERANCE_PERCENTAGE_POINTS) return 'over'
  if (differencePercentagePoints < -PACE_TOLERANCE_PERCENTAGE_POINTS) return 'under'
  return 'on-pace'
}

function unknownPace(remainingPercent: number): UsagePace {
  return {
    remainingPercent,
    expectedUsedPercent: null,
    differencePercentagePoints: null,
    status: 'unknown',
    windowStartsAt: null,
    projectedExhaustionAt: null
  }
}
