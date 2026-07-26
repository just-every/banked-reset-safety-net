import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { ExpiryWarningCoordinator } from '../src/main/notifications/expiryWarningCoordinator'
import type { ExpiryWarningIntervalScheduler } from '../src/main/notifications/expiryWarningRunner'
import { ExpiryWarningStore } from '../src/main/notifications/expiryWarningStore'
import type { ProfileRuntimeState, ProfileSettings } from '../src/shared/types'

const NOW_MS = Date.UTC(2026, 6, 26, 12)

describe('ExpiryWarningCoordinator', () => {
  it('keeps storage failure advisory and visible without starting delivery', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'reset-net-warning-coordinator-'))
    const filePath = path.join(directory, 'notification-state.json')
    await writeFile(filePath, '{not-json', 'utf8')
    const deliver = vi.fn()
    const coordinator = createCoordinator({
      store: new ExpiryWarningStore(filePath),
      deliver
    })

    await expect(coordinator.initialize()).resolves.toBeUndefined()
    coordinator.start()

    expect(coordinator.getState()).toMatchObject({
      status: 'error',
      message: expect.stringContaining('storage could not be opened')
    })
    coordinator.settingsChanged()
    coordinator.resumed()
    expect(coordinator.getState()).toMatchObject({
      status: 'error',
      message: expect.stringContaining('storage could not be opened')
    })
    expect(deliver).not.toHaveBeenCalled()
  })

  it('reports disabled and unsupported states explicitly', async () => {
    const disabled = createCoordinator({ enabled: false })
    await disabled.initialize()
    expect(disabled.getState()).toEqual({
      status: 'disabled',
      message: 'Expiry warnings are off.'
    })

    const unsupported = createCoordinator({ supported: false })
    await unsupported.initialize()
    expect(unsupported.getState()).toMatchObject({ status: 'unsupported' })
  })

  it('delivers a due warning and remains active without blocking initialization', async () => {
    const deliver = vi.fn(async () => ({ status: 'delivered' as const }))
    const profile = profileSettings()
    const coordinator = createCoordinator({
      deliver,
      profiles: [profile],
      runtimeStates: [readyRuntime(profile.id)]
    })

    await coordinator.initialize()
    coordinator.start()
    await vi.waitFor(() => expect(deliver).toHaveBeenCalledOnce())

    expect(coordinator.getState()).toMatchObject({ status: 'active' })
    await coordinator.shutdown()
  })

  it('surfaces native delivery failures and allows the guarded runner to retry later', async () => {
    const deliver = vi.fn(async () => ({
      status: 'failed' as const,
      error: 'permission denied'
    }))
    const profile = profileSettings()
    const coordinator = createCoordinator({
      deliver,
      profiles: [profile],
      runtimeStates: [readyRuntime(profile.id)]
    })

    await coordinator.initialize()
    coordinator.start()
    await vi.waitFor(() => expect(deliver).toHaveBeenCalledOnce())

    expect(coordinator.getState()).toMatchObject({
      status: 'error',
      message: expect.stringContaining('permission denied')
    })
    await coordinator.shutdown()
  })
})

interface CoordinatorOverrides {
  store?: ExpiryWarningStore
  enabled?: boolean
  supported?: boolean
  deliver?: ConstructorParameters<typeof ExpiryWarningCoordinator>[0]['deliver']
  profiles?: ProfileSettings[]
  runtimeStates?: ProfileRuntimeState[]
}

function createCoordinator(
  overrides: CoordinatorOverrides = {}
): ExpiryWarningCoordinator {
  const store =
    overrides.store ??
    new ExpiryWarningStore(
      path.join(
        tmpdir(),
        `reset-net-warning-coordinator-${crypto.randomUUID()}.json`
      )
    )
  const scheduler: ExpiryWarningIntervalScheduler = {
    setInterval: () => Symbol('warning-timer'),
    clearInterval: () => undefined
  }
  return new ExpiryWarningCoordinator({
    store,
    getProfiles: () => overrides.profiles ?? [],
    getRuntimeStates: () => overrides.runtimeStates ?? [],
    isEnabled: () => overrides.enabled ?? true,
    isSupported: () => overrides.supported ?? true,
    deliver: overrides.deliver ?? (async () => ({ status: 'delivered' })),
    onChange: vi.fn(),
    now: () => NOW_MS,
    scheduler
  })
}

function profileSettings(): ProfileSettings {
  return {
    id: 'profile-1',
    name: 'Default Codex',
    codexHome: '/tmp/.codex',
    enabled: true,
    autoRedeemEnabled: false,
    leadTimeMinutes: 30
  }
}

function readyRuntime(profileId: string): ProfileRuntimeState {
  return {
    profileId,
    status: 'ready',
    usageLimits: [],
    availableCount: 1,
    credits: [
      {
        id: 'credit-1',
        resetType: 'codexRateLimits',
        status: 'available',
        grantedAt: Math.floor(NOW_MS / 1_000) - 60,
        expiresAt: Math.floor(NOW_MS / 1_000) + 60 * 60,
        title: 'Weekly reset',
        description: null
      }
    ],
    refreshedAt: NOW_MS,
    error: null
  }
}
