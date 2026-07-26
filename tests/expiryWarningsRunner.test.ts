import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  EXPIRY_WARNING_DELIVERY_RETRY_MS,
  EXPIRY_WARNING_EVALUATION_INTERVAL_MS,
  ExpiryWarningRunner,
  type ExpiryWarningDeliveryRequest,
  type ExpiryWarningDeliveryResult,
  type ExpiryWarningIntervalScheduler
} from '../src/main/notifications/expiryWarningRunner'
import { ExpiryWarningStore } from '../src/main/notifications/expiryWarningStore'
import type {
  ProfileRuntimeState,
  ProfileSettings,
  ResetCredit
} from '../src/shared/types'

const NOW_MS = 2_000_000_000_000
const NOW_SECONDS = NOW_MS / 1_000

describe('ExpiryWarningRunner', () => {
  it('delivers only the urgent catch-up stage and records crossed stages accurately', async () => {
    const store = await warningStore()
    const profile = testProfile()
    const credit = testCredit('credit-1', NOW_SECONDS + 30 * 60)
    const deliver = vi.fn(
      async (_request: ExpiryWarningDeliveryRequest): Promise<ExpiryWarningDeliveryResult> => ({
        status: 'delivered'
      })
    )
    const runner = runnerFor(store, [profile], [readyRuntime(profile.id, [credit])], deliver)

    await runner.tick(NOW_MS)

    expect(deliver).toHaveBeenCalledTimes(1)
    expect(deliver.mock.calls[0]?.[0].stage).toBe('use-by')
    expect(store.getRecords()[0]?.stages).toEqual({
      'day-before': { disposition: 'superseded', recordedAt: NOW_MS },
      'use-by': { disposition: 'delivered', recordedAt: NOW_MS }
    })
  })

  it('does not mark failed or unsupported delivery and retries on a bounded cadence', async () => {
    const store = await warningStore()
    const profile = testProfile()
    const credit = testCredit('credit-1', NOW_SECONDS + 30 * 60)
    const deliver = vi
      .fn()
      .mockResolvedValueOnce({ status: 'failed', error: 'blocked' })
      .mockResolvedValueOnce({ status: 'unsupported' })
      .mockResolvedValueOnce({ status: 'delivered' })
    const runner = runnerFor(store, [profile], [readyRuntime(profile.id, [credit])], deliver)

    await runner.tick(NOW_MS)
    expect(store.getRecords()).toEqual([])
    await runner.tick(NOW_MS + 1)
    expect(store.getRecords()).toEqual([])
    expect(deliver).toHaveBeenCalledTimes(1)
    await runner.tick(NOW_MS + EXPIRY_WARNING_DELIVERY_RETRY_MS)
    expect(store.getRecords()).toEqual([])
    await runner.tick(NOW_MS + EXPIRY_WARNING_DELIVERY_RETRY_MS * 2)

    expect(deliver).toHaveBeenCalledTimes(3)
    expect(store.getRecords()).toHaveLength(1)
  })

  it('backs off after durable deduplication storage fails following native delivery', async () => {
    const store = await warningStore()
    const profile = testProfile()
    const credit = testCredit('credit-1', NOW_SECONDS + 30 * 60)
    const deliver = vi.fn(async () => ({ status: 'delivered' as const }))
    const onError = vi.fn()
    vi.spyOn(store, 'recordStages').mockRejectedValueOnce(new Error('disk full'))
    const runner = new ExpiryWarningRunner({
      store,
      getProfiles: () => [profile],
      getRuntimeStates: () => [readyRuntime(profile.id, [credit])],
      isEnabled: () => true,
      deliver,
      onError
    })

    await runner.tick(NOW_MS)
    await runner.tick(NOW_MS + 1)
    expect(deliver).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'disk full' }))

    await runner.tick(NOW_MS + EXPIRY_WARNING_DELIVERY_RETRY_MS)

    expect(deliver).toHaveBeenCalledTimes(2)
    expect(store.getRecords()).toHaveLength(1)
  })

  it('delivers independent credit notifications concurrently', async () => {
    const store = await warningStore()
    const profile = testProfile()
    const credits = [
      testCredit('credit-1', NOW_SECONDS + 30 * 60),
      testCredit('credit-2', NOW_SECONDS + 40 * 60)
    ]
    let release!: (result: ExpiryWarningDeliveryResult) => void
    const pending = new Promise<ExpiryWarningDeliveryResult>((resolve) => {
      release = resolve
    })
    const deliver = vi.fn(() => pending)
    const runner = runnerFor(store, [profile], [readyRuntime(profile.id, credits)], deliver)

    const tick = runner.tick(NOW_MS)
    expect(deliver).toHaveBeenCalledTimes(2)
    release({ status: 'delivered' })
    await tick

    expect(store.getRecords()).toHaveLength(2)
  })

  it('deduplicates a shared backend credit across homes', async () => {
    const store = await warningStore()
    const first = testProfile({ id: 'profile-a' })
    const second = testProfile({ id: 'profile-b', codexHome: '/test/other' })
    const credit = testCredit('credit-1', NOW_SECONDS + 30 * 60)
    const deliver = vi.fn(
      async (_request: ExpiryWarningDeliveryRequest): Promise<ExpiryWarningDeliveryResult> => ({
        status: 'delivered'
      })
    )
    const runner = runnerFor(
      store,
      [first, second],
      [readyRuntime(first.id, [credit]), readyRuntime(second.id, [credit])],
      deliver
    )

    await runner.tick(NOW_MS)

    expect(deliver).toHaveBeenCalledTimes(1)
    expect(deliver.mock.calls[0]?.[0].candidate.profileIds).toEqual([
      'profile-a',
      'profile-b'
    ])
  })

  it('uses an injectable 15-second interval and honors global disablement', async () => {
    const store = await warningStore()
    const profile = testProfile()
    const credit = testCredit('credit-1', NOW_SECONDS + 30 * 60)
    const scheduler = new RecordingScheduler()
    const deliver = vi.fn(async (): Promise<ExpiryWarningDeliveryResult> => ({
      status: 'delivered'
    }))
    const runner = new ExpiryWarningRunner({
      store,
      getProfiles: () => [profile],
      getRuntimeStates: () => [readyRuntime(profile.id, [credit])],
      isEnabled: () => false,
      deliver,
      now: () => NOW_MS,
      scheduler
    })

    runner.start()
    await Promise.resolve()
    expect(scheduler.intervalMs).toBe(EXPIRY_WARNING_EVALUATION_INTERVAL_MS)
    expect(deliver).not.toHaveBeenCalled()
    await runner.shutdown()
    expect(scheduler.cleared).toBe(true)
  })
})

