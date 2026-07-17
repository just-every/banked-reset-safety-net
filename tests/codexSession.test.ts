import { mkdtemp, realpath } from 'node:fs/promises'
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

    await session.readResetCredits()
    expect(rpc.requests.map(({ method }) => method)).toEqual([
      'initialize',
      'account/rateLimits/read'
    ])
    expect(rpc.requests.some(({ method }) => method.includes('consume'))).toBe(false)

    await expect(session.consumeCredit('', 'idempotency-1')).rejects.toThrow(
      'specific reset credit id'
    )
    await session.consumeCredit('credit-1', 'idempotency-1')
    expect(rpc.requests.at(-1)).toEqual({
      method: 'account/rateLimitResetCredit/consume',
      params: { creditId: 'credit-1', idempotencyKey: 'idempotency-1' }
    })
  })
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
        rateLimits: {},
        rateLimitResetCredits: { availableCount: 0, credits: [] }
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
