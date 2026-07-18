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
    expect(settings.profiles[0]).toMatchObject({
      leadTimeMinutes: 60,
      autoRedeemEnabled: false
    })
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toMatchObject({
      version: SETTINGS_VERSION,
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
})

function settingsWith(codexHome: string): AppSettings {
  return {
    version: SETTINGS_VERSION,
    codexExecutable: '',
    launchAtLogin: false,
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
