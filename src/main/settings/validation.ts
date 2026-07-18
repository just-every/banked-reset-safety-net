import path from 'node:path'
import {
  MAX_LEAD_TIME_MINUTES,
  MIN_LEAD_TIME_MINUTES,
  SETTINGS_VERSION,
  type AppSettings,
  type ProfileSettings
} from '../../shared/types'
import { comparablePath, normalizeAbsolutePath } from '../paths'

export function parseSettings(value: unknown): AppSettings {
  const input = requireRecord(value, 'settings')
  if (input.version !== SETTINGS_VERSION) {
    throw new Error(`Unsupported settings version: ${String(input.version)}`)
  }
  if (typeof input.codexExecutable !== 'string') {
    throw new Error('settings.codexExecutable must be a string.')
  }
  if (typeof input.launchAtLogin !== 'boolean') {
    throw new Error('settings.launchAtLogin must be a boolean.')
  }
  if (!Array.isArray(input.profiles)) {
    throw new Error('settings.profiles must be an array.')
  }
  if (!Array.isArray(input.ignoredCodexHomes)) {
    throw new Error('settings.ignoredCodexHomes must be an array.')
  }

  const profiles = input.profiles.map((profile, index) => parseProfile(profile, index))
  const ignoredCodexHomes = input.ignoredCodexHomes.map((home, index) => {
    if (typeof home !== 'string') {
      throw new Error(`settings.ignoredCodexHomes[${index}] must be a string.`)
    }
    return normalizeCodexHome(home)
  })
  assertUniqueHomes(profiles)

  return {
    version: SETTINGS_VERSION,
    codexExecutable: input.codexExecutable.trim(),
    launchAtLogin: input.launchAtLogin,
    ignoredCodexHomes: uniquePaths(ignoredCodexHomes),
    profiles
  }
}

function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>()
  return paths.filter((candidate) => {
    const key = comparablePath(candidate)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function normalizeProfileName(value: string): string {
  const name = value.trim()
  if (name.length < 1 || name.length > 60) {
    throw new Error('Profile name must be between 1 and 60 characters.')
  }
  return name
}

export function normalizeLeadTime(value: number): number {
  if (
    !Number.isInteger(value) ||
    value < MIN_LEAD_TIME_MINUTES ||
    value > MAX_LEAD_TIME_MINUTES
  ) {
    throw new Error(
      `Lead time must be a whole number from ${MIN_LEAD_TIME_MINUTES} to ${MAX_LEAD_TIME_MINUTES} minutes.`
    )
  }
  return value
}

export function normalizeCodexHome(value: string): string {
  return normalizeAbsolutePath(value)
}

export function normalizeCodexExecutable(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const expanded = normalizeAbsolutePath(trimmed)
  if (!path.isAbsolute(expanded)) throw new Error('Codex executable must be an absolute path.')
  return expanded
}

export function assertUniqueHomes(profiles: ProfileSettings[]): void {
  const seen = new Set<string>()
  for (const profile of profiles) {
    const key = comparablePath(profile.codexHome)
    if (seen.has(key)) throw new Error(`Codex home is already tracked: ${profile.codexHome}`)
    seen.add(key)
  }
}

function parseProfile(value: unknown, index: number): ProfileSettings {
  const input = requireRecord(value, `settings.profiles[${index}]`)
  if (typeof input.id !== 'string' || !input.id) {
    throw new Error(`settings.profiles[${index}].id must be a non-empty string.`)
  }
  if (typeof input.name !== 'string' || typeof input.codexHome !== 'string') {
    throw new Error(`settings.profiles[${index}] has invalid text fields.`)
  }
  if (typeof input.enabled !== 'boolean' || typeof input.autoRedeemEnabled !== 'boolean') {
    throw new Error(`settings.profiles[${index}] has invalid boolean fields.`)
  }
  if (typeof input.leadTimeMinutes !== 'number') {
    throw new Error(`settings.profiles[${index}].leadTimeMinutes must be a number.`)
  }

  return {
    id: input.id,
    name: normalizeProfileName(input.name),
    codexHome: normalizeCodexHome(input.codexHome),
    enabled: input.enabled,
    autoRedeemEnabled: input.autoRedeemEnabled,
    leadTimeMinutes: normalizeLeadTime(input.leadTimeMinutes)
  }
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`)
  }
  return value as Record<string, unknown>
}
