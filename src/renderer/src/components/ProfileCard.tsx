import { useEffect, useState } from 'react'
import type {
  ProfileSettings,
  UpdateProfileInput
} from '../../../shared/types'
import { MAX_LEAD_TIME_MINUTES } from '../../../shared/types'
import { formatHomePathForDisplay } from '../../../shared/pathDisplay'

interface ProfileCardProps {
  profile: ProfileSettings
  run(action: () => Promise<void>): Promise<void>
}

export function ProfileCard({ profile, run }: ProfileCardProps): React.JSX.Element {
  const [leadTime, setLeadTime] = useState(String(profile.leadTimeMinutes))
  useEffect(() => setLeadTime(String(profile.leadTimeMinutes)), [profile.leadTimeMinutes])

  const update = (input: UpdateProfileInput): Promise<void> =>
    run(() => window.resetNet.updateProfile(profile.id, input))

  const toggleAutomaticUse = async (enabled: boolean): Promise<void> => {
    if (!enabled) {
      await update({ autoRedeemEnabled: false })
      return
    }

    const confirmed = window.confirm(
      `Enable real automatic reset use for “${profile.name}”?\n\n` +
        `Reset Net will ask Codex to use the earliest banked reset ${profile.leadTimeMinutes} minutes before it expires. ` +
        `It targets that exact reset, holds an exclusive lock, and cannot undo a successful use.`
    )
    if (confirmed) {
      await update({ autoRedeemEnabled: true, autoRedeemConfirmed: true })
    }
  }

  const saveLeadTime = (): void => {
    const value = Number(leadTime)
    if (Number.isInteger(value) && value !== profile.leadTimeMinutes) {
      void update({ leadTimeMinutes: value })
    } else {
      setLeadTime(String(profile.leadTimeMinutes))
    }
  }

  const changeHome = async (): Promise<void> => {
    const selected = await window.resetNet.chooseCodexHome()
    if (!selected || selected === profile.codexHome) return
    if (
      window.confirm(
        `Change “${profile.name}” to ${selected}? Automatic use will be switched off for safety.`
      )
    ) {
      await update({ codexHome: selected })
    }
  }

  const remove = async (): Promise<void> => {
    if (window.confirm(`Stop tracking “${profile.name}”? This does not change the Codex home.`)) {
      await run(() => window.resetNet.removeProfile(profile.id))
    }
  }

  return (
    <article className={`profile-card ${profile.enabled ? '' : 'is-disabled'}`}>
      <div className="profile-heading">
        <div>
          <input
            className="profile-name"
            aria-label="Profile name"
            defaultValue={profile.name}
            key={profile.name}
            onBlur={(event) => {
              if (event.currentTarget.value.trim() !== profile.name) {
                void update({ name: event.currentTarget.value })
              }
            }}
          />
          <div className="profile-home" title={profile.codexHome}>
            {formatHomePathForDisplay(profile.codexHome)}
          </div>
        </div>
        <label className="switch-label">
          <span>Track</span>
          <input
            type="checkbox"
            checked={profile.enabled}
            onChange={(event) => void update({ enabled: event.currentTarget.checked })}
          />
        </label>
      </div>

      <div className="automation-row">
        <label className="switch-label automatic-switch">
          <input
            type="checkbox"
            checked={profile.autoRedeemEnabled}
            disabled={!profile.enabled}
            onChange={(event) => void toggleAutomaticUse(event.currentTarget.checked)}
          />
          <span>Use automatically</span>
        </label>
        <label className="lead-time-field">
          <input
            type="number"
            min="1"
            max={MAX_LEAD_TIME_MINUTES}
            value={leadTime}
            onChange={(event) => setLeadTime(event.currentTarget.value)}
            onBlur={saveLeadTime}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
            }}
          />
          <span>min before</span>
        </label>
      </div>

      <div className="profile-actions">
        <button type="button" className="text-button" onClick={() => void changeHome()}>
          Change home
        </button>
        <button type="button" className="text-button danger" onClick={() => void remove()}>
          Remove
        </button>
      </div>
    </article>
  )
}
