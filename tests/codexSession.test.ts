import { mkdtemp, mkdir, realpath, symlink, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CodexSession } from '../src/main/codex/codexSession'
import type { RpcConnection } from '../src/main/codex/jsonRpcProcess'

describe('CodexSession safety boundary', () => {
  it('keeps discovery read-only and requires an exact credit id for redemption', async () => {
    const home = await realpath(await mkdtemp(path.join(tmpdir(), 'reset-net-session-')))
    const rpc = new RecordingRpc(home)
    const session = new CodexSession('/test/codex', home, rpc)

    const snapshot = await session.readRateLimits()
    expect(snapshot.usageLimits[0]?.primary?.usedPercent).toBe(12)
    expect(rpc.requests.map(({ method }) => method)).toEqual([
      'initialize',
      'account/rateLimits/read'
    ])
    expect(rpc.requests.some(({ method }) => method.includes('consume'))).toBe(false)

    await expect(session.consumeCredit('', 'idempotency-1', () => undefined)).rejects.toThrow(
      'specific reset credit id'
    )
    let authorized = false
    await session.consumeCredit('credit-1', 'idempotency-1', () => {
      expect(rpc.requests.some(({ method }) => method.includes('consume'))).toBe(false)
      authorized = true
    })
    expect(authorized).toBe(true)
    expect(rpc.requests.at(-1)).toEqual({
      method: 'account/rateLimitResetCredit/consume',
      params: { creditId: 'credit-1', idempotencyKey: 'idempotency-1' }
    })
  })

  it('reads account and credits together from the canonically verified home', async () => {
    const home = await realpath(await mkdtemp(path.join(tmpdir(), 'reset-net-snapshot-')))
    const rpc = new RecordingRpc(home)
    const session = new CodexSession('/test/codex', home, rpc)

    const snapshot = await session.readRedemptionSnapshot()

    expect(snapshot).toMatchObject({
      account: {
        account: { type: 'chatgpt', email: 'person@example.com', planType: 'pro' }
      },
      canonicalCodexHome: home
    })
    expect(rpc.requests.map(({ method }) => method)).toEqual([
      'initialize',
      'account/read',
      'account/rateLimits/read'
    ])
  })

  it('requires the synchronous before-send authorization callback', async () => {
    const home = await realpath(await mkdtemp(path.join(tmpdir(), 'reset-net-callback-')))
    const session = new CodexSession('/test/codex', home, new RecordingRpc(home))
    await expect(
      session.consumeCredit('credit-1', 'idempotency-1', undefined as never)
    ).rejects.toThrow('final synchronous redemption authorization check')
  })

  it.runIf(process.platform !== 'win32')(
    'fails closed if the configured home symlink changes target',
    async () => {
      const directory = await mkdtemp(path.join(tmpdir(), 'reset-net-retarget-'))
      const originalHome = path.join(directory, 'original')
      const replacementHome = path.join(directory, 'replacement')
      const configuredHome = path.join(directory, 'configured')
      await Promise.all([mkdir(originalHome), mkdir(replacementHome)])
      await symlink(originalHome, configuredHome)
      const canonicalOriginal = await realpath(originalHome)
      const session = new CodexSession(
        '/test/codex',
        configuredHome,
        new RecordingRpc(canonicalOriginal)
      )

      await session.readRedemptionSnapshot()
      await unlink(configuredHome)
      await symlink(replacementHome, configuredHome)

      await expect(session.readRedemptionSnapshot()).rejects.toThrow(
        'canonical target changed before redemption'
      )
    }
  )
})

class RecordingRpc implements RpcConnection {
  readonly requests: Array<{ method: string; params?: unknown }> = []
  private open = false

  constructor(private readonly home: string) {}

  start(): void {
    this.open = true
  }

  isOpen(): boolean {
    return this.open
  }

  request(method: string, params?: unknown): Promise<unknown> {
    this.requests.push(params === undefined ? { method } : { method, params })
    if (method === 'initialize') {
      return Promise.resolve({
        userAgent: 'test',
        codexHome: this.home,
        platformFamily: 'unix',
        platformOs: 'macos'
      })
    }
    if (method === 'account/rateLimits/read') {
      return Promise.resolve({
        rateLimits: {
          limitId: 'codex',
          limitName: null,
          primary: { usedPercent: 12, windowDurationMins: 10_080, resetsAt: 20_000 },
          secondary: null,
          planType: 'pro',
          rateLimitReachedType: null
        },
        rateLimitResetCredits: { availableCount: 0, credits: [] }
      })
    }
    if (method === 'account/read') {
      return Promise.resolve({
        account: {
          type: 'chatgpt',
          email: 'person@example.com',
          planType: 'pro'
        },
        requiresOpenaiAuth: true
      })
    }
    if (method === 'account/rateLimitResetCredit/consume') {
      return Promise.resolve({ outcome: 'nothingToReset' })
    }
    return Promise.reject(new Error(`Unexpected method ${method}`))
  }

  notify(): void {}

  async close(): Promise<void> {
    this.open = false
  }
}
