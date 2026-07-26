import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { AutomationLedger } from '../src/main/automation/automationLedger'
import { requireRedemptionAccountBinding } from '../src/main/automation/accountBinding'
import {
  AutomationRunner,
  type AutomationSessionGateway
} from '../src/main/automation/automationRunner'
import { RedemptionLock } from '../src/main/automation/redemptionLock'
import type { RedemptionSnapshot } from '../src/main/codex/codexSession'
import { SettingsStore } from '../src/main/settings/settingsStore'
import {
  SETTINGS_VERSION,
  type AppSettings,
  type ConsumeResetOutcome,
  type ProfileRuntimeState,
  type ResetCredit
} from '../src/shared/types'

describe('automatic reset runner', () => {
  let directory: string
  let home: string
  let settings: SettingsStore
  let ledger: AutomationLedger
  let credit: ResetCredit
  let runtime: ProfileRuntimeState
  let now: number

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'reset-net-runner-'))
    home = path.join(directory, 'codex-home')
    await mkdir(home)
    now = Date.now()
    credit = {
      id: 'credit-1',
      resetType: 'codexRateLimits',
      status: 'available',
      grantedAt: Math.floor(now / 1_000) - 100,
      expiresAt: Math.floor(now / 1_000) + 10 * 60,
      title: 'Full reset',
      description: null
    }
    runtime = {
      profileId: 'profile-1',
      status: 'ready',
      usageLimits: [],
      availableCount: 1,
      credits: [credit],
      refreshedAt: now,
      error: null
    }

    await writeFile(
      path.join(directory, 'settings.json'),
      JSON.stringify(testSettings(home)),
      'utf8'
    )
    settings = new SettingsStore(path.join(directory, 'settings.json'))
    ledger = new AutomationLedger(path.join(directory, 'ledger.json'))
    await Promise.all([settings.initialize(), ledger.initialize()])
  })

  it('targets the exact freshly revalidated credit with a durable idempotency key', async () => {
    const gateway = new RecordingGateway([credit])
    const runner = createRunner(settings, ledger, gateway, runtime, directory)

    await runner.tick(now)

    expect(gateway.consumes).toHaveLength(1)
    expect(gateway.consumes[0]?.creditId).toBe('credit-1')
    expect(gateway.consumes[0]?.idempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
    expect(ledger.getRecord('profile-1', 'credit-1')).toMatchObject({
      status: 'waiting',
      attempts: 1,
      lastOutcome: 'nothingToReset'
    })
  })

  it('does not consume when the fresh expiry identity differs', async () => {
    const mismatched = { ...credit, expiresAt: (credit.expiresAt ?? 0) + 1 }
    const gateway = new RecordingGateway([mismatched])
    const runner = createRunner(settings, ledger, gateway, runtime, directory)

    await runner.tick(now)

    expect(gateway.consumes).toHaveLength(0)
    expect(ledger.getRecord('profile-1', 'credit-1')).toBeNull()
  })

  it('does nothing while automatic use is disabled', async () => {
    await settings.updateProfile('profile-1', { autoRedeemEnabled: false })
    const gateway = new RecordingGateway([credit])
    const runner = createRunner(settings, ledger, gateway, runtime, directory)

    await runner.tick(now)

    expect(gateway.reads).toBe(0)
    expect(gateway.consumes).toHaveLength(0)
  })

  it('rechecks the one-hour boundary immediately before consumption', async () => {
    const actualNow = Date.now()
    credit = {
      ...credit,
      expiresAt: Math.floor(actualNow / 1_000) + 2 * 60 * 60
    }
    runtime = { ...runtime, credits: [credit] }
    const simulatedDueTime = credit.expiresAt! * 1_000 - 10 * 60 * 1_000
    const gateway = new RecordingGateway([credit])
    const runner = createRunner(settings, ledger, gateway, runtime, directory)

    await runner.tick(simulatedDueTime)

    expect(gateway.reads).toBe(0)
    expect(gateway.consumes).toHaveLength(0)
  })

  it('locks the same backend credit across two tracked homes', async () => {
    const secondHome = path.join(directory, 'second-codex-home')
    await mkdir(secondHome)
    const withSecond = await settings.addProfile({
      name: 'Same account, second home',
      codexHome: secondHome
    })
    const secondProfile = withSecond.profiles[1]!
    await settings.updateProfile(secondProfile.id, {
      autoRedeemEnabled: true,
      autoRedeemConfirmed: true
    })
    const secondRuntime = { ...runtime, profileId: secondProfile.id }
    const gateway = new RecordingGateway([credit], 25)
    const runner = createRunner(settings, ledger, gateway, [runtime, secondRuntime], directory)

    await runner.tick(now)

    expect(gateway.consumes).toHaveLength(1)
  })

  it('stops when a newly earlier credit appears during final revalidation', async () => {
    const earlier = {
      ...credit,
      id: 'credit-earlier',
      expiresAt: (credit.expiresAt as number) - 60
    }
    const gateway = new RecordingGateway([credit])
    gateway.creditSnapshots = [[credit], [credit, earlier]]
    const runner = createRunner(settings, ledger, gateway, runtime, directory)

    await runner.tick(now)

    expect(gateway.consumes).toHaveLength(0)
    expect(ledger.getRecord('profile-1', credit.id)?.status).toBe('waiting')
  })

  it('stops when the freshly re-read account changes', async () => {
    const gateway = new RecordingGateway([credit])
    gateway.accountEmails = ['first@example.com', 'second@example.com']
    const runner = createRunner(settings, ledger, gateway, runtime, directory)

    await runner.tick(now)

    expect(gateway.consumes).toHaveLength(0)
    expect(ledger.getRecord('profile-1', credit.id)?.status).toBe('waiting')
  })

  it('checks the settings revision synchronously at the actual RPC write', async () => {
    const gateway = new RecordingGateway([credit])
    gateway.beforeAuthorization = () =>
      settings.updateProfile('profile-1', { name: 'Changed at send boundary' }).then(() => undefined)
    const runner = createRunner(settings, ledger, gateway, runtime, directory)

    await runner.tick(now)

    expect(gateway.consumes).toHaveLength(0)
    expect(ledger.getRecord('profile-1', credit.id)?.status).toBe('waiting')
  })

  it('permits a separately verified manual use more than one hour early', async () => {
    credit = {
      ...credit,
      expiresAt: Math.floor(Date.now() / 1_000) + 2 * 60 * 60
    }
    await settings.updateProfile('profile-1', { autoRedeemEnabled: false })
    const gateway = new RecordingGateway([credit])
    const runner = createRunner(settings, ledger, gateway, runtime, directory)
    const binding = requireRedemptionAccountBinding(snapshot(home, [credit]))

    const result = await runner.executeManual({
      profileId: 'profile-1',
      settingsRevision: settings.getRevision(),
      codexHome: home,
      credit,
      accountBinding: binding
    })

    expect(result.outcome).toBe('nothingToReset')
    expect(gateway.consumes).toHaveLength(1)
    expect(ledger.getRecord('profile-1', credit.id)).toMatchObject({
      status: 'waiting',
      authorizationKind: 'manual'
    })

    await runner.tick(Date.now() + 6 * 60 * 1_000)
    expect(gateway.consumes).toHaveLength(1)
  })

  it('fails a manual request when the freshly locked account differs from the review', async () => {
    credit = {
      ...credit,
      expiresAt: Math.floor(Date.now() / 1_000) + 2 * 60 * 60
    }
    await settings.updateProfile('profile-1', { autoRedeemEnabled: false })
    const reviewedBinding = requireRedemptionAccountBinding(
      snapshot(home, [credit], 'reviewed@example.com')
    )
    const gateway = new RecordingGateway([credit])
    gateway.accountEmails = ['changed@example.com']
    const runner = createRunner(settings, ledger, gateway, runtime, directory)

    await expect(
      runner.executeManual({
        profileId: 'profile-1',
        settingsRevision: settings.getRevision(),
        codexHome: home,
        credit,
        accountBinding: reviewedBinding
      })
    ).rejects.toThrow('confirmed account or canonical home changed')
    expect(gateway.consumes).toHaveLength(0)
  })

  it('fails closed when Codex cannot freshly identify the automatic-use account', async () => {
    const gateway = new RecordingGateway([credit])
    gateway.accountEmails = [null]
    const runner = createRunner(settings, ledger, gateway, runtime, directory)

    await runner.tick(now)

    expect(gateway.consumes).toHaveLength(0)
    expect(ledger.getRecord('profile-1', credit.id)).toBeNull()
  })

  it('recovers an interrupted bound attempt from the ledger even when the credit disappeared', async () => {
    const binding = requireRedemptionAccountBinding(snapshot(home, [credit]))
    const intent = await ledger.ensureIntent('profile-1', credit, binding, now - 10 * 60 * 1_000)
    await ledger.markAttempt('profile-1', credit.id, 'automatic', now - 6 * 60 * 1_000)
    await ledger.markError('profile-1', credit.id, 'response lost', now - 6 * 60 * 1_000)
    const gateway = new RecordingGateway([])
    const emptyRuntime = { ...runtime, credits: [], availableCount: 0 }
    const runner = createRunner(settings, ledger, gateway, emptyRuntime, directory)

    await runner.tick(now)

    expect(gateway.consumes).toEqual([
      { creditId: credit.id, idempotencyKey: intent.idempotencyKey }
    ])
    expect(ledger.getRecord('profile-1', credit.id)?.status).toBe('waiting')
  })

  it('replays an actually interrupted automatic request with the exact original key', async () => {
    const gateway = new RecordingGateway([credit])
    gateway.consumeError = new Error('response lost after write')
    const runner = createRunner(settings, ledger, gateway, runtime, directory)

    await runner.tick(now)

    const uncertain = ledger.getRecord('profile-1', credit.id)
    expect(uncertain).toMatchObject({ status: 'uncertain', attempts: 1 })
    expect(gateway.consumes).toHaveLength(0)

    gateway.consumeError = null
    gateway.freshCredits = []
    await runner.tick(now + 6 * 60 * 1_000)

    expect(gateway.consumes).toEqual([
      { creditId: credit.id, idempotencyKey: uncertain?.idempotencyKey }
    ])
  })

  it('fails closed for a legacy uncertain record with no binding when the credit is absent', async () => {
    const legacyPath = path.join(directory, 'legacy-ledger.json')
    await writeFile(
      legacyPath,
      JSON.stringify({
        version: 1,
        records: {
          'profile-1:credit-1': {
            profileId: 'profile-1',
            creditId: credit.id,
            creditExpiresAt: credit.expiresAt,
            idempotencyKey: 'legacy-key',
            status: 'uncertain',
            attempts: 1,
            createdAt: now - 10 * 60 * 1_000,
            lastAttemptAt: now - 6 * 60 * 1_000,
            lastOutcome: null,
            lastError: 'response lost',
            completedAt: null
          }
        },
        events: []
      }),
      'utf8'
    )
    const legacyLedger = new AutomationLedger(legacyPath)
    await legacyLedger.initialize()
    const gateway = new RecordingGateway([])
    const emptyRuntime = { ...runtime, credits: [], availableCount: 0 }
    const runner = createRunner(settings, legacyLedger, gateway, emptyRuntime, directory)

    await runner.tick(now)

    expect(gateway.consumes).toHaveLength(0)
    expect(legacyLedger.getRecord('profile-1', credit.id)).toMatchObject({
      status: 'uncertain',
      accountFingerprint: null,
      canonicalCodexHome: null
    })
  })
})

