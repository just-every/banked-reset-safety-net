import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { SettingsStore } from '../src/main/settings/settingsStore'
import { SETTINGS_VERSION, type AppSettings } from '../src/shared/types'

describe('multiple Codex homes', () => {
  it('prioritizes ~/.codex and discovers sibling Codex homes without using CODEX_HOME', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'reset-net-default-home-'))
    const defaultHome = path.join(directory, '.codex')
    const inheritedHome = path.join(directory, '.codex_zara')
    await Promise.all([mkdir(defaultHome), mkdir(inheritedHome)])
    const previousCodexHome = process.env.CODEX_HOME
    process.env.CODEX_HOME = inheritedHome

    try {
      const store = new SettingsStore(path.join(directory, 'settings.json'), defaultHome)
      const settings = await store.initialize()
      expect(settings.profiles).toHaveLength(2)
      expect(settings.profiles[0]).toMatchObject({
        name: 'Default Codex',
        codexHome: defaultHome,
        enabled: true,
        autoRedeemEnabled: false
      })
      expect(settings.expiryWarningsEnabled).toBe(true)
      expect(settings.profiles[1]).toMatchObject({
        name: 'Codex Zara',
        codexHome: inheritedHome,
        enabled: true,
        autoRedeemEnabled: false
      })
    } finally {
      if (previousCodexHome === undefined) delete process.env.CODEX_HOME
      else process.env.CODEX_HOME = previousCodexHome
    }
  })

  it('migrates unsafe legacy lead times to one hour and switches automatic use off', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'reset-net-settings-migration-'))
    const home = path.join(directory, 'codex-home')
    const filePath = path.join(directory, 'settings.json')
    await mkdir(home)
    await writeFile(
      filePath,
      JSON.stringify({
        ...settingsWith(home),
        version: 1,
        profiles: [
          {
            ...settingsWith(home).profiles[0],
            autoRedeemEnabled: true,
            leadTimeMinutes: 240
          }
        ]
      }),
      'utf8'
    )

    const store = new SettingsStore(filePath, home, directory)
    const settings = await store.initialize()
    expect(settings.version).toBe(SETTINGS_VERSION)
    expect(settings.expiryWarningsEnabled).toBe(true)
    expect(settings.profiles[0]).toMatchObject({
      leadTimeMinutes: 60,
      autoRedeemEnabled: false
    })
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toMatchObject({
      version: SETTINGS_VERSION,
      expiryWarningsEnabled: true,
      profiles: [{ leadTimeMinutes: 60, autoRedeemEnabled: false }]
    })
  })

  it('tracks distinct homes and leaves automatic use off for each newly added home', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'reset-net-settings-'))
    const firstHome = path.join(directory, 'first')
    const secondHome = path.join(directory, 'second')
    await Promise.all([mkdir(firstHome), mkdir(secondHome)])

    const filePath = path.join(directory, 'settings.json')
    await writeFile(filePath, JSON.stringify(settingsWith(firstHome)), 'utf8')
    const store = new SettingsStore(filePath, firstHome, directory)
    await store.initialize()

    const updated = await store.addProfile({ name: 'Second account', codexHome: secondHome })
    expect(updated.profiles).toHaveLength(2)
    expect(updated.profiles[1]).toMatchObject({
      name: 'Second account',
      codexHome: secondHome,
      autoRedeemEnabled: false
    })

    await expect(store.addProfile({ name: 'Duplicate', codexHome: secondHome })).rejects.toThrow(
      'already tracked'
    )
  })

  it('forces automatic use off when a profile changes homes', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'reset-net-home-change-'))
    const firstHome = path.join(directory, 'first')
    const secondHome = path.join(directory, 'second')
    await Promise.all([mkdir(firstHome), mkdir(secondHome)])

    const filePath = path.join(directory, 'settings.json')
    const initial = settingsWith(firstHome)
    initial.profiles[0]!.autoRedeemEnabled = true
    await writeFile(filePath, JSON.stringify(initial), 'utf8')
    const store = new SettingsStore(filePath, firstHome, directory)
    await store.initialize()

    const updated = await store.updateProfile('profile-1', { codexHome: secondHome })
    expect(updated.profiles[0]).toMatchObject({
      codexHome: secondHome,
      autoRedeemEnabled: false
    })
  })

  it('requires fresh automatic-use confirmation after lead-time or tracking changes', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'reset-net-authorization-change-'))
    const home = path.join(directory, 'codex-home')
    await mkdir(home)
    const initial = settingsWith(home)
    initial.profiles[0]!.autoRedeemEnabled = true
    const filePath = path.join(directory, 'settings.json')
    await writeFile(filePath, JSON.stringify(initial), 'utf8')
    const store = new SettingsStore(filePath, home, directory)
    await store.initialize()

    let updated = await store.updateProfile('profile-1', { leadTimeMinutes: 45 })
    expect(updated.profiles[0]).toMatchObject({
      leadTimeMinutes: 45,
      autoRedeemEnabled: false
    })

    updated = await store.updateProfile('profile-1', {
      autoRedeemEnabled: true,
      autoRedeemConfirmed: true
    })
    expect(updated.profiles[0]?.autoRedeemEnabled).toBe(true)

    updated = await store.updateProfile('profile-1', { enabled: false })
    expect(updated.profiles[0]).toMatchObject({
      enabled: false,
      autoRedeemEnabled: false
    })
    updated = await store.updateProfile('profile-1', { enabled: true })
    expect(updated.profiles[0]).toMatchObject({
      enabled: true,
      autoRedeemEnabled: false
    })
  })

  it('does not rediscover a home the user removed', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'reset-net-ignore-home-'))
    const defaultHome = path.join(directory, '.codex')
    const otherHome = path.join(directory, '.codex_work')
    await Promise.all([mkdir(defaultHome), mkdir(otherHome)])

    const store = new SettingsStore(path.join(directory, 'settings.json'), defaultHome, directory)
    const initialized = await store.initialize()
    const otherProfile = initialized.profiles.find((profile) => profile.codexHome === otherHome)
    expect(otherProfile).toBeDefined()

    await store.removeProfile(otherProfile!.id)
    expect(await store.discoverProfiles()).toBe(0)
    expect(store.get().profiles.map((profile) => profile.codexHome)).toEqual([defaultHome])
  })

  it('migrates v3 settings to default-on warnings without discarding ignored homes', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'reset-net-warning-migration-'))
    const home = path.join(directory, 'codex-home')
    const ignoredHome = path.join(directory, '.codex_removed')
    const filePath = path.join(directory, 'settings.json')
    await mkdir(home)
    await writeFile(
      filePath,
      JSON.stringify({
        ...settingsWith(home),
        version: 3,
        expiryWarningsEnabled: undefined,
        ignoredCodexHomes: [ignoredHome]
      }),
      'utf8'
    )

    const store = new SettingsStore(filePath, home, path.join(directory, 'no-discovery'))
    const settings = await store.initialize()

    expect(settings).toMatchObject({
      version: SETTINGS_VERSION,
      expiryWarningsEnabled: true,
      ignoredCodexHomes: [ignoredHome]
    })
  })

  it('allows advisory expiry warnings to be disabled independently of automatic use', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'reset-net-warning-setting-'))
    const home = path.join(directory, 'codex-home')
    await mkdir(home)
    const store = new SettingsStore(path.join(directory, 'settings.json'), home, directory)
    await store.initialize()

    const settings = await store.updateAppSettings({ expiryWarningsEnabled: false })

    expect(settings.expiryWarningsEnabled).toBe(false)
    expect(settings.profiles[0]?.autoRedeemEnabled).toBe(false)
  })
})

function settingsWith(codexHome: string): AppSettings {
  return {
    version: SETTINGS_VERSION,
    codexExecutable: '',
    launchAtLogin: false,
    expiryWarningsEnabled: true,
    ignoredCodexHomes: [],
    profiles: [
      {
        id: 'profile-1',
        name: 'First account',
        codexHome,
        enabled: true,
        autoRedeemEnabled: false,
        leadTimeMinutes: 30
      }
    ]
  }
}
