import type { AppSettings, ProfileRuntimeState, ProfileSettings } from '../../shared/types'
import { resolveCodexExecutable } from '../codex/executableResolver'
import { CodexSessionManager } from '../codex/sessionManager'

export class ProfilePoller {
  private readonly states = new Map<string, ProfileRuntimeState>()
  private generation = 0
  private resolvedExecutable: string | null = null

  constructor(
    private readonly sessions: CodexSessionManager,
    private readonly onChange: () => void
  ) {}

  getStates(settings: AppSettings): ProfileRuntimeState[] {
    return settings.profiles.map(
      (profile) => this.states.get(profile.id) ?? emptyProfileState(profile.id)
    )
  }

  getResolvedExecutable(): string | null {
    return this.resolvedExecutable
  }

  async refreshAll(settings: AppSettings): Promise<void> {
    const generation = ++this.generation
    const enabledProfiles = settings.profiles.filter((profile) => profile.enabled)

    for (const profile of settings.profiles) {
      this.states.set(
        profile.id,
        profile.enabled
          ? { ...emptyProfileState(profile.id), status: 'loading' }
          : emptyProfileState(profile.id)
      )
    }
    this.onChange()

    let executable: string
    try {
      executable = await resolveCodexExecutable(settings.codexExecutable)
    } catch (error) {
      if (generation !== this.generation) return
      this.resolvedExecutable = null
      const message = errorMessage(error)
      for (const profile of enabledProfiles) {
        this.states.set(profile.id, errorProfileState(profile.id, message))
      }
      this.onChange()
      return
    }

    if (generation !== this.generation) return
    this.resolvedExecutable = executable
    await this.sessions.reconcile(enabledProfiles, executable)
    if (generation !== this.generation) return

    await Promise.all(
      enabledProfiles.map((profile) => this.refreshProfile(profile, executable, generation))
    )
    if (generation === this.generation) this.onChange()
  }

  private async refreshProfile(
    profile: ProfileSettings,
    executable: string,
    generation: number
  ): Promise<void> {
    try {
      const result = await this.sessions.readRateLimits(profile, executable)
      if (generation !== this.generation) return
      if (result.credits === null && result.availableCount > 0) {
        throw new Error(
          'Codex reported reset credits without expiry details. Update the Codex CLI and refresh.'
        )
      }

      this.states.set(profile.id, {
        profileId: profile.id,
        status: 'ready',
        usageLimits: result.usageLimits,
        availableCount: result.availableCount,
        credits: [...(result.credits ?? [])].sort(
          (left, right) =>
            (left.expiresAt ?? Number.POSITIVE_INFINITY) -
            (right.expiresAt ?? Number.POSITIVE_INFINITY)
        ),
        refreshedAt: Date.now(),
        error: null
      })
    } catch (error) {
      if (generation !== this.generation) return
      this.states.set(profile.id, errorProfileState(profile.id, errorMessage(error)))
    }
  }
}

function emptyProfileState(profileId: string): ProfileRuntimeState {
  return {
    profileId,
    status: 'idle',
    usageLimits: [],
    availableCount: 0,
    credits: [],
    refreshedAt: null,
    error: null
  }
}

function errorProfileState(profileId: string, message: string): ProfileRuntimeState {
  return {
    ...emptyProfileState(profileId),
    status: 'error',
    error: message
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