class RecordingGateway implements AutomationSessionGateway {
  reads = 0
  readonly consumes: Array<{ creditId: string; idempotencyKey: string }> = []
  creditSnapshots: ResetCredit[][] | null = null
  accountEmails: Array<string | null> = ['test@example.com']
  beforeAuthorization: (() => Promise<void>) | null = null
  consumeError: Error | null = null
  outcome: ConsumeResetOutcome = 'nothingToReset'

  constructor(
    public freshCredits: ResetCredit[],
    private readonly consumeDelayMs = 0
  ) {}

  async readRedemptionSnapshot(profile: {
    codexHome: string
  }): Promise<RedemptionSnapshot> {
    const readIndex = this.reads
    this.reads += 1
    const credits =
      this.creditSnapshots?.[Math.min(readIndex, this.creditSnapshots.length - 1)] ??
      this.freshCredits
    const email =
      this.accountEmails[Math.min(readIndex, this.accountEmails.length - 1)] ?? null
    return snapshot(profile.codexHome, credits, email)
  }

  async consumeCredit(
    _profile: unknown,
    _executable: string,
    creditId: string,
    idempotencyKey: string,
    authorizeBeforeSend: () => void
  ): Promise<ConsumeResetOutcome> {
    await this.beforeAuthorization?.()
    authorizeBeforeSend()
    if (this.consumeError) throw this.consumeError
    if (this.consumeDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.consumeDelayMs))
    }
    this.consumes.push({ creditId, idempotencyKey })
    return this.outcome
  }
}

