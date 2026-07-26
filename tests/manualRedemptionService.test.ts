import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VerifiedManualRedemptionAuthorization } from '../src/main/automation/automationRunner'
import type { RedemptionSnapshot } from '../src/main/codex/codexSession'
import { ManualRedemptionService } from '../src/main/manual/manualRedemptionService'
import { SettingsStore } from '../src/main/settings/settingsStore'
import {
  SETTINGS_VERSION,
  type AppSettings,
  type ManualUseResult,
  type ProfileSettings,
  type ResetCredit
} from '../src/shared/types'

describe('manual redemption confirmation service', () => {
  let directory: string
  let home: string
  let settings: SettingsStore
  let credit: ResetCredit
  let gateway: SnapshotGateway
  let executor: RecordingManualExecutor
  let service: ManualRedemptionService

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'reset-net-manual-service-'))
    home = path.join(directory, 'codex-home')
    await mkdir(home)
    await writeFile(
      path.join(directory, 'settings.json'),
      JSON.stringify(testSettings(home)),
      'utf8'
    )
    settings = new SettingsStore(path.join(directory, 'settings.json'), home, directory)
    await settings.initialize()
    credit = resetCredit('credit-1', Math.floor(Date.now() / 1_000) + 2 * 60 * 60)
    gateway = new SnapshotGateway(home, [credit])
    executor = new RecordingManualExecutor()
    service = createService(settings, gateway, executor)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('requires review acknowledgement and an exact typed second confirmation', async () => {
    const review = await service.prepare('profile-1', credit.id)
    expect(review).toMatchObject({
      profile: { id: 'profile-1', codexHome: home },
      account: { type: 'chatgpt', email: 'person@example.com' },
      credit: { id: credit.id, expiresAt: credit.expiresAt }
    })
    expect(executor.authorizations).toHaveLength(0)

    await expect(service.confirm(review.challengeId, 'USE RESET FORGED')).rejects.toThrow(
      'Both manual reset confirmations'
    )
    const typed = service.acknowledge(review.challengeId)
    await expect(service.confirm(review.challengeId, `${typed.confirmationPrompt} `)).rejects.toThrow(
      'does not match exactly'
    )
    expect(executor.authorizations).toHaveLength(0)

    const result = await service.confirm(review.challengeId, typed.confirmationPrompt)
    expect(result.outcome).toBe('nothingToReset')
    expect(executor.authorizations).toHaveLength(1)
    expect(executor.authorizations[0]).toMatchObject({
      profileId: 'profile-1',
      codexHome: home,
      credit: { id: 'credit-1', expiresAt: credit.expiresAt }
    })
    expect(executor.authorizations[0]?.accountBinding.accountFingerprint).toMatch(/^[0-9a-f]{64}$/)
    await expect(service.confirm(review.challengeId, typed.confirmationPrompt)).rejects.toThrow(
      'expired or does not exist'
    )
  })

  it('cancels either confirmation stage without executing', async () => {
    const first = await service.prepare('profile-1', credit.id)
    service.cancel(first.challengeId)
    expect(() => service.acknowledge(first.challengeId)).toThrow('expired or does not exist')

    const second = await service.prepare('profile-1', credit.id)
    service.acknowledge(second.challengeId)
    service.cancel(second.challengeId)
    await expect(service.confirm(second.challengeId, 'USE RESET ANYTHING')).rejects.toThrow(
      'expired or does not exist'
    )
    expect(executor.authorizations).toHaveLength(0)
  })

  it('expires review and typed challenges in main-process state', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const review = await service.prepare('profile-1', credit.id)
    vi.setSystemTime(review.reviewExpiresAt + 1)
    expect(() => service.acknowledge(review.challengeId)).toThrow('expired or does not exist')

    vi.setSystemTime(Date.now() + 1)
    credit = resetCredit('credit-2', Math.floor(Date.now() / 1_000) + 2 * 60 * 60)
    gateway.credits = [credit]
    const nextReview = await service.prepare('profile-1', credit.id)
    const typed = service.acknowledge(nextReview.challengeId)
    vi.setSystemTime(typed.confirmationExpiresAt + 1)
    await expect(service.confirm(nextReview.challengeId, typed.confirmationPrompt)).rejects.toThrow(
      'expired or does not exist'
    )
  })

  it('allows only the fresh current earliest exact available credit', async () => {
    const later = resetCredit('credit-later', (credit.expiresAt as number) + 60)
    gateway.credits = [later, credit]
    await expect(service.prepare('profile-1', later.id)).rejects.toThrow(
      'current earliest available exact reset'
    )

    gateway.credits = [{ ...credit, status: 'redeemed' }]
    await expect(service.prepare('profile-1', credit.id)).rejects.toThrow(
      'current earliest available exact reset'
    )
    gateway.credits = [{ ...credit, resetType: 'unknown' }]
    await expect(service.prepare('profile-1', credit.id)).rejects.toThrow(
      'current earliest available exact reset'
    )
  })

  it.each([
    { account: null, requiresOpenaiAuth: true },
    { account: { type: 'apiKey' as const }, requiresOpenaiAuth: true },
    {
      account: { type: 'chatgpt' as const, email: null, planType: 'pro' },
      requiresOpenaiAuth: true
    },
    {
      account: { type: 'chatgpt' as const, email: '   ', planType: 'pro' },
      requiresOpenaiAuth: true
    }
  ])('fails closed without a nonblank ChatGPT account identity', async (account) => {
    gateway.account = account
    await expect(service.prepare('profile-1', credit.id)).rejects.toThrow()
    expect(executor.authorizations).toHaveLength(0)
  })

  it('invalidates the challenge when any settings revision changes', async () => {
    const review = await service.prepare('profile-1', credit.id)
    await settings.updateProfile('profile-1', { name: 'Changed after review' })
    expect(() => service.acknowledge(review.challengeId)).toThrow(
      'Settings changed while the manual reset was being confirmed'
    )
    expect(executor.authorizations).toHaveLength(0)
  })

  it('atomically rejects concurrent final submissions', async () => {
    const review = await service.prepare('profile-1', credit.id)
    const typed = service.acknowledge(review.challengeId)
    let release: (() => void) | undefined
    executor.block = new Promise<void>((resolve) => {
      release = resolve
    })

    const first = service.confirm(review.challengeId, typed.confirmationPrompt)
    await Promise.resolve()
    await expect(service.confirm(review.challengeId, typed.confirmationPrompt)).rejects.toThrow(
      'Both manual reset confirmations'
    )
    release?.()
    await first
    expect(executor.authorizations).toHaveLength(1)
  })

  it('fails closed at the bounded active-challenge capacity', async () => {
    for (let index = 0; index < 100; index += 1) {
      await service.prepare('profile-1', credit.id)
    }
    await expect(service.prepare('profile-1', credit.id)).rejects.toThrow(
      'Too many manual reset confirmations'
    )
    expect(executor.authorizations).toHaveLength(0)
  })

  it('keeps the active-challenge bound under concurrent preparation', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 101 }, () => service.prepare('profile-1', credit.id))
    )

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(100)
    expect(results.filter(({ status }) => status === 'rejected')).toHaveLength(1)
    expect(executor.authorizations).toHaveLength(0)
  })
})

