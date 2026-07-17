import { useEffect, useState } from 'react'
import type { AppViewState } from '../../../shared/types'

interface SettingsPanelProps {
  state: AppViewState
  run(action: () => Promise<void>): Promise<void>
}

export function SettingsPanel({ state, run }: SettingsPanelProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
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
    <section className="settings-section">
      <button className="section-toggle" type="button" onClick={() => setOpen((value) => !value)}>
        <span>Settings & safety</span>
        <span>{open ? '−' : '+'}</span>
      </button>
      {open ? (
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
          <div className="safety-note">
            Automatic use is off for every new home. Before any real request, Reset Net re-checks
            the exact credit, expiry, Codex home, and enable switch. Interrupted requests reuse one
            deterministic idempotency key. A cross-process lock prevents overlapping requests, and
            automatic use is hard-limited to the final 60 minutes.
          </div>
          <button type="button" className="text-button danger" onClick={() => void window.resetNet.quit()}>
            Quit Reset Net
          </button>
        </div>
      ) : null}
    </section>
  )
}
