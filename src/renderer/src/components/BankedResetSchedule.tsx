import {
  formatCompactLocalDateTime,
  formatCountdown
} from '../../../shared/time'
import { buildCreditUsePlans, selectPlanningLimit } from '../../../shared/usage'
import type { ProfileRuntimeState } from '../../../shared/types'

interface BankedResetScheduleProps {
  runtime: ProfileRuntimeState
  leadTimeMinutes: number
  autoRedeemEnabled: boolean
  now: number
}

export function BankedResetSchedule({
  runtime,
  leadTimeMinutes,
  autoRedeemEnabled,
  now
}: BankedResetScheduleProps): React.JSX.Element | null {
  const nowSeconds = now / 1_000
  const usageWindow = selectPlanningLimit(runtime.usageLimits)?.primary ?? null
  const plans = buildCreditUsePlans(runtime.credits, usageWindow, leadTimeMinutes, nowSeconds)
  if (plans.length === 0) return null

  return (
    <section className="banked-reset-schedule">
      <div className="banked-schedule-heading">
        <h3>Banked resets</h3>
        <span>{autoRedeemEnabled ? 'Automatic' : 'Reminder only'}</span>
      </div>

      <div className="banked-schedule-list">
        {plans.map((plan, index) => {
          const expiresAt = plan.credit.expiresAt as number
          const due = plan.useByAt <= nowSeconds
          return (
            <div className={`banked-schedule-row ${due ? 'is-due' : ''}`} key={plan.credit.id}>
              <div className="banked-schedule-main">
                <div>
                  <span className="banked-schedule-label">
                    {plan.credit.title ?? `Banked reset ${index + 1}`}
                  </span>
                  <strong>
                    {due ? 'Use-by reached' : `Use by ${formatCompactLocalDateTime(plan.useByAt)}`}
                  </strong>
                </div>
                <span className="banked-schedule-countdown">{formatCountdown(expiresAt, now)}</span>
              </div>
              <div className="banked-schedule-detail">
                <span>Expires {formatCompactLocalDateTime(expiresAt)}</span>
                <span>{leadTimeMinutes} min safety</span>
              </div>
              {plan.recommendation === 'projected-exhaustion' ? (
                <div className="banked-schedule-advice">
                  Best after projected full use: {formatCompactLocalDateTime(plan.recommendedAt)}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}
