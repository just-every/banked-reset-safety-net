import { useState } from 'react'
import { buildCreditUsePlans } from '../../../shared/creditPlanning'
import { findNextScheduledResetForProfile } from '../../../shared/resetSchedule'
import { formatCompactLocalDateTime } from '../../../shared/time'
import { calculateUsagePace, selectPlanningLimit } from '../../../shared/usage'
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
  onPrepareManualUse(profileId: string, creditId: string): void
}

interface ProfilePair {
  profile: ProfileSettings
  runtime: ProfileRuntimeState
}

export function UsageRhythmDashboard({
  state,
  now,
  refreshing,
  onRefresh,
  onPrepareManualUse
}: UsageRhythmDashboardProps): React.JSX.Element {
  const pairs = state.settings.profiles.flatMap((profile) => {
    const runtime = state.profiles.find((candidate) => candidate.profileId === profile.id)
    return runtime && profile.enabled ? [{ profile, runtime }] : []
  })
  const overviewPairs = pairs.filter(({ runtime }) => runtime.status === 'ready')
  const preferred = overviewPairs[0]
  const [selectedId, setSelectedId] = useState(preferred?.profile.id ?? '')
  const selected = overviewPairs.find(({ profile }) => profile.id === selectedId) ?? preferred

  if (!selected) {
    return (
      <section className="rhythm-message">
        No connected Codex homes currently have usage available. Check them in Settings.
      </section>
    )
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
        items={overviewPairs}
        selectedId={selected.profile.id}
        now={now}
        onSelect={setSelectedId}
      />

      <SelectedProfileRhythm
        pair={selected}
        history={state.resetHistory.filter((event) => event.profileId === selected.profile.id)}
        expiryWarnings={state.expiryWarnings}
        now={now}
        onPrepareManualUse={onPrepareManualUse}
      />
    </div>
  )
}

function SelectedProfileRhythm({
  pair,
  history,
  expiryWarnings,
  onPrepareManualUse,
  now
}: {
  pair: ProfilePair
  history: AppViewState['resetHistory']
  expiryWarnings: AppViewState['expiryWarnings']
  onPrepareManualUse(profileId: string, creditId: string): void
  now: number
}): React.JSX.Element {
  const { profile, runtime } = pair
  if (runtime.status === 'loading') return <section className="rhythm-message">Checking Codex…</section>
  if (runtime.status === 'error') return <section className="rhythm-message is-error">{runtime.error}</section>
  if (runtime.status !== 'ready') return <section className="rhythm-message">Tracking paused.</section>

  const usageWindow = selectPlanningLimit(runtime.usageLimits)?.primary ?? null
  const plans = buildCreditUsePlans(
    runtime.credits,
    usageWindow,
    profile.leadTimeMinutes,
    now / 1_000
  )
  if (!usageWindow) {
    return (
      <>
        <section className="rhythm-message">
          Codex did not supply its normal usage window. Available banked resets remain reviewable.
        </section>
        <BankedResetList
          plans={plans}
          leadTimeMinutes={profile.leadTimeMinutes}
          autoRedeemEnabled={profile.autoRedeemEnabled}
          expiryWarnings={expiryWarnings}
          profileId={profile.id}
          onPrepareManualUse={onPrepareManualUse}
          now={now}
        />
      </>
    )
  }

  const nextReset = findNextScheduledResetForProfile(runtime, profile, now / 1_000)
  const pace = calculateUsagePace(usageWindow, now / 1_000)

  return (
    <>
      <NextResetHero window={usageWindow} reset={nextReset} now={now} />
      <UsageRhythmGauge window={usageWindow} now={now} />
      <ResetCalendar usageWindow={usageWindow} plans={plans} history={history} now={now} />
      <BankedResetList
        plans={plans}
        leadTimeMinutes={profile.leadTimeMinutes}
        autoRedeemEnabled={profile.autoRedeemEnabled}
        expiryWarnings={expiryWarnings}
        profileId={profile.id}
        onPrepareManualUse={onPrepareManualUse}
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
