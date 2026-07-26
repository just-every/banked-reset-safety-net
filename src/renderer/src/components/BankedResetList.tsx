import { formatCountdown, formatLocalDateTime } from '../../../shared/time'
import type { CreditUsePlan } from '../../../shared/creditPlanning'

interface BankedResetListProps {
  plans: CreditUsePlan[]
  leadTimeMinutes: number
  autoRedeemEnabled: boolean
  now: number
}

export function BankedResetList({
  plans,
  leadTimeMinutes,
  autoRedeemEnabled,
  now
}: BankedResetListProps): React.JSX.Element {
  return (
    <section className="rhythm-banked-section">
      <div className="rhythm-section-heading">
        <h3><span className="banked-stack-icon" aria-hidden="true" /> Banked resets</h3>
        <p>{autoRedeemEnabled ? 'Automatic safety enabled' : 'Reminder only'}</p>
      </div>

      {plans.length === 0 ? (
        <div className="rhythm-empty">No available banked resets.</div>
      ) : (
        <div className="rhythm-banked-list">
          {plans.map((plan, index) => {
            const expiry = plan.credit.expiresAt as number
            const isRecommended = plan.recommendation !== 'use-by'
            const recommendationLabel =
              plan.recommendation === 'projected-exhaustion'
                ? 'Projected full use'
                : plan.recommendation === 'balanced-spacing'
                  ? 'Balanced between resets'
                  : 'Safety cutoff'
            return (
              <div className="rhythm-banked-row" key={plan.credit.id}>
                <span className="banked-index">{index + 1}</span>
                <div className="banked-copy">
                  <div>
                    <strong>
                      {isRecommended ? 'Best use' : 'Use by'}:{' '}
                      {formatLocalDateTime(plan.recommendedAt)}
                    </strong>
                    <span className={isRecommended ? 'is-recommended' : ''}>
                      {recommendationLabel}
                    </span>
                  </div>
                  <p>Expires {formatLocalDateTime(expiry)} · {formatCountdown(expiry, now)}</p>
                </div>
                <div className="banked-state">
                  <strong>Available</strong>
                  <span>{leadTimeMinutes} min safety</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
