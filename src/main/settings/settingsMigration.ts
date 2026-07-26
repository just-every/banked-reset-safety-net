import { MAX_LEAD_TIME_MINUTES, SETTINGS_VERSION } from '../../shared/types'

const LEGACY_SETTINGS_VERSION = 1
const SETTINGS_VERSION_WITH_IGNORED_HOMES = 3

export interface SettingsMigrationResult {
  value: unknown
  changed: boolean
}

export function migrateSettings(value: unknown): SettingsMigrationResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { value, changed: false }
  }
  const input = value as Record<string, unknown>
  if (
    (typeof input.version !== 'number' ||
      input.version < LEGACY_SETTINGS_VERSION ||
      input.version > SETTINGS_VERSION_WITH_IGNORED_HOMES) ||
    !Array.isArray(input.profiles)
  ) {
    return { value, changed: false }
  }

  const migrated = structuredClone(input)
  migrated.version = SETTINGS_VERSION
  if (!Array.isArray(migrated.ignoredCodexHomes)) migrated.ignoredCodexHomes = []
  migrated.expiryWarningsEnabled = true
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
