import { randomBytes, randomUUID } from 'node:crypto'
import type {
  ManualUseResult,
  ManualUseReview,
  ManualUseTypedChallenge,
  ProfileSettings,
  ResetCredit
} from '../../shared/types'
import {
  requireDisplayableRedemptionAccount,
  type RedemptionAccountBinding
} from '../automation/accountBinding'
import type {
  VerifiedManualRedemptionAuthorization
} from '../automation/automationRunner'
import { earliestAvailableCreditFromCredits } from '../automation/decision'
import type { RedemptionSnapshot } from '../codex/codexSession'
import type { SettingsStore } from '../settings/settingsStore'

const REVIEW_TTL_MS = 2 * 60 * 1_000
const CONFIRMATION_TTL_MS = 60 * 1_000
const MAX_ACTIVE_CHALLENGES = 100

interface ManualRedemptionSnapshotGateway {
  readRedemptionSnapshot(
    profile: ProfileSettings,
    executable: string
  ): Promise<RedemptionSnapshot>
}

interface ManualRedemptionExecutor {
  executeManual(
    authorization: VerifiedManualRedemptionAuthorization
  ): Promise<ManualUseResult>
}

interface ManualRedemptionServiceOptions {
  settings: SettingsStore
  sessions: ManualRedemptionSnapshotGateway
  executor: ManualRedemptionExecutor
  getResolvedExecutable: () => string | null
}

interface ReviewChallenge {
  stage: 'review'
  challengeId: string
  profile: ProfileSettings
  credit: ResetCredit
  accountEmail: string
  accountBinding: RedemptionAccountBinding
  settingsRevision: number
  reviewExpiresAt: number
}

interface AcknowledgedChallenge extends Omit<ReviewChallenge, 'stage'> {
  stage: 'acknowledged'
  confirmationPrompt: string
  confirmationExpiresAt: number
}

interface ConsumingChallenge extends Omit<AcknowledgedChallenge, 'stage'> {
  stage: 'consuming'
}

type ManualChallenge = ReviewChallenge | AcknowledgedChallenge | ConsumingChallenge

export class ManualRedemptionService {
  private readonly challenges = new Map<string, ManualChallenge>()

  constructor(private readonly options: ManualRedemptionServiceOptions) {}

  async prepare(profileId: string, creditId: string): Promise<ManualUseReview> {
    this.pruneExpired()
    this.requireAvailableChallengeSlot()

    const profile = this.requireEnabledProfile(profileId)
    const settingsRevision = this.options.settings.getRevision()
    const executable = this.options.getResolvedExecutable()
    if (!executable) throw new Error('Codex CLI is not available.')

    const snapshot = await this.options.sessions.readRedemptionSnapshot(profile, executable)
    this.requireUnchangedProfile(profile, settingsRevision)
    const account = requireDisplayableRedemptionAccount(snapshot)
    const earliest = earliestAvailableCreditFromCredits(
      snapshot.rateLimits.credits ?? [],
      Date.now()
    )
    if (!earliest || earliest.id !== creditId || earliest.expiresAt === null) {
      throw new Error('Only the current earliest available exact reset can be used manually.')
    }

    const challengeId = randomUUID()
    const reviewExpiresAt = Date.now() + REVIEW_TTL_MS
    const challenge: ReviewChallenge = {
      stage: 'review',
      challengeId,
      profile,
      credit: structuredClone(earliest),
      accountEmail: account.email,
      accountBinding: {
        accountFingerprint: account.accountFingerprint,
        canonicalCodexHome: account.canonicalCodexHome
      },
      settingsRevision,
      reviewExpiresAt
    }
    // Every concurrent prepare pauses for the snapshot above. Re-check in the
    // same synchronous turn as insertion so the in-memory bound remains hard.
    this.requireAvailableChallengeSlot()
    this.challenges.set(challengeId, challenge)
    return reviewForChallenge(challenge)
  }

