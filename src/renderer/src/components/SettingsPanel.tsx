import { useEffect, useState } from 'react'
import type { AppViewState } from '../../../shared/types'

interface SettingsPanelProps {
  state: AppViewState
  run(action: () => Promise<void>): Promise<void>
}

export function SettingsPanel({ state, run }: SettingsPanelProps): React.JSX.Element {
  const [executable, setExecutable] = useState(state.settings.codexExecutable)
  useEffect(() => setExecutable(state.settings.codexExecutable), [state.settings.codexExecutable])

  const chooseExecutable = async (): Promise<void> => {
    const selected = await window.resetNet.chooseCodexExecutable()
    if (!selected) return
    setExecutable(selected)
    await run(() => window.resetNet.updateSettings({ codexExecutable: selected }))
  }

  const saveExecutable = (): void => {
    if (executable.trim() !== state.settings.codexExecutable) {
      void run(() => window.resetNet.updateSettings({ codexExecutable: executable }))
    }
  }

  return (
    <section className="settings-card">
      <div className="settings-card-heading">
        <div>
          <h2>App settings</h2>
          <p>CLI detection, startup, and safety information.</p>
        </div>
      </div>
      <div className="settings-content">
          <label>
            <span>Codex executable</span>
            <div className="path-input-row">
              <input
                value={executable}
                placeholder="Automatic detection"
                onChange={(event) => setExecutable(event.currentTarget.value)}
                onBlur={saveExecutable}
              />
              <button type="button" onClick={() => void chooseExecutable()}>
                Browse
              </button>
            </div>
          </label>
          <div className="resolved-path">
            Active: {state.resolvedCodexExecutable ?? 'Codex CLI not found'}
          </div>
          {state.settings.codexExecutable ? (
            <button
              type="button"
              className="text-button"
              onClick={() =>
                void run(() => window.resetNet.updateSettings({ codexExecutable: '' }))
              }
            >
              Use automatic detection
            </button>
          ) : null}
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={state.settings.launchAtLogin}
              onChange={(event) =>
                void run(() =>
                  window.resetNet.updateSettings({ launchAtLogin: event.currentTarget.checked })
                )
              }
            />
            <span>Launch in the tray when I sign in</span>
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={state.settings.expiryWarningsEnabled}
              onChange={(event) =>
                void run(() =>
                  window.resetNet.updateSettings({
                    expiryWarningsEnabled: event.currentTarget.checked
                  })
                )
              }
            />
            <span>Warn before a banked reset expires</span>
          </label>
          <div
            className={`warning-health is-${state.expiryWarnings.status}`}
            role={state.expiryWarnings.status === 'error' ? 'alert' : 'status'}
          >
            <span className="warning-health-dot" aria-hidden="true" />
            <div>
              <strong>{warningStatusLabel(state.expiryWarnings.status)}</strong>
              <p>{state.expiryWarnings.message}</p>
              <small>Notifications only open this app; they never use a reset.</small>
            </div>
          </div>
          <div className="safety-note">
            Automatic use is off for every new home. Manual early use requires two main-process
            confirmations. Before either real request, Banked Reset Safety Net re-checks the exact
            account, earliest credit, expiry, canonical Codex home, and authorization. Interrupted
            requests reuse one deterministic idempotency key, and a cross-process lock prevents
            overlapping requests.
          </div>
          <button type="button" className="text-button danger" onClick={() => void window.resetNet.quit()}>
            Quit Banked Reset Safety Net
          </button>
      </div>
    </section>
  )
}

function warningStatusLabel(status: AppViewState['expiryWarnings']['status']): string {
  if (status === 'active') return 'Expiry warnings active'
  if (status === 'disabled') return 'Expiry warnings disabled'
  if (status === 'unsupported') return 'Expiry warnings unavailable'
  return 'Expiry warnings need attention'
}
