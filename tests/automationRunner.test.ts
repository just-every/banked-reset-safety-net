import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { AutomationLedger } from '../src/main/automation/automationLedger'
import {
  AutomationRunner,
  type AutomationSessionGateway
} from '../src/main/automation/automationRunner'
import { RedemptionLock } from '../src/main/automation/redemptionLock'
import { SettingsStore } from '../src/main/settings/settingsStore'
import {
  SETTINGS_VERSION,
  type AppSettings,
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
    expect(ledger.getRecord('profile-1', 'credit-1')?.status).toBe('unavailable')
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

    expect(gateway.reads).toBe(1)
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
})

class RecordingGateway implements AutomationSessionGateway {
  reads = 0
  readonly consumes: Array<{ creditId: string; idempotencyKey: string }> = []

  constructor(
    private readonly freshCredits: ResetCredit[],
    private readonly consumeDelayMs = 0
  ) {}

  async readResetCredits(): Promise<{ availableCount: number; credits: ResetCredit[] }> {
    this.reads += 1
    return { availableCount: this.freshCredits.length, credits: this.freshCredits }
  }

  async consumeCredit(
    _profile: unknown,
    _executable: string,
    creditId: string,
    idempotencyKey: string
  ): Promise<'nothingToReset'> {
    if (this.consumeDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.consumeDelayMs))
    }
    this.consumes.push({ creditId, idempotencyKey })
    return 'nothingToReset'
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