class RecordingScheduler implements ExpiryWarningIntervalScheduler {
  intervalMs: number | null = null
  cleared = false
  private callback: (() => void) | null = null

  setInterval(callback: () => void, intervalMs: number): unknown {
    this.callback = callback
    this.intervalMs = intervalMs
    return callback
  }

  clearInterval(handle: unknown): void {
    expect(handle).toBe(this.callback)
    this.cleared = true
  }
}

async function warningStore(): Promise<ExpiryWarningStore> {
  const directory = await mkdtemp(path.join(tmpdir(), 'expiry-warning-runner-'))
  const store = new ExpiryWarningStore(path.join(directory, 'notification-state.json'))
  await store.initialize(NOW_MS)
  return store
}

function runnerFor(
  store: ExpiryWarningStore,
  profiles: ProfileSettings[],
  runtimeStates: ProfileRuntimeState[],
  deliver: ConstructorParameters<typeof ExpiryWarningRunner>[0]['deliver']
): ExpiryWarningRunner {
  return new ExpiryWarningRunner({
    store,
    getProfiles: () => profiles,
    getRuntimeStates: () => runtimeStates,
    isEnabled: () => true,
    deliver
  })
}

function testProfile(overrides: Partial<ProfileSettings> = {}): ProfileSettings {
  return {
    id: 'profile-1',
    name: 'Codex',
    codexHome: '/test/codex',
    enabled: true,
    autoRedeemEnabled: false,
    leadTimeMinutes: 30,
    ...overrides
  }
}

function testCredit(id: string, expiresAt: number): ResetCredit {
  return {
    id,
    resetType: 'codexRateLimits',
    status: 'available',
    grantedAt: 1,
    expiresAt,
    title: 'Full reset',
    description: null
  }
}

function readyRuntime(profileId: string, credits: ResetCredit[]): ProfileRuntimeState {
  return {
    profileId,
    status: 'ready',
    usageLimits: [],
    availableCount: credits.length,
    credits,
    refreshedAt: 1,
    error: null
  }
}
