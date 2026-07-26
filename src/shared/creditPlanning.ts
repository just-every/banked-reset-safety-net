import type { ResetCredit, UsageWindow } from './types'
import { calculateUsagePace } from './usage'

export type CreditRecommendation = 'projected-exhaustion' | 'balanced-spacing' | 'use-by'

export interface CreditUsePlan {
  credit: ResetCredit
  useByAt: number
  recommendedAt: number
  recommendation: CreditRecommendation
  normalResetsBeforeUse: number
}

interface CreditDeadline {
  credit: ResetCredit
  useByAt: number
}

interface PlanningInterval {
  startsAt: number
  endsAt: number
  deadlines: CreditDeadline[]
}

export function buildCreditUsePlans(
  credits: ResetCredit[],
  usageWindow: UsageWindow | null,
  leadTimeMinutes: number,
  nowSeconds: number
): CreditUsePlan[] {
  const deadlines = availableDeadlines(credits, leadTimeMinutes)
  const durationSeconds = (usageWindow?.windowDurationMinutes ?? 0) * 60
  const normalResetAt = usageWindow?.resetsAt ?? null

  if (normalResetAt === null || normalResetAt <= nowSeconds || durationSeconds <= 0) {
    return deadlines.map((deadline) => useByPlan(deadline, normalResetAt, durationSeconds))
  }

  const plans = new Map<string, CreditUsePlan>()
  const pace = usageWindow ? calculateUsagePace(usageWindow, nowSeconds) : null
  const projectedExhaustionAt = pace?.projectedExhaustionAt ?? null
  const projectedCredit = deadlines[0]
  const canUseProjection =
    projectedCredit !== undefined &&
    projectedExhaustionAt !== null &&
    projectedExhaustionAt > nowSeconds &&
    projectedExhaustionAt < normalResetAt &&
    projectedExhaustionAt <= projectedCredit.useByAt

  if (canUseProjection && projectedCredit && projectedExhaustionAt !== null) {
    plans.set(
      projectedCredit.credit.id,
      createPlan(
        projectedCredit,
        projectedExhaustionAt,
        'projected-exhaustion',
        normalResetAt,
        durationSeconds
      )
    )
  }

  const remaining = canUseProjection ? deadlines.slice(1) : deadlines
  const intervals = groupByNormalResetInterval(
    remaining,
    normalResetAt,
    durationSeconds
  )

  for (const interval of intervals) {
    let previousResetAt = Math.max(interval.startsAt, nowSeconds)
    if (interval.endsAt === normalResetAt && projectedExhaustionAt !== null && canUseProjection) {
      previousResetAt = Math.max(previousResetAt, projectedExhaustionAt)
    }

    for (let index = 0; index < interval.deadlines.length; index += 1) {
      const deadline = interval.deadlines[index]
      const recommendedAt = balancedUseAt(interval, index, previousResetAt)
      const recommendation =
        recommendedAt >= deadline.useByAt || recommendedAt === previousResetAt
          ? 'use-by'
          : 'balanced-spacing'
      plans.set(
        deadline.credit.id,
        createPlan(
          deadline,
          recommendedAt,
          recommendation,
          normalResetAt,
          durationSeconds
        )
      )
      previousResetAt = recommendedAt
    }
  }

  return deadlines.flatMap((deadline) => {
    const plan = plans.get(deadline.credit.id)
    return plan ? [plan] : []
  })
}

function availableDeadlines(credits: ResetCredit[], leadTimeMinutes: number): CreditDeadline[] {
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
    .map((credit) => ({
      credit,
      useByAt: (credit.expiresAt as number) - leadTimeMinutes * 60
    }))
}

function groupByNormalResetInterval(
  deadlines: CreditDeadline[],
  normalResetAt: number,
  durationSeconds: number
): PlanningInterval[] {
  const intervals = new Map<number, PlanningInterval>()

  for (const deadline of deadlines) {
    const periodsAfterCurrent = Math.max(
      0,
      Math.ceil((deadline.useByAt - normalResetAt) / durationSeconds)
    )
    const endsAt = normalResetAt + periodsAfterCurrent * durationSeconds
    const existing = intervals.get(endsAt)
    if (existing) {
      existing.deadlines.push(deadline)
      continue
    }
    intervals.set(endsAt, {
      startsAt: endsAt - durationSeconds,
      endsAt,
      deadlines: [deadline]
    })
  }

  return [...intervals.values()].sort((left, right) => left.endsAt - right.endsAt)
}

function balancedUseAt(
  interval: PlanningInterval,
  index: number,
  previousResetAt: number
): number {
  const remainingCount = interval.deadlines.length - index
  let candidate =
    previousResetAt + (interval.endsAt - previousResetAt) / (remainingCount + 1)

  for (let futureIndex = index; futureIndex < interval.deadlines.length; futureIndex += 1) {
    const positions = futureIndex - index + 1
    const deadline = interval.deadlines[futureIndex].useByAt
    candidate = Math.min(candidate, previousResetAt + (deadline - previousResetAt) / positions)
  }

  return Math.max(previousResetAt, candidate)
}

function useByPlan(
  deadline: CreditDeadline,
  normalResetAt: number | null,
  durationSeconds: number
): CreditUsePlan {
  return createPlan(deadline, deadline.useByAt, 'use-by', normalResetAt, durationSeconds)
}

function createPlan(
  deadline: CreditDeadline,
  recommendedAt: number,
  recommendation: CreditRecommendation,
  normalResetAt: number | null,
  durationSeconds: number
): CreditUsePlan {
  return {
    credit: deadline.credit,
    useByAt: deadline.useByAt,
    recommendedAt,
    recommendation,
    normalResetsBeforeUse:
      normalResetAt !== null && durationSeconds > 0 && recommendedAt >= normalResetAt
        ? Math.floor((recommendedAt - normalResetAt) / durationSeconds) + 1
        : 0
  }
}
