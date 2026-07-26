import { formatCountdown } from '../../../shared/time'
import { findNextScheduledResetForProfile } from '../../../shared/resetSchedule'
import {
  calculateUsagePace,
  formatUsagePaceDifference,
  formatUsagePercent,
  selectPlanningLimit,
  usagePaceLabel
} from '../../../shared/usage'
import type { ProfileRuntimeState, ProfileSettings } from '../../../shared/types'

export interface ProfileStatusItem {
  profile: ProfileSettings
  runtime: ProfileRuntimeState
}

interface ProfileStatusRowsProps {
  items: ProfileStatusItem[]
  selectedId: string
  now: number
  onSelect(profileId: string): void
}

export function ProfileStatusRows({
  items,
  selectedId,
  now,
  onSelect
}: ProfileStatusRowsProps): React.JSX.Element {
  return (
    <div className="profile-status-rows" role="tablist" aria-label="Tracked Codex homes">
      {items.map((item) => (
        <ProfileStatusRow
          item={item}
          selected={item.profile.id === selectedId}
          now={now}
          onSelect={onSelect}
          key={item.profile.id}
        />
      ))}
    </div>
  )
}

function ProfileStatusRow({
  item,
  selected,
  now,
  onSelect
}: {
  item: ProfileStatusItem
  selected: boolean
  now: number
  onSelect(profileId: string): void
}): React.JSX.Element {
  const { profile, runtime } = item
  const usageWindow =
    runtime.status === 'ready' ? selectPlanningLimit(runtime.usageLimits)?.primary ?? null : null
  const pace = usageWindow ? calculateUsagePace(usageWindow, now / 1_000) : null
  const nextReset = findNextScheduledResetForProfile(runtime, profile, now / 1_000)
  const usedPercent = clampPercent(usageWindow?.usedPercent ?? 0)
  const elapsedPercent = clampPercent(pace?.expectedUsedPercent ?? 0)

  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      className={`profile-status-row${selected ? ' is-selected' : ''}`}
      onClick={() => onSelect(profile.id)}
    >
      <span className="profile-status-identity">
        <span className={`profile-state is-${runtime.status}`} aria-hidden="true" />
        <strong>{profile.name}</strong>
        {selected ? <small>Selected</small> : null}
      </span>
      {usageWindow && pace ? (
        <>
          <span className={`profile-status-overview is-${pace.status}`}>
            <span className="profile-status-overview-copy">
              <strong>{formatUsagePercent(usageWindow.usedPercent)} used</strong>
              <small>
                {usagePaceLabel(pace.status)} ·{' '}
                {formatUsagePaceDifference(pace.differencePercentagePoints)}
              </small>
            </span>
            <span
              className="profile-status-progress"
              role="img"
              aria-label={`${formatUsagePercent(usedPercent)} used; ${formatUsagePercent(
                elapsedPercent
              )} of the reset window elapsed`}
            >
              <span
                className="profile-status-time-elapsed"
                style={{ width: `${elapsedPercent}%` }}
              />
              <span
                className="profile-status-usage-progress"
                style={{ width: `${usedPercent}%` }}
              />
              <span
                className="profile-status-time-marker"
                style={{ left: `${elapsedPercent}%` }}
              />
            </span>
          </span>
          <span className="profile-status-reset">
            <strong>
              {nextReset ? formatCountdown(nextReset.occursAt, now) : 'Unavailable'}
            </strong>
            <small>
              {nextReset?.kind === 'banked' ? 'next banked reset' : 'next normal reset'}
            </small>
          </span>
        </>
      ) : (
        <span className={`profile-status-unavailable is-${runtime.status}`}>
          {runtime.status === 'loading'
            ? 'Checking usage…'
            : runtime.status === 'error'
              ? 'Usage unavailable'
              : runtime.status === 'ready'
                ? 'Normal usage unavailable'
                : 'Tracking paused'}
        </span>
      )}
      <span className="profile-status-chevron" aria-hidden="true">
        ›
      </span>
    </button>
  )
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value))
}
