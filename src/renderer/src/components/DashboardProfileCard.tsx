import { formatHomePathForDisplay } from '../../../shared/pathDisplay'
import type { ProfileRuntimeState, ProfileSettings } from '../../../shared/types'
import { ProfileRuntime } from './ProfileRuntime'

export function DashboardProfileCard({
  profile,
  runtime,
  now
}: {
  profile: ProfileSettings
  runtime: ProfileRuntimeState
  now: number
}): React.JSX.Element {
  return (
    <article className={`profile-card dashboard-profile ${profile.enabled ? '' : 'is-disabled'}`}>
      <div className="profile-heading">
        <div>
          <h3>{profile.name}</h3>
          <div className="profile-home" title={profile.codexHome}>
            {formatHomePathForDisplay(profile.codexHome)}
          </div>
        </div>
        <span className={`tracking-badge ${profile.enabled ? 'is-active' : ''}`}>
          {profile.enabled ? 'Tracking' : 'Paused'}
        </span>
      </div>
      <ProfileRuntime
        runtime={runtime}
        now={now}
        leadTimeMinutes={profile.leadTimeMinutes}
        autoRedeemEnabled={profile.autoRedeemEnabled}
      />
    </article>
  )
}
