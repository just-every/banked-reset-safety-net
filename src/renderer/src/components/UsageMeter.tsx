import { formatCountdown, formatLocalDateTime } from '../../../shared/time'
import {
  calculateUsagePace,
  formatUsagePercent,
  formatUsageWindowDuration,
  usagePaceLabel
} from '../../../shared/usage'
import type { UsageLimit, UsageWindow } from '../../../shared/types'

interface UsageMeterProps {
  limit: UsageLimit
  window: UsageWindow
  windowKind: 'primary' | 'secondary'
  now: number
}

export function UsageMeter({ limit, window, windowKind, now }: UsageMeterProps): React.JSX.Element {
  const pace = calculateUsagePace(window, now / 1_000)
  const limitName = limit.name ?? (limit.id === 'codex' ? 'Codex' : limit.id)
  const duration = formatUsageWindowDuration(window.windowDurationMinutes)

  return (
    <div className="usage-meter">
      <div className="usage-meter-heading">
        <div>
          <span className="usage-meter-name">{limitName}</span>
          <span className="usage-meter-window">
            {duration} {windowKind === 'secondary' ? 'secondary ' : ''}usage
          </span>
        </div>
        <strong>{formatUsagePercent(pace.remainingPercent)} left</strong>
      </div>

      <div
        className="usage-track"
        role="img"
        aria-label={`${formatUsagePercent(window.usedPercent)} used; ${formatUsagePercent(pace.remainingPercent)} remaining`}
      >
        <span className="usage-fill" style={{ width: `${window.usedPercent}%` }} />
        {pace.expectedUsedPercent !== null ? (
          <span
            className="usage-expected-marker"
            style={{ left: `${Math.min(100, pace.expectedUsedPercent)}%` }}
            title={`${formatUsagePercent(pace.expectedUsedPercent)} expected by now`}
          />
        ) : null}
      </div>

      <div className="usage-meter-detail">
        <span>{formatUsagePercent(window.usedPercent)} used</span>
        {pace.expectedUsedPercent !== null ? (
          <span>{formatUsagePercent(pace.expectedUsedPercent)} expected by now</span>
        ) : null}
        <span className={`pace-badge is-${pace.status}`}>{usagePaceLabel(pace.status)}</span>
      </div>

      <div className="usage-reset-detail">
        {window.resetsAt ? (
          <>
            Normal reset in <strong>{formatCountdown(window.resetsAt, now)}</strong>
            {' · '}
            {formatLocalDateTime(window.resetsAt)}
          </>
        ) : (
          'Codex did not supply the normal reset time.'
        )}
      </div>
    </div>
  )
}
