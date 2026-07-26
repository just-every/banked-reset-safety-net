import type { ProfileRuntimeState, ProfileSettings, ResetCredit } from './types'

export const EXPIRY_WARNING_DAY_SECONDS = 24 * 60 * 60

export const EXPIRY_WARNING_STAGES = ['day-before', 'use-by'] as const
export type ExpiryWarningStage = (typeof EXPIRY_WARNING_STAGES)[number]

export interface ExpiryWarningCandidate {
  identity: string
  resetType: 'codexRateLimits'
  creditId: string
  creditTitle: string | null
  expiresAt: number
  useByAt: number
  leadTimeMinutes: number
  profileIds: string[]
  profileNames: string[]
  dueStages: ExpiryWarningStage[]
}

interface GroupedCredit {
  identity: string
  resetType: 'codexRateLimits'
  creditId: string
  creditTitle: string | null
  expiresAt: number
  leadTimeMinutes: number
  profiles: Map<string, string>
}

export function expiryWarningIdentity(
  credit: Pick<ResetCredit, 'id' | 'resetType' | 'expiresAt'>
): string {
  if (credit.expiresAt === null || !Number.isSafeInteger(credit.expiresAt)) {
    throw new Error('An exact reset expiry is required for an expiry-warning identity.')
  }
  return `${credit.resetType}\0${credit.id}\0${credit.expiresAt}`
}

export function selectDueExpiryWarnings(
  profiles: ProfileSettings[],
  runtimeStates: ProfileRuntimeState[],
  nowSeconds: number
): ExpiryWarningCandidate[] {
  const runtimeByProfile = new Map(
    runtimeStates.map((runtime) => [runtime.profileId, runtime] as const)
  )
  const grouped = new Map<string, GroupedCredit>()

  for (const profile of profiles) {
    if (!profile.enabled) continue
    if (!Number.isInteger(profile.leadTimeMinutes) || profile.leadTimeMinutes <= 0) {
      throw new Error(`Profile ${profile.id} has an invalid expiry-warning lead time.`)
    }

    const runtime = runtimeByProfile.get(profile.id)
    if (!runtime || runtime.status !== 'ready') continue

    for (const credit of runtime.credits) {
      if (
        credit.status !== 'available' ||
        credit.resetType !== 'codexRateLimits' ||
        credit.expiresAt === null ||
        !Number.isSafeInteger(credit.expiresAt) ||
        credit.expiresAt <= nowSeconds
      ) {
        continue
      }

      const identity = expiryWarningIdentity(credit)
      const existing = grouped.get(identity)
      if (existing) {
        existing.leadTimeMinutes = Math.max(existing.leadTimeMinutes, profile.leadTimeMinutes)
        existing.profiles.set(profile.id, profile.name)
        continue
      }

      grouped.set(identity, {
        identity,
        resetType: 'codexRateLimits',
        creditId: credit.id,
        creditTitle: credit.title,
        expiresAt: credit.expiresAt,
        leadTimeMinutes: profile.leadTimeMinutes,
        profiles: new Map([[profile.id, profile.name]])
      })
    }
  }

  return [...grouped.values()]
    .map((credit) => toDueCandidate(credit, nowSeconds))
    .filter((candidate): candidate is ExpiryWarningCandidate => candidate !== null)
    .sort(
      (left, right) =>
        left.expiresAt - right.expiresAt || left.identity.localeCompare(right.identity)
    )
}

function toDueCandidate(
  grouped: GroupedCredit,
  nowSeconds: number
): ExpiryWarningCandidate | null {
  const useByAt = grouped.expiresAt - grouped.leadTimeMinutes * 60
  const dueStages: ExpiryWarningStage[] = []
  if (nowSeconds >= grouped.expiresAt - EXPIRY_WARNING_DAY_SECONDS) {
    dueStages.push('day-before')
  }
  if (nowSeconds >= useByAt) dueStages.push('use-by')
  if (dueStages.length === 0) return null

  const profiles = [...grouped.profiles.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  )
  return {
    identity: grouped.identity,
    resetType: grouped.resetType,
    creditId: grouped.creditId,
    creditTitle: grouped.creditTitle,
    expiresAt: grouped.expiresAt,
    useByAt,
    leadTimeMinutes: grouped.leadTimeMinutes,
    profileIds: profiles.map(([profileId]) => profileId),
    profileNames: profiles.map(([, profileName]) => profileName),
    dueStages
  }
}
