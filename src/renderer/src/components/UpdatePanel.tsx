import type { UpdateViewState } from '../../../shared/types'

export function UpdatePanel({
  update,
  run
}: {
  update: UpdateViewState | null
  run(action: () => Promise<void>): Promise<void>
}): React.JSX.Element {
  return (
    <section className="settings-card update-card">
      <div className="settings-card-heading">
        <div>
          <h2>App updates</h2>
          <p>{update?.message ?? 'Loading update status…'}</p>
        </div>
        <span className={`update-dot is-${update?.status ?? 'idle'}`} aria-hidden="true" />
      </div>
      {update?.status === 'downloading' && update.downloadPercent !== null ? (
        <div className="update-progress" aria-label={`${Math.round(update.downloadPercent)}% downloaded`}>
          <span style={{ width: `${update.downloadPercent}%` }} />
        </div>
      ) : null}
      <div className="settings-actions">
        <button
          type="button"
          className="secondary-button"
          disabled={!update || update.status === 'unsupported' || update.status === 'checking'}
          onClick={() => void run(() => window.resetNet.checkForUpdates())}
        >
          {update?.status === 'checking' ? 'Checking…' : 'Check now'}
        </button>
        {update?.status === 'ready' ? (
          <button
            type="button"
            className="primary-button"
            onClick={() => void run(() => window.resetNet.installUpdate())}
          >
            Restart and install
          </button>
        ) : null}
      </div>
    </section>
  )
}
