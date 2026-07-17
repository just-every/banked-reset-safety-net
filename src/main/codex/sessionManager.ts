import type { ConsumeResetOutcome, ProfileSettings } from '../../shared/types'
import { comparablePath } from '../paths'
import { CodexSession } from './codexSession'
import type { RateLimitResetCredits } from './protocol'

interface ManagedSession {
  key: string
  session: CodexSession
}

export class CodexSessionManager {
  private readonly sessions = new Map<string, ManagedSession>()

  async readResetCredits(
    profile: ProfileSettings,
    executable: string
  ): Promise<RateLimitResetCredits> {
    return this.withSession(profile, executable, (session) => session.readResetCredits())
  }

  async consumeCredit(
    profile: ProfileSettings,
    executable: string,
    creditId: string,
    idempotencyKey: string
  ): Promise<ConsumeResetOutcome> {
    return this.withSession(profile, executable, (session) =>
      session.consumeCredit(creditId, idempotencyKey)
    )
  }

  async reconcile(activeProfiles: ProfileSettings[], executable: string): Promise<void> {
    const activeIds = new Set(activeProfiles.map((profile) => profile.id))
    const closes: Promise<void>[] = []

    for (const [profileId, managed] of this.sessions) {
      const profile = activeProfiles.find((candidate) => candidate.id === profileId)
      const expectedKey = profile ? sessionKey(profile, executable) : null
      if (!activeIds.has(profileId) || managed.key !== expectedKey) {
        this.sessions.delete(profileId)
        closes.push(managed.session.close())
      }
    }
    await Promise.allSettled(closes)
  }

  async closeAll(): Promise<void> {
    const sessions = [...this.sessions.values()].map(({ session }) => session.close())
    this.sessions.clear()
    await Promise.allSettled(sessions)
  }

  private async withSession<T>(
    profile: ProfileSettings,
    executable: string,
    operation: (session: CodexSession) => Promise<T>
  ): Promise<T> {
    const session = this.getOrCreate(profile, executable)
    try {
      return await operation(session)
    } catch (error) {
      if (!session.isOpen()) this.sessions.delete(profile.id)
      throw error
    }
  }

  private getOrCreate(profile: ProfileSettings, executable: string): CodexSession {
    const key = sessionKey(profile, executable)
    const existing = this.sessions.get(profile.id)
    if (existing?.key === key && existing.session.isReusable()) return existing.session
    if (existing) void existing.session.close()

    const session = new CodexSession(executable, profile.codexHome)
    this.sessions.set(profile.id, { key, session })
    return session
  }
}

function sessionKey(profile: ProfileSettings, executable: string): string {
  return `${comparablePath(executable)}:${comparablePath(profile.codexHome)}`
}
