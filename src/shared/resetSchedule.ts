import type { ProfileRuntimeState, ProfileSettings } from './types'
import { selectPlanningLimit } from './usage'

export type ScheduledResetKind = 'normal' | 'banked'

export interface ScheduledReset {
  profileId: string
  kind: ScheduledResetKind
  occursAt: number
}

export function findNextScheduledResetForProfile(
  runtime: ProfileRuntimeState,
  profile: ProfileSettings,
  nowSeconds = Date.now() / 1_000
): ScheduledReset | null {
  if (!profile.enabled || runtime.profileId !== profile.id || runtime.status !== 'ready') {
    return null
  }

  let next: ScheduledReset | null = null
  const consider = (candidate: ScheduledReset): void => {
    if (next === null || candidate.occursAt < next.occursAt) next = candidate
  }

  const normalResetAt = selectPlanningLimit(runtime.usageLimits)?.primary?.resetsAt ?? null
  if (normalResetAt !== null && normalResetAt > nowSeconds) {
    consider({ profileId: profile.id, kind: 'normal', occursAt: normalResetAt })
  }

  if (!profile.autoRedeemEnabled) return next
  for (const credit of runtime.credits) {
    if (
      credit.status !== 'available' ||
      credit.resetType !== 'codexRateLimits' ||
      credit.expiresAt === null ||
      credit.expiresAt <= nowSeconds
    ) {
      continue
    }

    const dueAt = credit.expiresAt - profile.leadTimeMinutes * 60
    consider({
      profileId: profile.id,
      kind: 'banked',
      occursAt: Math.max(nowSeconds, dueAt)
    })
  }

  return next
}

export function findNextScheduledReset(
  profiles: ProfileRuntimeState[],
  settings: ProfileSettings[],
  nowSeconds = Date.now() / 1_000
): ScheduledReset | null {
  const runtimeByProfile = new Map(profiles.map((runtime) => [runtime.profileId, runtime]))
  let next: ScheduledReset | null = null

  const consider = (candidate: ScheduledReset): void => {
    if (next === null || candidate.occursAt < next.occursAt) next = candidate
  }

  for (const profile of settings) {
    const runtime = runtimeByProfile.get(profile.id)
    if (!runtime) continue
    const candidate = findNextScheduledResetForProfile(runtime, profile, nowSeconds)
    if (candidate) consider(candidate)
  }

  return next
}
