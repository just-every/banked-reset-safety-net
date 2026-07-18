import { useState } from 'react'
import { buildResetCalendar } from '../../../shared/resetCalendar'
import { formatCompactLocalDateTime } from '../../../shared/time'
import { buildCreditUsePlans, calculateUsagePace, selectPlanningLimit } from '../../../shared/usage'
import type { AppViewState, ProfileRuntimeState, ProfileSettings } from '../../../shared/types'
import { BankedResetList } from './BankedResetList'
import { NextResetHero } from './NextResetHero'
import { ProfileStatusRows } from './ProfileStatusRows'
import { ResetCalendar } from './ResetCalendar'
import { UsageRhythmGauge } from './UsageRhythmGauge'

interface UsageRhythmDashboardProps {
  state: AppViewState
  now: number
  refreshing: boolean
  onRefresh(): void
}

interface ProfilePair {
  profile: ProfileSettings
  runtime: ProfileRuntimeState
}

export function UsageRhythmDashboard({
  state,
  now,
  refreshing,
  onRefresh
}: UsageRhythmDashboardProps): React.JSX.Element {
  const pairs = state.settings.profiles.flatMap((profile) => {
    const runtime = state.profiles.find((candidate) => candidate.profileId === profile.id)
    return runtime && profile.enabled ? [{ profile, runtime }] : []
  })
  const preferred = pairs.find(({ runtime }) => runtime.status === 'ready') ?? pairs[0]
  const [selectedId, setSelectedId] = useState(preferred?.profile.id ?? '')
  const selected = pairs.find(({ profile }) => profile.id === selectedId) ?? preferred

  if (!selected) {
    return <section className="rhythm-message">No enabled Codex homes. Add one in Settings.</section>
  }

  return (
    <div className="usage-rhythm-dashboard">
      <header className="rhythm-header">
        <button className="rhythm-refresh" type="button" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
        <div className="rhythm-title">
          <span className="rhythm-clock" aria-hidden="true" />
          <h2>{selected.profile.name}</h2>
        </div>
        <p>Reset rhythm · normal usage and banked reset timing</p>
      </header>

      <ProfileStatusRows
        items={pairs}
        selectedId={selected.profile.id}
        now={now}
        onSelect={setSelectedId}
      />

      <SelectedProfileRhythm pair={selected} now={now} />
    </div>
  )
}

function SelectedProfileRhythm({ pair, now }: { pair: ProfilePair; now: number }): React.JSX.Element {
  const { profile, runtime } = pair
  if (runtime.status === 'loading') return <section className="rhythm-message">Checking Codex…</section>
  if (runtime.status === 'error') return <section className="rhythm-message is-error">{runtime.error}</section>
  if (runtime.status !== 'ready') return <section className="rhythm-message">Tracking paused.</section>

  const usageWindow = selectPlanningLimit(runtime.usageLimits)?.primary ?? null
  if (!usageWindow) {
    return <section className="rhythm-message">Codex did not supply its normal usage window.</section>
  }

  const plans = buildCreditUsePlans(
    runtime.credits,
    usageWindow,
    profile.leadTimeMinutes,
    now / 1_000
  )
  const calendar = buildResetCalendar(usageWindow, plans, now / 1_000)
  const pace = calculateUsagePace(usageWindow, now / 1_000)

  return (
    <>
      <NextResetHero window={usageWindow} now={now} />
      <UsageRhythmGauge window={usageWindow} now={now} />
      <ResetCalendar calendar={calendar} />
      <BankedResetList
        plans={plans}
        leadTimeMinutes={profile.leadTimeMinutes}
        autoRedeemEnabled={profile.autoRedeemEnabled}
        now={now}
      />
      <section className="pace-insight">
        <span className="pace-insight-icon" aria-hidden="true" />
        <div>
          <strong>Pace insight</strong>
          <p>{paceInsight(pace.differencePercentagePoints)}</p>
        </div>
        <div className="pace-insight-action">
          {plans[0]
            ? `Next banked decision: ${formatCompactLocalDateTime(plans[0].recommendedAt)}.`
            : 'No banked reset decision is currently scheduled.'}
        </div>
      </section>
    </>
  )
}

function paceInsight(difference: number | null): string {
  if (difference === null) return 'Waiting for enough timing data to compare your rhythm.'
  const points = Math.abs(difference)
  if (difference > 5) return `Usage is ${points.toFixed(1)} points ahead of elapsed time.`
  if (difference < -5) return `Usage is ${points.toFixed(1)} points behind elapsed time.`
  return 'Usage is aligned with elapsed time in the current window.'
}
