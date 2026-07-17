import { ActivityList } from './components/ActivityList'
import { AddProfile } from './components/AddProfile'
import { NextReset } from './components/NextReset'
import { ProfileCard } from './components/ProfileCard'
import { SettingsPanel } from './components/SettingsPanel'
import { useAppState } from './hooks/useAppState'
import { useNow } from './hooks/useNow'

export function App(): React.JSX.Element {
  const { state, error, clearError, run } = useAppState()
  const now = useNow()
  const refreshing = state?.profiles.some((profile) => profile.status === 'loading') ?? false

  if (!state) {
    return <main className="loading-screen">Opening Reset Net…</main>
  }

  return (
    <main>
      <header className="titlebar">
        <div className="brand-mark" aria-hidden="true">
          ↻
        </div>
        <div>
          <h1>Reset Net</h1>
          <p>Codex banked resets</p>
        </div>
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

        <NextReset
          state={state}
          now={now}
          refreshing={refreshing}
          onRefresh={() => void run(() => window.resetNet.refresh())}
        />

        <section className="profiles-section">
          <div className="section-heading">
            <h2>Codex homes</h2>
            <span>{state.settings.profiles.length}</span>
          </div>
          {state.settings.profiles.map((profile) => {
            const runtime = state.profiles.find((candidate) => candidate.profileId === profile.id)
            if (!runtime) return null
            return (
              <ProfileCard
                key={profile.id}
                profile={profile}
                runtime={runtime}
                now={now}
                run={run}
              />
            )
          })}
          <AddProfile run={run} />
        </section>

        <ActivityList events={state.events} profiles={state.settings.profiles} />
        <SettingsPanel state={state} run={run} />
      </div>
    </main>
  )
}
