import type {
  ConsumeResetOutcome,
  ProfileRuntimeState,
  ProfileSettings,
  ResetCredit
} from '../../shared/types'
import type { RedemptionSnapshot } from '../codex/codexSession'
import type { SettingsStore } from '../settings/settingsStore'
import type { RedemptionAccountBinding } from './accountBinding'
import type { AutomationLedger } from './automationLedger'
import type { RedemptionLock } from './redemptionLock'

export interface AutomationNotification {
  title: string
  body: string
}

export interface AutomationSessionGateway {
  readRedemptionSnapshot(
    profile: ProfileSettings,
    executable: string
  ): Promise<RedemptionSnapshot>
  consumeCredit(
    profile: ProfileSettings,
    executable: string,
    creditId: string,
    idempotencyKey: string,
    authorizeBeforeSend: () => void
  ): Promise<ConsumeResetOutcome>
}

export interface AutomationRunnerOptions {
  settings: SettingsStore
  ledger: AutomationLedger
  sessions: AutomationSessionGateway
  redemptionLock: RedemptionLock
  getRuntimeStates: () => ProfileRuntimeState[]
  getResolvedExecutable: () => string | null
  onChange: () => void
  onRefreshNeeded: () => Promise<void>
  notify: (notification: AutomationNotification) => void
}

export interface VerifiedManualRedemptionAuthorization {
  profileId: string
  settingsRevision: number
  codexHome: string
  credit: ResetCredit
  accountBinding: RedemptionAccountBinding
}
