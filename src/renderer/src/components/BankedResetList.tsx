import { formatCountdown, formatLocalDateTime } from '../../../shared/time'
import type { CreditUsePlan } from '../../../shared/usage'

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
            const isProjected = plan.recommendation === 'projected-exhaustion'
            return (
              <div className="rhythm-banked-row" key={plan.credit.id}>
                <span className="banked-index">{index + 1}</span>
                <div className="banked-copy">
                  <div>
                    <strong>
                      {isProjected ? 'Best use' : 'Use by'}: {formatLocalDateTime(plan.recommendedAt)}
                    </strong>
                    <span className={isProjected ? 'is-projected' : ''}>
                      {isProjected ? 'Projected full use' : 'Safety cutoff'}
                    </span>
                  </div>
                  <p>Expires {formatLocalDateTime(expiry)} · {formatCountdown(expiry, now)}</p>
                </div>
                <div className="banked-state">
                  <strong>{autoRedeemEnabled ? 'Automatic' : 'Available'}</strong>
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