  acknowledge(challengeId: string): ManualUseTypedChallenge {
    this.pruneExpired()
    const challenge = this.requireChallenge(challengeId)
    if (challenge.stage !== 'review') {
      throw new Error('This manual reset review cannot be acknowledged again.')
    }
    this.requireUnchangedProfile(challenge.profile, challenge.settingsRevision)
    const confirmationPrompt = `USE RESET ${confirmationCode()}`
    const confirmationExpiresAt = Math.min(
      challenge.reviewExpiresAt,
      Date.now() + CONFIRMATION_TTL_MS
    )
    const acknowledged: AcknowledgedChallenge = {
      ...challenge,
      stage: 'acknowledged',
      confirmationPrompt,
      confirmationExpiresAt
    }
    this.challenges.set(challengeId, acknowledged)
    return {
      challengeId,
      confirmationPrompt,
      confirmationExpiresAt
    }
  }

  async confirm(challengeId: string, exactResponse: string): Promise<ManualUseResult> {
    this.pruneExpired()
    const challenge = this.requireChallenge(challengeId)
    if (challenge.stage !== 'acknowledged') {
      throw new Error('Both manual reset confirmations are required.')
    }
    if (exactResponse !== challenge.confirmationPrompt) {
      throw new Error('The manual reset confirmation phrase does not match exactly.')
    }
    this.requireUnchangedProfile(challenge.profile, challenge.settingsRevision)

    this.challenges.set(challengeId, { ...challenge, stage: 'consuming' })
    try {
      return await this.options.executor.executeManual({
        profileId: challenge.profile.id,
        settingsRevision: challenge.settingsRevision,
        codexHome: challenge.profile.codexHome,
        credit: structuredClone(challenge.credit),
        accountBinding: structuredClone(challenge.accountBinding)
      })
    } finally {
      this.challenges.delete(challengeId)
    }
  }

  cancel(challengeId: string): void {
    this.pruneExpired()
    const challenge = this.challenges.get(challengeId)
    if (!challenge) return
    if (challenge.stage === 'consuming') {
      throw new Error('The manual reset request has already started.')
    }
    this.challenges.delete(challengeId)
  }

  private requireEnabledProfile(profileId: string): ProfileSettings {
    const profile = this.options.settings
      .get()
      .profiles.find((candidate) => candidate.id === profileId)
    if (!profile || !profile.enabled) {
      throw new Error('The selected Codex home is not currently tracked.')
    }
    return profile
  }

  private requireUnchangedProfile(
    expected: ProfileSettings,
    settingsRevision: number
  ): ProfileSettings {
    if (this.options.settings.getRevision() !== settingsRevision) {
      throw new Error('Settings changed while the manual reset was being confirmed.')
    }
    const current = this.requireEnabledProfile(expected.id)
    if (current.codexHome !== expected.codexHome) {
      throw new Error('Codex home changed while the manual reset was being confirmed.')
    }
    return current
  }

  private requireChallenge(challengeId: string): ManualChallenge {
    const challenge = this.challenges.get(challengeId)
    if (!challenge) throw new Error('The manual reset confirmation expired or does not exist.')
    return challenge
  }

  private requireAvailableChallengeSlot(): void {
    if (this.challenges.size >= MAX_ACTIVE_CHALLENGES) {
      throw new Error('Too many manual reset confirmations are already open.')
    }
  }

  private pruneExpired(now = Date.now()): void {
    for (const [challengeId, challenge] of this.challenges) {
      const expiresAt =
        challenge.stage === 'review'
          ? challenge.reviewExpiresAt
          : challenge.confirmationExpiresAt
      if (challenge.stage !== 'consuming' && expiresAt <= now) {
        this.challenges.delete(challengeId)
      }
    }
  }
}

function reviewForChallenge(challenge: ReviewChallenge): ManualUseReview {
  return {
    challengeId: challenge.challengeId,
    profile: {
      id: challenge.profile.id,
      name: challenge.profile.name,
      codexHome: challenge.accountBinding.canonicalCodexHome
    },
    account: {
      type: 'chatgpt',
      email: challenge.accountEmail
    },
    credit: {
      id: challenge.credit.id,
      resetType: 'codexRateLimits',
      title: challenge.credit.title,
      expiresAt: challenge.credit.expiresAt as number
    },
    reviewExpiresAt: challenge.reviewExpiresAt
  }
}

function confirmationCode(): string {
  return randomBytes(4).toString('hex').toLocaleUpperCase('en-US')
}
