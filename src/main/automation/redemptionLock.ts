import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises'
import path from 'node:path'
import type { ResetCredit } from '../../shared/types'
import { redemptionLockKey } from './redemptionIdentity'

interface LockOwner {
  version: 1
  pid: number
  leaseId: string
  acquiredAt: number
  identityHash: string
}

export interface RedemptionLease {
  release(): Promise<void>
}

/**
 * An exclusive, cross-process critical section for one backend reset identity.
 * A dead process's file can be claimed atomically; live or malformed locks fail
 * closed. Backend retries remain safe because their idempotency UUID is stable.
 */
export class RedemptionLock {
  constructor(private readonly lockDirectory: string) {}

  async acquire(credit: ResetCredit): Promise<RedemptionLease | null> {
    const identityHash = redemptionLockKey(credit)
    const lockPath = path.join(this.lockDirectory, `${identityHash}.lock`)
    await mkdir(this.lockDirectory, { recursive: true, mode: 0o700 })

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const leaseId = randomUUID()
      const owner: LockOwner = {
        version: 1,
        pid: process.pid,
        leaseId,
        acquiredAt: Date.now(),
        identityHash
      }

      if (await createLockFile(lockPath, owner)) {
        return new FileRedemptionLease(lockPath, leaseId)
      }

      if (!(await recoverDeadOwner(lockPath, identityHash))) return null
    }
    return null
  }
}

async function createLockFile(lockPath: string, owner: LockOwner): Promise<boolean> {
  let handle
  try {
    handle = await open(lockPath, 'wx', 0o600)
  } catch (error) {
    if (hasErrorCode(error, 'EEXIST')) return false
    throw error
  }

  let writeError: unknown = null
  try {
    await handle.writeFile(`${JSON.stringify(owner)}\n`, 'utf8')
    await handle.sync()
  } catch (error) {
    writeError = error
  } finally {
    await handle.close()
  }
  if (writeError) {
    await unlink(lockPath).catch(() => undefined)
    throw writeError
  }
  return true
}

class FileRedemptionLease implements RedemptionLease {
  private released = false

  constructor(
    private readonly lockPath: string,
    private readonly leaseId: string
  ) {}

  async release(): Promise<void> {
    if (this.released) return
    const owner = await readOwner(this.lockPath)
    if (!owner) {
      this.released = true
      return
    }
    if (owner.leaseId !== this.leaseId || owner.pid !== process.pid) {
      throw new Error('Redemption lock ownership changed before release.')
    }
    await unlink(this.lockPath)
    this.released = true
  }
}

async function recoverDeadOwner(lockPath: string, identityHash: string): Promise<boolean> {
  const owner = await readOwner(lockPath)
  if (!owner || owner.identityHash !== identityHash || isProcessAlive(owner.pid)) return false

  const stalePath = `${lockPath}.stale-${randomUUID()}`
  try {
    await rename(lockPath, stalePath)
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return true
    return false
  }
  await unlink(stalePath)
  return true
}

async function readOwner(lockPath: string): Promise<LockOwner | null> {
  let value: unknown
  try {
    value = JSON.parse(await readFile(lockPath, 'utf8')) as unknown
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  if (
    input.version !== 1 ||
    !Number.isSafeInteger(input.pid) ||
    Number(input.pid) <= 0 ||
    typeof input.leaseId !== 'string' ||
    typeof input.acquiredAt !== 'number' ||
    typeof input.identityHash !== 'string'
  ) {
    return null
  }
  return input as unknown as LockOwner
}

function isProcessAlive(pid: number): boolean {
  if (pid === process.pid) return true
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return !hasErrorCode(error, 'ESRCH')
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === code
  )
}
