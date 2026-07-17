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

export class SettingsStore {
  private settings: AppSettings | null = null
  private revision = 0

  constructor(
    private readonly filePath: string,
    private readonly defaultCodexHome = path.join(homedir(), '.codex')
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
      if (codexHome !== profile.codexHome) profile.autoRedeemEnabled = false
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
    const nextProfiles = settings.profiles.filter((profile) => profile.id !== profileId)
    if (nextProfiles.length === settings.profiles.length) throw new Error('Profile not found.')
    settings.profiles = nextProfiles
    return this.replace(settings)
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
    profiles
  }
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