class SnapshotGateway {
  account: RedemptionSnapshot['account'] = {
    account: { type: 'chatgpt', email: 'person@example.com', planType: 'pro' },
    requiresOpenaiAuth: true
  }

  constructor(
    readonly canonicalCodexHome: string,
    public credits: ResetCredit[]
  ) {}

  async readRedemptionSnapshot(): Promise<RedemptionSnapshot> {
    return {
      account: structuredClone(this.account),
      rateLimits: {
        availableCount: this.credits.filter((candidate) => candidate.status === 'available').length,
        credits: structuredClone(this.credits)
      },
      canonicalCodexHome: this.canonicalCodexHome
    }
  }
}

class RecordingManualExecutor {
  readonly authorizations: VerifiedManualRedemptionAuthorization[] = []
  block: Promise<void> | null = null

  async executeManual(
    authorization: VerifiedManualRedemptionAuthorization
  ): Promise<ManualUseResult> {
    this.authorizations.push(structuredClone(authorization))
    await this.block
    return {
      outcome: 'nothingToReset',
      message: 'No reset was needed.'
    }
  }
}

function createService(
  settings: SettingsStore,
  gateway: SnapshotGateway,
  executor: RecordingManualExecutor
): ManualRedemptionService {
  return new ManualRedemptionService({
    settings,
    sessions: gateway,
    executor,
    getResolvedExecutable: () => '/test/codex'
  })
}

function testSettings(codexHome: string): AppSettings {
  return {
    version: SETTINGS_VERSION,
    codexExecutable: '',
    launchAtLogin: false,
    expiryWarningsEnabled: true,
    ignoredCodexHomes: [],
    profiles: [
      {
        id: 'profile-1',
        name: 'Codex test',
        codexHome,
        enabled: true,
        autoRedeemEnabled: false,
        leadTimeMinutes: 30
      }
    ]
  }
}

function resetCredit(id: string, expiresAt: number): ResetCredit {
  return {
    id,
    resetType: 'codexRateLimits',
    status: 'available',
    grantedAt: expiresAt - 1_000,
    expiresAt,
    title: 'Full reset',
    description: null
  }
}
