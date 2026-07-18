import { findNextExpiringCredit, formatCountdown, formatLocalDateTime } from '../../../shared/time'
import {
  calculateUsagePace,
  displayUsageLimits,
  formatUsagePercent,
  formatUsageWindowDuration,
  usagePaceLabel
} from '../../../shared/usage'
import type { AppViewState, UsageLimit, UsageWindow } from '../../../shared/types'

interface UsageOverviewProps {
  state: AppViewState
  now: number
  refreshing: boolean
  onRefresh(): void
}

interface OverviewLine {
  key: string
  profileName: string
  limit: UsageLimit
  window: UsageWindow
  windowKind: 'primary' | 'secondary'
}

export function UsageOverview({
  state,
  now,
  refreshing,
  onRefresh
}: UsageOverviewProps): React.JSX.Element {
  const lines = buildOverviewLines(state)
  const overPaceCount = lines.filter(
    ({ window }) => calculateUsagePace(window, now / 1_000).status === 'over'
  ).length
  const next = findNextExpiringCredit(state.profiles, now / 1_000)
  const nextProfile = next
    ? state.settings.profiles.find((profile) => profile.id === next.profileId)
    : null

  return (
    <section className="hero-card usage-overview">
      <div className="overview-heading">
        <div>
          <div className="hero-label">Usage status</div>
          <div className="overview-title">
            {lines.length === 0
              ? 'Waiting for Codex usage'
              : overPaceCount > 0
                ? `${overPaceCount} ${overPaceCount === 1 ? 'window' : 'windows'} over pace`
                : 'Usage is on track'}
          </div>
        </div>
        <button className="refresh-button" type="button" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="overview-lines">
        {lines.map((line) => (
          <OverviewUsageLine key={line.key} line={line} now={now} />
        ))}
      </div>

      <div className="overview-bank">
        <span className="overview-bank-dot" aria-hidden="true" />
        {next?.credit.expiresAt ? (
          <span>
            Next banked reset: <strong>{formatCountdown(next.credit.expiresAt, now)}</strong>
            {' · '}
            {nextProfile?.name ?? 'Codex'} · expires {formatLocalDateTime(next.credit.expiresAt)}
          </span>
        ) : (
          <span>No expiring banked reset found.</span>
        )}
      </div>
    </section>
  )
}

function OverviewUsageLine({ line, now }: { line: OverviewLine; now: number }): React.JSX.Element {
  const pace = calculateUsagePace(line.window, now / 1_000)
  const label = line.limit.name ?? (line.limit.id === 'codex' ? 'Codex' : line.limit.id)
  const windowLabel = formatUsageWindowDuration(line.window.windowDurationMinutes)

  return (
    <div className="overview-line">
      <div className="overview-line-name" title={`${line.profileName} · ${label}`}>
        {line.profileName} · {label}
        {line.windowKind === 'secondary' ? ' secondary' : ''}
      </div>
      <div className="overview-mini-meter" aria-hidden="true">
        <span style={{ width: `${line.window.usedPercent}%` }} />
      </div>
      <div className="overview-line-value">{formatUsagePercent(pace.remainingPercent)} left</div>
      <div className={`pace-badge is-${pace.status}`}>{usagePaceLabel(pace.status)}</div>
      <div className="overview-line-reset">
        {line.window.resetsAt
          ? `${windowLabel} resets in ${formatCountdown(line.window.resetsAt, now)}`
          : `${windowLabel} reset unknown`}
      </div>
    </div>
  )
}

function buildOverviewLines(state: AppViewState): OverviewLine[] {
  const lines: OverviewLine[] = []
  for (const runtime of state.profiles) {
    if (runtime.status !== 'ready') continue
    const profile = state.settings.profiles.find((candidate) => candidate.id === runtime.profileId)
    if (!profile?.enabled) continue

    for (const limit of displayUsageLimits(runtime.usageLimits)) {
      if (limit.primary) {
        lines.push({
          key: `${runtime.profileId}:${limit.id}:primary`,
          profileName: profile.name,
          limit,
          window: limit.primary,
          windowKind: 'primary'
        })
      }
      if (limit.secondary) {
        lines.push({
          key: `${runtime.profileId}:${limit.id}:secondary`,
          profileName: profile.name,
          limit,
          window: limit.secondary,
          windowKind: 'secondary'
        })
      }
    }
  }
  return lines
}
