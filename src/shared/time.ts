import type { ProfileRuntimeState, ResetCredit } from './types'

export interface NextExpiringCredit {
  profileId: string
  credit: ResetCredit
}

export function findNextExpiringCredit(
  profiles: ProfileRuntimeState[],
  nowSeconds = Date.now() / 1000
): NextExpiringCredit | null {
  let next: NextExpiringCredit | null = null

  for (const profile of profiles) {
    if (profile.status !== 'ready') continue

    for (const credit of profile.credits) {
      if (
        credit.status !== 'available' ||
        credit.resetType !== 'codexRateLimits' ||
        credit.expiresAt === null ||
        credit.expiresAt <= nowSeconds
      ) {
        continue
      }

      if (next === null || credit.expiresAt < (next.credit.expiresAt ?? Number.POSITIVE_INFINITY)) {
        next = { profileId: profile.profileId, credit }
      }
    }
  }

  return next
}

export function formatCountdown(expiresAtSeconds: number, nowMs = Date.now()): string {
  const remainingSeconds = Math.max(0, Math.ceil(expiresAtSeconds - nowMs / 1000))
  if (remainingSeconds === 0) return 'Expired'

  const days = Math.floor(remainingSeconds / 86_400)
  const hours = Math.floor((remainingSeconds % 86_400) / 3_600)
  const minutes = Math.floor((remainingSeconds % 3_600) / 60)
  const seconds = remainingSeconds % 60

  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  return `${minutes}m ${seconds}s`
}

export function formatTrayCountdown(expiresAtSeconds: number, nowMs = Date.now()): string {
  const remainingSeconds = Math.max(0, Math.ceil(expiresAtSeconds - nowMs / 1000))
  if (remainingSeconds === 0) return ''
  if (remainingSeconds >= 86_400) return `${Math.ceil(remainingSeconds / 86_400)}d`
  if (remainingSeconds >= 3_600) return `${Math.ceil(remainingSeconds / 3_600)}h`
  return `${Math.max(1, Math.ceil(remainingSeconds / 60))}m`
}

export function formatLocalDateTime(epochSeconds: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(epochSeconds * 1000))
}