function snapshot(
  canonicalCodexHome: string,
  credits: ResetCredit[],
  email: string | null = 'test@example.com'
): RedemptionSnapshot {
  return {
    account: {
      account: { type: 'chatgpt', email, planType: 'pro' },
      requiresOpenaiAuth: true
    },
    rateLimits: {
      availableCount: credits.filter((candidate) => candidate.status === 'available').length,
      credits
    },
    canonicalCodexHome
  }
}

function createRunner(
  settings: SettingsStore,
  ledger: AutomationLedger,
  gateway: RecordingGateway,
  runtime: ProfileRuntimeState | ProfileRuntimeState[],
  lockDirectory: string
): AutomationRunner {
  return new AutomationRunner({
    settings,
    ledger,
    sessions: gateway,
    redemptionLock: new RedemptionLock(path.join(lockDirectory, 'redemption-locks')),
    getRuntimeStates: () => (Array.isArray(runtime) ? runtime : [runtime]),
    getResolvedExecutable: () => '/test/codex',
    onChange: () => undefined,
    onRefreshNeeded: () => Promise.resolve(),
    notify: () => undefined
  })
}

function testSettings(home: string): AppSettings {
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
        codexHome: home,
        enabled: true,
        autoRedeemEnabled: true,
        leadTimeMinutes: 30
      }
    ]
  }
}
