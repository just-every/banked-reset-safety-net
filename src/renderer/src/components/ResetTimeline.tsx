import {
  formatCompactLocalDateTime,
  formatCountdown,
  formatLocalDateTime
} from '../../../shared/time'
import {
  buildCreditUsePlans,
  normalResetTimes,
  selectPlanningLimit
} from '../../../shared/usage'
import type { ProfileRuntimeState } from '../../../shared/types'

interface ResetTimelineProps {
  runtime: ProfileRuntimeState
  leadTimeMinutes: number
  autoRedeemEnabled: boolean
  now: number
}

export function ResetTimeline({
  runtime,
  leadTimeMinutes,
  autoRedeemEnabled,
  now
}: ResetTimelineProps): React.JSX.Element | null {
  const nowSeconds = now / 1_000
  const planningLimit = selectPlanningLimit(runtime.usageLimits)
  const usageWindow = planningLimit?.primary ?? null
  const plans = buildCreditUsePlans(runtime.credits, usageWindow, leadTimeMinutes, nowSeconds)
  if (plans.length === 0) return null

  const horizon = Math.max(...plans.map(({ credit }) => credit.expiresAt as number))
  const resetMarkers = usageWindow ? normalResetTimes(usageWindow, horizon) : []
  const span = Math.max(1, horizon - nowSeconds)

  return (
    <section className="reset-planner">
      <div className="reset-planner-heading">
        <div>
          <h3>Reset planner</h3>
          <p>Normal resets, best-use points, and banked expiry on one horizon.</p>
        </div>
        <div className="planner-legend" aria-label="Timeline legend">
          <span className="legend-normal">Normal</span>
          <span className="legend-use">Use</span>
          <span className="legend-expiry">Expiry</span>
        </div>
      </div>

      <div className="planner-axis">
        <span>Now</span>
        <span>{formatLocalDateTime(horizon)}</span>
      </div>

      <div className="planner-lines">
        {plans.map((plan, index) => {
          const useLeft = markerPosition(plan.recommendedAt, nowSeconds, span)
          const expiryLeft = markerPosition(plan.credit.expiresAt as number, nowSeconds, span)
          const due = plan.useByAt <= nowSeconds
          const actionLabel =
            plan.recommendation === 'projected-exhaustion'
              ? 'Best use'
              : autoRedeemEnabled
                ? 'Auto-use'
                : 'Suggested latest use'

          return (
            <div className="planner-line" key={plan.credit.id}>
              <div className="planner-line-label">
                <span>
                  {plan.credit.title ?? `Banked reset ${index + 1}`} · expires{' '}
                  {formatCompactLocalDateTime(plan.credit.expiresAt as number)}
                </span>
                <strong>{formatCountdown(plan.credit.expiresAt as number, now)}</strong>
              </div>
              <div className="planner-track">
                {resetMarkers.map((resetAt) => (
                  <span
                    className="planner-marker normal"
                    key={resetAt}
                    style={{ left: `${markerPosition(resetAt, nowSeconds, span)}%` }}
                    title={`Normal usage reset ${formatLocalDateTime(resetAt)}`}
                  />
                ))}
                <span
                  className={`planner-marker use ${due ? 'is-due' : ''}`}
                  style={{ left: `${useLeft}%` }}
                  title={`${actionLabel} ${formatLocalDateTime(plan.recommendedAt)}`}
                />
                <span
                  className="planner-marker expiry"
                  style={{ left: `${expiryLeft}%` }}
                  title={`Expires ${formatLocalDateTime(plan.credit.expiresAt as number)}`}
                />
              </div>
              <div className="planner-line-detail">
                <span>
                  {due
                    ? 'Use-by time reached'
                    : `${actionLabel} ${formatCompactLocalDateTime(plan.recommendedAt)}`}
                  {plan.recommendation === 'projected-exhaustion'
                    ? ' · projected full usage'
                    : ` · ${leadTimeMinutes} min before expiry`}
                </span>
                <span>{windowPositionLabel(plan.normalResetsBeforeUse)}</span>
              </div>
              {plan.recommendation === 'projected-exhaustion' && autoRedeemEnabled ? (
                <div className="planner-safety">
                  Auto-use safety net remains {formatCompactLocalDateTime(plan.useByAt)}.
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function markerPosition(timestamp: number, nowSeconds: number, span: number): number {
  return Math.min(100, Math.max(0, ((timestamp - nowSeconds) / span) * 100))
}

function windowPositionLabel(normalResetsBeforeUse: number): string {
  if (normalResetsBeforeUse === 0) return 'Current usage window'
  if (normalResetsBeforeUse === 1) return 'After 1 normal reset'
  return `After ${normalResetsBeforeUse} normal resets`
}
