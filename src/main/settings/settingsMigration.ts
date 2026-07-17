import { MAX_LEAD_TIME_MINUTES, SETTINGS_VERSION } from '../../shared/types'

const PREVIOUS_SETTINGS_VERSION = 1

export interface SettingsMigrationResult {
  value: unknown
  changed: boolean
}

export function migrateSettings(value: unknown): SettingsMigrationResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { value, changed: false }
  }
  const input = value as Record<string, unknown>
  if (input.version !== PREVIOUS_SETTINGS_VERSION || !Array.isArray(input.profiles)) {
    return { value, changed: false }
  }

  const migrated = structuredClone(input)
  migrated.version = SETTINGS_VERSION
  migrated.profiles = (migrated.profiles as unknown[]).map((profile) => {
    if (typeof profile !== 'object' || profile === null || Array.isArray(profile)) return profile
    const next = { ...(profile as Record<string, unknown>) }
    if (typeof next.leadTimeMinutes === 'number' && next.leadTimeMinutes > MAX_LEAD_TIME_MINUTES) {
      next.leadTimeMinutes = MAX_LEAD_TIME_MINUTES
      next.autoRedeemEnabled = false
    }
    return next
  })
  return { value: migrated, changed: true }
}
