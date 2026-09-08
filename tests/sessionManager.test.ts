import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CodexSession } from '../src/main/codex/codexSession'
import { JsonRpcProcess } from '../src/main/codex/jsonRpcProcess'
import { CodexSessionManager } from '../src/main/codex/sessionManager'
import type { ProfileSettings } from '../src/shared/types'

const profile: ProfileSettings = {
  id: 'profile-1',
  name: 'Test',
  codexHome: '/test/.codex',
  enabled: true,
  autoRedeemEnabled: false,
  leadTimeMinutes: 30
}
const limits = { usageLimits: [], availableCount: 0, credits: [] }

describe('CodexSessionManager connection recovery', () => {
  beforeEach(() => {
    vi.spyOn(JsonRpcProcess.prototype, 'start').mockImplementation(() => {
      throw new Error('Tests must never start a real Codex process.')
    })
    vi.spyOn(CodexSession.prototype, 'isOpen').mockReturnValue(true)
    vi.spyOn(CodexSession.prototype, 'close').mockResolvedValue()
  })

  afterEach(() => vi.restoreAllMocks())

  it('replaces a live connection after an expired-token usage error on the next refresh', async () => {
    const read = vi.spyOn(CodexSession.prototype, 'readRateLimits')
      .mockRejectedValueOnce(new Error('401 Unauthorized: token_expired'))
      .mockResolvedValue(limits)
    const manager = new CodexSessionManager()

    await expect(manager.readRateLimits(profile, '/test/codex')).rejects.toThrow('token_expired')
    expect(read).toHaveBeenCalledTimes(1)
    expect(CodexSession.prototype.close).toHaveBeenCalledOnce()
    await expect(manager.readRateLimits(profile, '/test/codex')).resolves.toEqual(limits)
    expect(read.mock.contexts[1]).not.toBe(read.mock.contexts[0])

    await manager.readRateLimits(profile, '/test/codex')
    expect(read.mock.contexts[2]).toBe(read.mock.contexts[1])
  })

  it('leaves other profiles connected when a usage read fails', async () => {
    const read = vi.spyOn(CodexSession.prototype, 'readRateLimits').mockResolvedValue(limits)
    const manager = new CodexSessionManager()
    const otherProfile = { ...profile, id: 'profile-2', codexHome: '/test/other' }
    await manager.readRateLimits(otherProfile, '/test/codex')
    read.mockRejectedValueOnce(new Error('Usage request failed'))
    await expect(manager.readRateLimits(profile, '/test/codex')).rejects.toThrow()
    await manager.readRateLimits(otherProfile, '/test/codex')

    expect(read.mock.contexts[2]).toBe(read.mock.contexts[0])
  })

  it('does not evict a newer session when an earlier in-flight read fails', async () => {
    let rejectRead!: (error: Error) => void
    const read = vi.spyOn(CodexSession.prototype, 'readRateLimits')
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectRead = reject }))
      .mockResolvedValue(limits)
    const manager = new CodexSessionManager()
    const pending = manager.readRateLimits(profile, '/test/codex')
    const failed = expect(pending).rejects.toThrow('Old request failed')
    await manager.reconcile([], '/test/codex')
    await manager.readRateLimits(profile, '/test/codex')
    rejectRead(new Error('Old request failed'))
    await failed
    await manager.readRateLimits(profile, '/test/codex')

    expect(read.mock.contexts[2]).toBe(read.mock.contexts[1])
  })

  it('never retries a consume operation or restarts its live session on error', async () => {
    const consume = vi.spyOn(CodexSession.prototype, 'consumeCredit')
      .mockRejectedValue(new Error('401 Unauthorized: token_expired'))
    const manager = new CodexSessionManager()
    const authorize = vi.fn()

    await expect(manager.consumeCredit(
      profile, '/test/codex', 'test-credit', 'test-idempotency', authorize
    )).rejects.toThrow('token_expired')

    expect(consume).toHaveBeenCalledExactlyOnceWith('test-credit', 'test-idempotency', authorize)
    expect(CodexSession.prototype.close).not.toHaveBeenCalled()
  })
})
