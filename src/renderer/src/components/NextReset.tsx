import { findNextExpiringCredit, formatCountdown, formatLocalDateTime } from '../../../shared/time'
import type { AppViewState } from '../../../shared/types'

interface NextResetProps {
  state: AppViewState
  now: number
  refreshing: boolean
  onRefresh(): void
}

export function NextReset({ state, now, refreshing, onRefresh }: NextResetProps): React.JSX.Element {
  const next = findNextExpiringCredit(state.profiles, now / 1_000)
  const profile = next
    ? state.settings.profiles.find((candidate) => candidate.id === next.profileId)
    : null

  return (
    <section className="hero-card">
      <div className="hero-label">Next banked reset</div>
      {next?.credit.expiresAt ? (
        <>
          <div className="hero-countdown">{formatCountdown(next.credit.expiresAt, now)}</div>
          <div className="hero-detail">
            {profile?.name ?? 'Codex'} · expires {formatLocalDateTime(next.credit.expiresAt)}
          </div>
        </>
      ) : (
        <>
          <div className="hero-empty">No expiring reset found</div>
          <div className="hero-detail">Add or refresh a Codex home to check again.</div>
        </>
      )}
      <button className="refresh-button" type="button" onClick={onRefresh} disabled={refreshing}>
        {refreshing ? 'Refreshing…' : 'Refresh'}
      </button>
    </section>
  )
}
