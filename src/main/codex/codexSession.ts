import { realpath } from 'node:fs/promises'
import type { ConsumeResetOutcome } from '../../shared/types'
import { comparablePath } from '../paths'
import { JsonRpcProcess, type RpcConnection } from './jsonRpcProcess'
import {
  parseConsumeOutcome,
  parseInitializeResult,
  parseRateLimitsReadResult,
  type RateLimitsReadResult
} from './protocol'

const CLIENT_VERSION = '0.2.0'

export class CodexSession {
  private readonly rpc: RpcConnection
  private startPromise: Promise<void> | null = null
  private started = false
  private closed = false

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

  async consumeCredit(creditId: string, idempotencyKey: string): Promise<ConsumeResetOutcome> {
    if (!creditId) throw new Error('A specific reset credit id is required.')
    if (!idempotencyKey) throw new Error('An idempotency key is required.')
    await this.start()
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
      await assertSameHome(this.codexHome, result.codexHome)
      this.rpc.notify('initialized')
      this.started = true
    } catch (error) {
      this.closed = true
      await this.rpc.close()
      throw error
    }
  }
}

async function assertSameHome(configuredHome: string, reportedHome: string): Promise<void> {
  const [configured, reported] = await Promise.all([realpath(configuredHome), realpath(reportedHome)])
  if (comparablePath(configured) !== comparablePath(reported)) {
    throw new Error(
      `Codex app-server used a different home. Expected ${configuredHome}, received ${reportedHome}.`
    )
  }
}
