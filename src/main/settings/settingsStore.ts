import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import {
  DEFAULT_LEAD_TIME_MINUTES,
  SETTINGS_VERSION,
  type AddProfileInput,
  type AppSettings,
  type UpdateAppSettingsInput,
  type UpdateProfileInput
} from '../../shared/types'
import { readJsonFile, writeJsonFileAtomic } from '../persistence/jsonFile'
import {
  assertUniqueHomes,
  normalizeCodexExecutable,
  normalizeCodexHome,
  normalizeLeadTime,
  normalizeProfileName,
  parseSettings
} from './validation'
import { migrateSettings } from './settingsMigration'
import { codexHomeDisplayName, discoverCodexHomes } from './codexHomeDiscovery'
import { comparablePath } from '../paths'

export class SettingsStore {
  private settings: AppSettings | null = null
  private revision = 0

  constructor(
    private readonly filePath: string,
    private readonly defaultCodexHome = path.join(homedir(), '.codex'),
    private readonly discoveryRoot = path.dirname(defaultCodexHome)
  ) {}

  async initialize(): Promise<AppSettings> {
    const stored = await readJsonFile(this.filePath)
    if (stored === null) {
      this.settings = await createDefaultSettings(this.defaultCodexHome)
      await this.persist()
    } else {
      const migrated = migrateSettings(stored)
      this.settings = parseSettings(migrated.value)
      if (migrated.changed) await this.persist()
    }
    await this.discoverProfiles()
    this.revision += 1
    return this.get()
  }

  get(): AppSettings {
    if (this.settings === null) throw new Error('SettingsStore has not been initialized.')
    return structuredClone(this.settings)
  }

  getRevision(): number {
    return this.revision
  }

  async addProfile(input: AddProfileInput): Promise<AppSettings> {
    const settings = this.get()
    const codexHome = normalizeCodexHome(input.codexHome)
    await assertDirectory(codexHome, 'Codex home')

    settings.profiles.push({
      id: randomUUID(),
      name: normalizeProfileName(input.name),
      codexHome,
      enabled: true,
      autoRedeemEnabled: false,
      leadTimeMinutes: DEFAULT_LEAD_TIME_MINUTES
    })
    settings.ignoredCodexHomes = withoutPath(settings.ignoredCodexHomes, codexHome)
    assertUniqueHomes(settings.profiles)
    return this.replace(settings)
  }

  async updateProfile(profileId: string, input: UpdateProfileInput): Promise<AppSettings> {
    const settings = this.get()
    const profile = settings.profiles.find((candidate) => candidate.id === profileId)
    if (!profile) throw new Error('Profile not found.')

    if (input.name !== undefined) profile.name = normalizeProfileName(input.name)
    if (input.enabled !== undefined) profile.enabled = input.enabled
    if (input.leadTimeMinutes !== undefined) {
      profile.leadTimeMinutes = normalizeLeadTime(input.leadTimeMinutes)
    }
    if (input.codexHome !== undefined) {
      const codexHome = normalizeCodexHome(input.codexHome)
      await assertDirectory(codexHome, 'Codex home')
      if (comparablePath(codexHome) !== comparablePath(profile.codexHome)) {
        settings.ignoredCodexHomes = addUniquePath(settings.ignoredCodexHomes, profile.codexHome)
        settings.ignoredCodexHomes = withoutPath(settings.ignoredCodexHomes, codexHome)
        profile.autoRedeemEnabled = false
      }
      profile.codexHome = codexHome
    }
    if (input.autoRedeemEnabled !== undefined) {
      if (input.autoRedeemEnabled && input.autoRedeemConfirmed !== true) {
        throw new Error('Explicit confirmation is required to enable automatic reset use.')
      }
      profile.autoRedeemEnabled = input.autoRedeemEnabled
    }

    assertUniqueHomes(settings.profiles)
    return this.replace(settings)
  }

  async removeProfile(profileId: string): Promise<AppSettings> {
    const settings = this.get()
    const removed = settings.profiles.find((profile) => profile.id === profileId)
    const nextProfiles = settings.profiles.filter((profile) => profile.id !== profileId)
    if (nextProfiles.length === settings.profiles.length) throw new Error('Profile not found.')
    settings.profiles = nextProfiles
    settings.ignoredCodexHomes = addUniquePath(settings.ignoredCodexHomes, removed!.codexHome)
    return this.replace(settings)
  }

  async discoverProfiles(): Promise<number> {
    if (this.settings === null) throw new Error('SettingsStore has not been initialized.')
    const discovered = await discoverCodexHomes(this.discoveryRoot).catch((error: unknown) => {
      if (isMissingDirectoryError(error)) return []
      throw error
    })
    const settings = this.get()
    const tracked = new Set(settings.profiles.map((profile) => comparablePath(profile.codexHome)))
    const ignored = new Set(settings.ignoredCodexHomes.map(comparablePath))
    const additions = discovered.filter((candidate) => {
      const key = comparablePath(candidate)
      return !tracked.has(key) && !ignored.has(key)
    })
    if (additions.length === 0) return 0

    settings.profiles.push(
      ...additions.map((codexHome) => ({
        id: randomUUID(),
        name: codexHomeDisplayName(codexHome),
        codexHome,
        enabled: true,
        autoRedeemEnabled: false,
        leadTimeMinutes: DEFAULT_LEAD_TIME_MINUTES
      }))
    )
    await this.replace(settings)
    return additions.length
  }

  async updateAppSettings(input: UpdateAppSettingsInput): Promise<AppSettings> {
    const settings = this.get()
    if (input.codexExecutable !== undefined) {
      settings.codexExecutable = normalizeCodexExecutable(input.codexExecutable)
    }
    if (input.launchAtLogin !== undefined) settings.launchAtLogin = input.launchAtLogin
    return this.replace(settings)
  }

  private async replace(settings: AppSettings): Promise<AppSettings> {
    this.settings = parseSettings(settings)
    this.revision += 1
    await this.persist()
    return this.get()
  }

  private async persist(): Promise<void> {
    if (this.settings === null) throw new Error('Cannot persist uninitialized settings.')
    await writeJsonFileAtomic(this.filePath, this.settings)
  }
}

async function createDefaultSettings(defaultCodexHome: string): Promise<AppSettings> {
  const candidateHome = normalizeCodexHome(defaultCodexHome)
  const profiles = (await isDirectory(candidateHome))
    ? [
        {
          id: randomUUID(),
          name: 'Default Codex',
          codexHome: candidateHome,
          enabled: true,
          autoRedeemEnabled: false,
          leadTimeMinutes: DEFAULT_LEAD_TIME_MINUTES
        }
      ]
    : []

  return {
    version: SETTINGS_VERSION,
    codexExecutable: '',
    launchAtLogin: false,
    ignoredCodexHomes: [],
    profiles
  }
}

function withoutPath(paths: string[], candidate: string): string[] {
  const key = comparablePath(candidate)
  return paths.filter((value) => comparablePath(value) !== key)
}

function addUniquePath(paths: string[], candidate: string): string[] {
  return paths.some((value) => comparablePath(value) === comparablePath(candidate))
    ? paths
    : [...paths, candidate]
}

function isMissingDirectoryError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

async function assertDirectory(targetPath: string, label: string): Promise<void> {
  if (!(await isDirectory(targetPath))) throw new Error(`${label} is not a directory: ${targetPath}`)
}

async function isDirectory(targetPath: string): Promise<boolean> {
  try {
    return (await stat(targetPath)).isDirectory()
  } catch {
    return false
  }
}
