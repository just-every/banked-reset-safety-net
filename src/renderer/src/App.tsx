import { useState } from 'react'
import { ActivityList } from './components/ActivityList'
import { AddProfile } from './components/AddProfile'
import { ProfileCard } from './components/ProfileCard'
import { SettingsPanel } from './components/SettingsPanel'
import { UpdatePanel } from './components/UpdatePanel'
import { UsageRhythmDashboard } from './components/UsageRhythmDashboard'
import { useAppState } from './hooks/useAppState'
import { useNow } from './hooks/useNow'
import { useUpdateState } from './hooks/useUpdateState'

type AppTab = 'status' | 'settings'

export function App(): React.JSX.Element {
  const { state, error, clearError, run } = useAppState()
  const now = useNow()
  const update = useUpdateState()
  const [tab, setTab] = useState<AppTab>('status')
  const refreshing = state?.profiles.some((profile) => profile.status === 'loading') ?? false

  if (!state) {
    return <main className="loading-screen">Opening Banked Reset Safety Net…</main>
  }

  return (
    <main>
      <header className="app-chrome">
        <div className="chrome-brand">
          <span aria-hidden="true">↻</span>
          <strong>Banked Reset Safety Net</strong>
        </div>
        <nav className="app-tabs" aria-label="Banked Reset Safety Net sections">
          <button
            type="button"
            className={tab === 'status' ? 'is-active' : ''}
            onClick={() => setTab('status')}
          >
            Status
          </button>
          <button
            type="button"
            className={tab === 'settings' ? 'is-active' : ''}
            onClick={() => setTab('settings')}
          >
            Settings
            {update?.status === 'ready' ? <span className="tab-alert" /> : null}
          </button>
        </nav>
      </header>

      <div className="scroll-content">
        {error ? (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button type="button" onClick={clearError} aria-label="Dismiss error">
              ×
            </button>
          </div>
        ) : null}

        {tab === 'status' ? (
          <UsageRhythmDashboard
            state={state}
            now={now}
            refreshing={refreshing}
            onRefresh={() => void run(() => window.resetNet.refresh())}
          />
        ) : (
          <div className="settings-page">
            <section className="settings-card homes-settings">
              <div className="settings-card-heading">
                <div>
                  <h2>Codex homes</h2>
                  <p>Banked Reset Safety Net finds ~/.codex and sibling .codex_* or .codex-* folders.</p>
                </div>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    void run(() => window.resetNet.discoverCodexHomes().then(() => undefined))
                  }
                >
                  Scan now
                </button>
              </div>
              <div className="settings-profile-list">
                {state.settings.profiles.map((profile) => (
                  <ProfileCard key={profile.id} profile={profile} run={run} />
                ))}
              </div>
              <AddProfile run={run} />
            </section>
            <UpdatePanel update={update} run={run} />
            <SettingsPanel state={state} run={run} />
            <ActivityList events={state.events} profiles={state.settings.profiles} />
          </div>
        )}
      </div>
    </main>
  )
}
