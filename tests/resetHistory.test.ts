import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { bankedResetHistory } from '../src/main/history/bankedResetHistory'
import { ResetHistoryStore } from '../src/main/history/resetHistoryStore'
import type { AutomationRecord } from '../src/main/automation/automationLedger'
import type { ProfileRuntimeState } from '../src/shared/types'

describe('reset history', () => {
  it('records the active window once, then records a moved reset schedule', async () => {
    const store = await createStore()
    const firstObservedAt = 20_000_000
    await store.observeProfiles([runtime(20_000, 10_080, 45)], [], firstObservedAt)
    await store.observeProfiles([runtime(20_000, 10_080, 46)], [], firstObservedAt + 60_000)

    expect(store.getEvents()).toHaveLength(1)
    expect(store.getEvents()[0]).toMatchObject({
      kind: 'observed-reset',
      occurredAt: (20_000 - 10_080 * 60) * 1_000,
      previousResetsAt: null,
      nextResetsAt: 20_000_000
    })

    await store.observeProfiles([runtime(30_000, 10_080, 3)], [], 30_000_000)
    expect(store.getEvents()).toHaveLength(2)
    expect(store.getEvents()[1]).toMatchObject({
      usedPercentBefore: 46,
      usedPercentAfter: 3,
      previousResetsAt: 20_000_000,
      nextResetsAt: 30_000_000
    })
  })

  it('uses confirmed banked redemptions instead of duplicating them as observed resets', async () => {
    const store = await createStore()
    const completedAt = 5_000_000
    const banked = bankedResetHistory([record(completedAt)])
    await store.observeProfiles([runtime(5_000 + 300 * 60, 300, 0)], banked, 5_060_000)

    expect(store.getEvents()).toEqual([])
    expect(banked).toEqual([
      expect.objectContaining({
        kind: 'banked-reset',
        occurredAt: completedAt,
        creditId: 'credit-1'
      })
    ])
  })

  it('restores observations and events after restart', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'reset-history-persisted-'))
    const filePath = path.join(directory, 'reset-history.json')
    const first = new ResetHistoryStore(filePath)
    await first.initialize()
    await first.observeProfiles([runtime(20_000, 300, 1)], [], 20_000_000)

    const restored = new ResetHistoryStore(filePath)
    await restored.initialize()
    expect(restored.getEvents()).toEqual(first.getEvents())
  })

  it('ignores rolling model buckets and removes their previously recorded events', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'reset-history-cleanup-'))
    const filePath = path.join(directory, 'reset-history.json')
    await writeFile(
      filePath,
      JSON.stringify({
        version: 1,
        observations: {
          model: {
            profileId: 'profile-1',
            usageLimitId: 'codex_model_bucket',
            usageWindow: 'primary',
            windowDurationMinutes: 300,
            usedPercent: 0,
            resetsAt: 21_000_000,
            windowStartedAt: 3_000_000,
            observedAt: 20_000_000
          }
        },
        events: [observedEvent('codex_model_bucket', 3_000_000)]
      }),
      'utf8'
    )
    const store = new ResetHistoryStore(filePath)
    await store.initialize()
    const state = runtime(20_000, 300, 1)
    state.usageLimits.push({
      ...state.usageLimits[0],
      id: 'codex_model_bucket',
      primary: { usedPercent: 0, windowDurationMinutes: 300, resetsAt: 21_000 }
    })

    await store.observeProfiles([state], [], 20_000_000)
    expect(store.getEvents()).toEqual([
      expect.objectContaining({ usageLimitId: 'codex' })
    ])
  })
})

async function createStore(): Promise<ResetHistoryStore> {
  const directory = await mkdtemp(path.join(tmpdir(), 'reset-history-'))
  const store = new ResetHistoryStore(path.join(directory, 'reset-history.json'))
  await store.initialize()
  return store
}

function runtime(
  resetsAt: number,
  windowDurationMinutes: number,
  usedPercent: number
): ProfileRuntimeState {
  return {
    profileId: 'profile-1',
    status: 'ready',
    usageLimits: [
      {
        id: 'codex',
        name: null,
        primary: { usedPercent, windowDurationMinutes, resetsAt },
        secondary: null,
        planType: 'pro',
        rateLimitReachedType: null
      }
    ],
    availableCount: 0,
    credits: [],
    refreshedAt: 1,
    error: null
  }
}

function record(completedAt: number): AutomationRecord {
  return {
    profileId: 'profile-1',
    creditId: 'credit-1',
    creditExpiresAt: 10_000,
    idempotencyKey: 'key-1',
    status: 'redeemed',
    attempts: 1,
    createdAt: completedAt - 1_000,
    lastAttemptAt: completedAt - 500,
    lastOutcome: 'reset',
    lastError: null,
    completedAt
  }
}

function observedEvent(usageLimitId: string, occurredAt: number) {
  return {
    id: `observed:${usageLimitId}:${occurredAt}`,
    profileId: 'profile-1',
    kind: 'observed-reset',
    occurredAt,
    recordedAt: occurredAt,
    creditId: null,
    bankedOutcome: null,
    usageLimitId,
    usageWindow: 'primary',
    windowDurationMinutes: 300,
    usedPercentBefore: null,
    usedPercentAfter: 0,
    previousResetsAt: null,
    nextResetsAt: occurredAt + 300 * 60 * 1_000
  }
}
