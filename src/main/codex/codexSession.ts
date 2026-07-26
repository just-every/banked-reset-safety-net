import { realpath } from 'node:fs/promises'
import type { ConsumeResetOutcome } from '../../shared/types'
import { comparablePath } from '../paths'
import { JsonRpcProcess, type RpcConnection } from './jsonRpcProcess'
import {
  parseAccountReadResult,
  parseConsumeOutcome,
  parseInitializeResult,
  parseRateLimitsReadResult,
  type AccountReadResult,
  type RateLimitsReadResult
} from './protocol'

const CLIENT_VERSION = '0.2.0'

export interface RedemptionSnapshot {
  account: AccountReadResult
  rateLimits: Pick<RateLimitsReadResult, 'availableCount' | 'credits'>
  canonicalCodexHome: string
}

export class CodexSession {
  private readonly rpc: RpcConnection
  private startPromise: Promise<void> | null = null
  private started = false
  private closed = false
  private canonicalCodexHome: string | null = null

  constructor(
    readonly executable: string,
    readonly codexHome: string,
    rpc?: RpcConnection
  ) {
    this.rpc =
      rpc ??
      new JsonRpcProcess(executable, ['app-server', '--stdio'], {
        ...process.env,
        CODEX_HOME: codexHome
      })
  }

  async start(): Promise<void> {
    if (this.started) return
    if (this.closed) throw new Error('Codex session is closed.')
    if (!this.startPromise) this.startPromise = this.initialize()
    return this.startPromise
  }

  isOpen(): boolean {
    return this.started && this.rpc.isOpen()
  }

  isReusable(): boolean {
    return !this.closed && (!this.started || this.rpc.isOpen())
  }

  async readRateLimits(): Promise<RateLimitsReadResult> {
    await this.start()
    return parseRateLimitsReadResult(await this.rpc.request('account/rateLimits/read'))
  }

  async readAccount(): Promise<AccountReadResult> {
    await this.start()
    return parseAccountReadResult(
      await this.rpc.request('account/read', { refreshToken: false })
    )
  }

  async readRedemptionSnapshot(): Promise<RedemptionSnapshot> {
    await this.start()
    await this.requireCurrentCanonicalHome()
    const [account, rateLimits] = await Promise.all([
      this.rpc.request('account/read', { refreshToken: false }).then(parseAccountReadResult),
      this.rpc.request('account/rateLimits/read').then(parseRateLimitsReadResult)
    ])
    const canonicalCodexHome = await this.requireCurrentCanonicalHome()
    return {
      account,
      rateLimits: {
        availableCount: rateLimits.availableCount,
        credits: rateLimits.credits
      },
      canonicalCodexHome
    }
  }

  async consumeCredit(
    creditId: string,
    idempotencyKey: string,
    authorizeBeforeSend: () => void
  ): Promise<ConsumeResetOutcome> {
    if (!creditId) throw new Error('A specific reset credit id is required.')
    if (!idempotencyKey) throw new Error('An idempotency key is required.')
    if (typeof authorizeBeforeSend !== 'function') {
      throw new Error('A final synchronous redemption authorization check is required.')
    }
    await this.start()
    await this.requireCurrentCanonicalHome()
    authorizeBeforeSend()
    return parseConsumeOutcome(
      await this.rpc.request('account/rateLimitResetCredit/consume', {
        idempotencyKey,
        creditId
      })
    )
  }

  close(): Promise<void> {
    this.closed = true
    return this.rpc.close()
  }

  private async initialize(): Promise<void> {
    this.rpc.start()
    try {
      const result = parseInitializeResult(
        await this.rpc.request('initialize', {
          clientInfo: {
            name: 'banked_reset_net',
            title: 'Banked Reset Safety Net',
            version: CLIENT_VERSION
          },
          capabilities: {
            experimentalApi: true,
            requestAttestation: false,
            optOutNotificationMethods: [
              'thread/started',
              'thread/status/changed',
              'item/agentMessage/delta'
            ]
          }
        })
      )
      this.canonicalCodexHome = await assertSameHome(this.codexHome, result.codexHome)
      this.rpc.notify('initialized')
      this.started = true
    } catch (error) {
      this.closed = true
      await this.rpc.close()
      throw error
    }
  }

  private async requireCurrentCanonicalHome(): Promise<string> {
    if (this.canonicalCodexHome === null) {
      throw new Error('Codex home was not confirmed before redemption.')
    }
    const current = await realpath(this.codexHome)
    if (comparablePath(current) !== comparablePath(this.canonicalCodexHome)) {
      throw new Error('Codex home canonical target changed before redemption.')
    }
    return current
  }
}

async function assertSameHome(configuredHome: string, reportedHome: string): Promise<string> {
  const [configured, reported] = await Promise.all([realpath(configuredHome), realpath(reportedHome)])
  if (comparablePath(configured) !== comparablePath(reported)) {
    throw new Error(
      `Codex app-server used a different home. Expected ${configuredHome}, received ${reportedHome}.`
    )
  }
  return configured
}
