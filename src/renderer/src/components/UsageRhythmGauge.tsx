import { formatCountdown, formatLocalDateTime } from '../../../shared/time'
import {
  calculateUsagePace,
  formatUsagePercent,
  usagePaceLabel
} from '../../../shared/usage'
import type { UsageWindow } from '../../../shared/types'

interface UsageRhythmGaugeProps {
  window: UsageWindow
  now: number
}

export function UsageRhythmGauge({ window, now }: UsageRhythmGaugeProps): React.JSX.Element {
  const pace = calculateUsagePace(window, now / 1_000)
  const used = Math.min(100, Math.max(0, window.usedPercent))
  const circumference = 2 * Math.PI * 74
  const dashOffset = circumference * (1 - used / 100)
  const rhythmRatio = Math.min(
    200,
    Math.max(0, 100 + (pace.differencePercentagePoints ?? 0))
  )

  return (
    <section className="rhythm-gauge-section">
      <div className={`rhythm-status is-${pace.status}`}>
        <div className="rhythm-status-label">
          <span aria-hidden="true" />
          {usagePaceLabel(pace.status)}
        </div>
        <p>{paceDescription(pace.status)}</p>
      </div>

      <div
        className="rhythm-ring"
        role="img"
        aria-label={`${formatUsagePercent(used)} of normal Codex usage used`}
      >
        <svg viewBox="0 0 170 170" aria-hidden="true">
          <circle className="rhythm-ring-track" cx="85" cy="85" r="74" />
          <circle
            className="rhythm-ring-progress"
            cx="85"
            cy="85"
            r="74"
            style={{ strokeDasharray: circumference, strokeDashoffset: dashOffset }}
          />
        </svg>
        <div className="rhythm-ring-value">
          <strong>{formatUsagePercent(used)}</strong>
          <span>used this window</span>
        </div>
      </div>

      <div className="rhythm-reset-summary">
        <span>Normal reset</span>
        {window.resetsAt ? (
          <>
            <strong>{formatCountdown(window.resetsAt, now)}</strong>
            <small>{formatLocalDateTime(window.resetsAt)}</small>
          </>
        ) : (
          <strong>Time unavailable</strong>
        )}
      </div>

      <div className="rhythm-scale">
        <div className="rhythm-scale-line">
          <span className="rhythm-scale-marker" style={{ left: `${rhythmRatio / 2}%` }} />
          <span className="rhythm-scale-ideal" />
        </div>
        <div className="rhythm-scale-labels">
          <span>0%<small>behind</small></span>
          <span>100%<small>ideal</small></span>
          <span>200%<small>ahead</small></span>
        </div>
      </div>
    </section>
  )
}

function paceDescription(status: ReturnType<typeof calculateUsagePace>['status']): string {
  if (status === 'over') return 'Usage is moving faster than elapsed time.'
  if (status === 'under') return 'You have more usage left than expected.'
  if (status === 'on-pace') return 'You are aligned with the current window.'
  return 'Codex has not supplied enough timing data.'
}
