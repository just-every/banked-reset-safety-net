import { EventEmitter } from 'node:events'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import spawn from 'cross-spawn'

const DEFAULT_REQUEST_TIMEOUT_MS = 20_000
const MAX_STDERR_CHARACTERS = 16_000

interface PendingRequest {
  resolve(value: unknown): void
  reject(error: Error): void
  timeout: NodeJS.Timeout
}

interface RpcResponse {
  id: number
  result?: unknown
  error?: {
    code?: number
    message?: string
    data?: unknown
  }
}

export class AppServerRpcError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
    readonly data: unknown
  ) {
    super(message)
    this.name = 'AppServerRpcError'
  }
}

export interface RpcConnection {
  start(): void
  isOpen(): boolean
  request(method: string, params?: unknown, timeoutMs?: number): Promise<unknown>
  notify(method: string): void
  close(): Promise<void>
}

export class JsonRpcProcess extends EventEmitter implements RpcConnection {
  private child: ChildProcessWithoutNullStreams | null = null
  private nextId = 1
  private stdoutBuffer = ''
  private stderrBuffer = ''
  private readonly pending = new Map<number, PendingRequest>()
  private closing = false

  constructor(
    private readonly executable: string,
    private readonly args: string[],
    private readonly environment: NodeJS.ProcessEnv
  ) {
    super()
  }

  start(): void {
    if (this.child) throw new Error('App-server process has already been started.')

    const child = spawn(this.executable, this.args, {
      env: this.environment,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    }) as ChildProcessWithoutNullStreams
    this.child = child

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => this.handleStdout(chunk))
    child.stderr.on('data', (chunk: string) => this.handleStderr(chunk))
    child.on('error', (error) => this.failAll(error))
    child.on('exit', (code, signal) => {
      const suffix = signal ? `signal ${signal}` : `code ${String(code)}`
      const stderr = lastStderrLine(this.stderrBuffer)
      const error = new Error(
        `Codex app-server exited with ${suffix}.${stderr ? ` ${stderr}` : ''}`
      )
      this.child = null
      if (!this.closing) this.failAll(error)
      this.emit('exit', { code, signal })
    })
  }

  isOpen(): boolean {
    return this.child !== null && this.child.exitCode === null && !this.closing
  }

  request(method: string, params?: unknown, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS): Promise<unknown> {
    const child = this.requireOpenChild()
    const id = this.nextId++

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Timed out waiting for ${method}.`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timeout })

      const message = params === undefined ? { method, id } : { method, id, params }
      child.stdin.write(`${JSON.stringify(message)}\n`, (error) => {
        if (!error) return
        const pending = this.pending.get(id)
        if (!pending) return
        clearTimeout(pending.timeout)
        this.pending.delete(id)
        pending.reject(error)
      })
    })
  }

  notify(method: string): void {
    this.requireOpenChild().stdin.write(`${JSON.stringify({ method })}\n`)
  }

  async close(): Promise<void> {
    const child = this.child
    if (!child) return
    this.closing = true
    child.stdin.end()

    await Promise.race([
      new Promise<void>((resolve) => child.once('exit', () => resolve())),
      new Promise<void>((resolve) => setTimeout(resolve, 1_000))
    ])

    if (this.child) child.kill()
    this.child = null
    this.failAll(new Error('Codex app-server connection closed.'))
  }

  getStderrTail(): string {
    return this.stderrBuffer.slice(-2_000)
  }

  private handleStdout(chunk: string): void {
    this.stdoutBuffer += chunk
    let newlineIndex = this.stdoutBuffer.indexOf('\n')

    while (newlineIndex !== -1) {
      const line = this.stdoutBuffer.slice(0, newlineIndex).trim()
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1)
      if (line) this.handleLine(line)
      newlineIndex = this.stdoutBuffer.indexOf('\n')
    }
  }

  private handleLine(line: string): void {
    let message: unknown
    try {
      message = JSON.parse(line) as unknown
    } catch (error) {
      this.failAll(new Error('Codex app-server emitted invalid JSON.', { cause: error }))
      this.child?.kill()
      return
    }

    if (!isRpcResponse(message)) {
      this.emit('message', message)
      return
    }
    const pending = this.pending.get(message.id)
    if (!pending) return

    clearTimeout(pending.timeout)
    this.pending.delete(message.id)
    if (message.error) {
      pending.reject(
        new AppServerRpcError(
          message.error.message ?? 'Codex app-server request failed.',
          typeof message.error.code === 'number' ? message.error.code : null,
          message.error.data
        )
      )
    } else {
      pending.resolve(message.result)
    }
  }

  private handleStderr(chunk: string): void {
    this.stderrBuffer = `${this.stderrBuffer}${chunk}`.slice(-MAX_STDERR_CHARACTERS)
  }

  private requireOpenChild(): ChildProcessWithoutNullStreams {
    if (!this.child || this.child.exitCode !== null || this.closing) {
      throw new Error('Codex app-server process is not running.')
    }
    return this.child
  }

  private failAll(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout)
      pending.reject(error)
    }
    this.pending.clear()
  }
}

function isRpcResponse(value: unknown): value is RpcResponse {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  return typeof (value as Record<string, unknown>).id === 'number'
}

function lastStderrLine(stderr: string): string {
  const lines = stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  return (lines.at(-1) ?? '').slice(-400)
}
