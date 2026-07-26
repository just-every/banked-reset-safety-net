import { formatCountdown, formatLocalDateTime } from '../../../shared/time'
import type { ScheduledReset } from '../../../shared/resetSchedule'
import {
  calculateUsagePace,
  formatUsagePaceDifference,
  formatUsagePercent,
  usagePaceLabel
} from '../../../shared/usage'
import type { UsageWindow } from '../../../shared/types'

interface NextResetHeroProps {
  window: UsageWindow
  reset: ScheduledReset | null
  now: number
}

export function NextResetHero({ window, reset, now }: NextResetHeroProps): React.JSX.Element {
  const pace = calculateUsagePace(window, now / 1_000)
  const resetKind = reset?.kind === 'banked' ? 'banked' : 'normal'

  return (
    <section className="next-reset-hero" aria-label={`Next ${resetKind} reset`}>
      <div className="next-reset-label">
        <span className="next-reset-clock" aria-hidden="true" />
        Next {resetKind} reset in
      </div>
      {reset ? (
        <>
          <strong className="next-reset-countdown" aria-live="off">
            {formatCountdown(reset.occursAt, now)}
          </strong>
          <time dateTime={new Date(reset.occursAt * 1_000).toISOString()}>
            {formatLocalDateTime(reset.occursAt)}
          </time>
        </>
      ) : (
        <strong className="next-reset-countdown is-unavailable">Time unavailable</strong>
      )}
      <div className="next-reset-context">
        <span>{formatUsagePercent(window.usedPercent)} used</span>
        <span className={`is-${pace.status}`}>{usagePaceLabel(pace.status)}</span>
        <span>{formatUsagePaceDifference(pace.differencePercentagePoints)}</span>
      </div>
    </section>
  )
}
