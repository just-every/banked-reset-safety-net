import { formatCountdown } from '../../../shared/time'
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
          <span className="profile-status-usage">
            <strong>{formatUsagePercent(usageWindow.usedPercent)}</strong>
            <small>used</small>
          </span>
          <span className={`profile-status-pace is-${pace.status}`}>
            <strong>{usagePaceLabel(pace.status)}</strong>
            <small>{formatUsagePaceDifference(pace.differencePercentagePoints)}</small>
          </span>
          <span className="profile-status-reset">
            <strong>
              {usageWindow.resetsAt ? formatCountdown(usageWindow.resetsAt, now) : 'Unavailable'}
            </strong>
            <small>next reset</small>
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
