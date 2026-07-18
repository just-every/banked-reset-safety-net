import { formatCountdown, formatLocalDateTime } from '../../../shared/time'
import {
  calculateUsagePace,
  formatUsagePaceDifference,
  formatUsagePercent,
  usagePaceLabel
} from '../../../shared/usage'
import type { UsageWindow } from '../../../shared/types'

interface NextResetHeroProps {
  window: UsageWindow
  now: number
}

export function NextResetHero({ window, now }: NextResetHeroProps): React.JSX.Element {
  const pace = calculateUsagePace(window, now / 1_000)

  return (
    <section className="next-reset-hero" aria-label="Next normal usage reset">
      <div className="next-reset-label">
        <span className="next-reset-clock" aria-hidden="true" />
        Next reset in
      </div>
      {window.resetsAt ? (
        <>
          <strong className="next-reset-countdown" aria-live="off">
            {formatCountdown(window.resetsAt, now)}
          </strong>
          <time dateTime={new Date(window.resetsAt * 1_000).toISOString()}>
            {formatLocalDateTime(window.resetsAt)}
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
