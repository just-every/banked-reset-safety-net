import type { ProfileRuntimeState } from '../../../shared/types'
import { displayUsageLimits } from '../../../shared/usage'
import { BankedResetSchedule } from './BankedResetSchedule'
import { UsageMeter } from './UsageMeter'

interface ProfileRuntimeProps {
  runtime: ProfileRuntimeState
  now: number
  leadTimeMinutes: number
  autoRedeemEnabled: boolean
}

export function ProfileRuntime({
  runtime,
  now,
  leadTimeMinutes,
  autoRedeemEnabled
}: ProfileRuntimeProps): React.JSX.Element {
  if (runtime.status === 'loading') return <div className="runtime-message">Checking Codex…</div>
  if (runtime.status === 'error') return <div className="runtime-message error">{runtime.error}</div>
  if (runtime.status !== 'ready') return <div className="runtime-message">Tracking paused.</div>

  const visibleLimits = displayUsageLimits(runtime.usageLimits)

  return (
    <div className="profile-runtime">
      {visibleLimits.length > 0 ? (
        <div className="usage-meter-list">
          {visibleLimits.flatMap((limit) => [
            ...(limit.primary
              ? [
                  <UsageMeter
                    key={`${limit.id}:primary`}
                    limit={limit}
                    window={limit.primary}
                    windowKind="primary"
                    now={now}
                  />
                ]
              : []),
            ...(limit.secondary
              ? [
                  <UsageMeter
                    key={`${limit.id}:secondary`}
                    limit={limit}
                    window={limit.secondary}
                    windowKind="secondary"
                    now={now}
                  />
                ]
              : [])
          ])}
        </div>
      ) : (
        <div className="runtime-message">Codex did not supply normal usage details.</div>
      )}

      <BankedResetSchedule
        runtime={runtime}
        leadTimeMinutes={leadTimeMinutes}
        autoRedeemEnabled={autoRedeemEnabled}
        now={now}
      />

      {runtime.availableCount === 0 ? (
        <div className="runtime-message banked-empty">No banked resets available.</div>
      ) : null}
      {runtime.credits.length < runtime.availableCount ? (
        <div className="runtime-message">
          Codex reports {runtime.availableCount - runtime.credits.length} additional reset(s) without
          details.
        </div>
      ) : null}
    </div>
  )
}
