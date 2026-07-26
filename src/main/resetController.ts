import type {
  AddProfileInput,
  AppViewState,
  ManualUseResult,
  ManualUseReview,
  ManualUseTypedChallenge,
  UpdateAppSettingsInput,
  UpdateProfileInput
} from '../shared/types'
import { AutomationLedger } from './automation/automationLedger'
import { RedemptionLock } from './automation/redemptionLock'
import {
  AutomationRunner,
  type AutomationNotification
} from './automation/automationRunner'
import { CodexSessionManager } from './codex/sessionManager'
import { bankedResetHistory, combineResetHistory } from './history/bankedResetHistory'
import { ResetHistoryStore } from './history/resetHistoryStore'
import { ExpiryWarningCoordinator } from './notifications/expiryWarningCoordinator'
import type {
  ExpiryWarningDeliveryRequest,
  ExpiryWarningDeliveryResult
} from './notifications/expiryWarningRunner'
import { ExpiryWarningStore } from './notifications/expiryWarningStore'
import { ProfilePoller } from './resets/profilePoller'
import { ManualRedemptionService } from './manual/manualRedemptionService'
import { SettingsStore } from './settings/settingsStore'

const REFRESH_INTERVAL_MS = 5 * 60 * 1_000
const AUTOMATION_TICK_MS = 15 * 1_000

interface ResetControllerOptions {
  settings: SettingsStore
  ledger: AutomationLedger
  resetHistory: ResetHistoryStore
  redemptionLock: RedemptionLock
  notify: (notification: AutomationNotification) => void
  expiryWarningStore: ExpiryWarningStore
  deliverExpiryWarning: (
    request: ExpiryWarningDeliveryRequest
  ) => ExpiryWarningDeliveryResult | Promise<ExpiryWarningDeliveryResult>
  notificationsSupported: () => boolean
  setLaunchAtLogin: (enabled: boolean) => void | Promise<void>
}

export class ResetController {
  private readonly sessions = new CodexSessionManager()
  private readonly poller: ProfilePoller
  private readonly automation: AutomationRunner
  private readonly manualRedemption: ManualRedemptionService
  private readonly expiryWarnings: ExpiryWarningCoordinator
  private readonly listeners = new Set<(state: AppViewState) => void>()
  private refreshTimer: NodeJS.Timeout | null = null
  private automationTimer: NodeJS.Timeout | null = null
  private initialized = false

  constructor(private readonly options: ResetControllerOptions) {
    this.poller = new ProfilePoller(this.sessions, () => this.emit())
    this.automation = new AutomationRunner({
      settings: options.settings,
      ledger: options.ledger,
      sessions: this.sessions,
      redemptionLock: options.redemptionLock,
      getRuntimeStates: () => this.poller.getStates(this.options.settings.get()),
      getResolvedExecutable: () => this.poller.getResolvedExecutable(),
      onChange: () => this.emit(),
      onRefreshNeeded: () => this.refresh(),
      notify: options.notify
    })
    this.manualRedemption = new ManualRedemptionService({
      settings: options.settings,
      sessions: this.sessions,
      executor: this.automation,
      getResolvedExecutable: () => this.poller.getResolvedExecutable()
    })
    this.expiryWarnings = new ExpiryWarningCoordinator({
      store: options.expiryWarningStore,
      getProfiles: () => this.options.settings.get().profiles,
      getRuntimeStates: () =>
        this.poller.getStates(this.options.settings.get()),
      isEnabled: () => this.options.settings.get().expiryWarningsEnabled,
      isSupported: options.notificationsSupported,
      deliver: options.deliverExpiryWarning,
      onChange: () => this.emit()
    })
  }

  async initialize(): Promise<void> {
    await Promise.all([
      this.options.settings.initialize(),
      this.options.ledger.initialize(),
      this.options.resetHistory.initialize()
    ])
    this.initialized = true
    const settings = this.options.settings.get()
    await this.options.setLaunchAtLogin(settings.launchAtLogin)
    await this.expiryWarnings.initialize()
    await this.refresh()
    await this.automation.tick()

    this.refreshTimer = setInterval(
      () => void this.refresh().catch((error) => console.error(error)),
      REFRESH_INTERVAL_MS
    )
    this.automationTimer = setInterval(
      () => void this.automation.tick().catch((error) => console.error(error)),
      AUTOMATION_TICK_MS
    )
  }

  getState(): AppViewState {
    if (!this.initialized) throw new Error('ResetController has not been initialized.')
    const settings = this.options.settings.get()
    return {
      settings,
      expiryWarnings: this.expiryWarnings.getState(),
      profiles: this.poller.getStates(settings),
      events: this.options.ledger.getEvents(),
      resetHistory: combineResetHistory(
        this.options.resetHistory.getEvents(),
        this.options.ledger.getRecords()
      ),
      resolvedCodexExecutable: this.poller.getResolvedExecutable(),
      updatedAt: Date.now()
    }
  }

  subscribe(listener: (state: AppViewState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async refresh(): Promise<void> {
    await this.refreshProfiles(true)
  }

  startAdvisories(): void {
    if (!this.initialized) throw new Error('ResetController has not been initialized.')
    this.expiryWarnings.start()
  }

  private async refreshProfiles(evaluateExpiryWarnings: boolean): Promise<void> {
    await this.poller.refreshAll(this.options.settings.get())
    const records = this.options.ledger.getRecords()
    await this.options.resetHistory.observeProfiles(
      this.poller.getStates(this.options.settings.get()),
      bankedResetHistory(records)
    )
    if (evaluateExpiryWarnings) this.expiryWarnings.profilesRefreshed()
    this.emit()
  }

  async addProfile(input: AddProfileInput): Promise<void> {
    await this.options.settings.addProfile(input)
    this.emit()
    await this.refresh()
  }

  async discoverCodexHomes(): Promise<number> {
    const added = await this.options.settings.discoverProfiles()
    if (added > 0) {
      this.emit()
      await this.refresh()
    }
    return added
  }

  async updateProfile(profileId: string, input: UpdateProfileInput): Promise<void> {
    const before = this.options.settings
      .get()
      .profiles.find((profile) => profile.id === profileId)
    const settings = await this.options.settings.updateProfile(profileId, input)
    const after = settings.profiles.find((profile) => profile.id === profileId)

    if (before && after && before.autoRedeemEnabled !== after.autoRedeemEnabled) {
      await this.options.ledger.addEvent(
        profileId,
        null,
        'info',
        after.autoRedeemEnabled
          ? `${after.name}: automatic reset use enabled ${after.leadTimeMinutes} minutes before expiry.`
          : `${after.name}: automatic reset use disabled.`
      )
    }

    this.emit()
    await this.refresh()
    await this.automation.tick()
  }

  async removeProfile(profileId: string): Promise<void> {
    await this.options.settings.removeProfile(profileId)
    this.emit()
    await this.refresh()
  }

  prepareManualUse(profileId: string, creditId: string): Promise<ManualUseReview> {
    return this.manualRedemption.prepare(profileId, creditId)
  }

  acknowledgeManualUse(challengeId: string): ManualUseTypedChallenge {
    return this.manualRedemption.acknowledge(challengeId)
  }

  confirmManualUse(
    challengeId: string,
    exactResponse: string
  ): Promise<ManualUseResult> {
    return this.manualRedemption.confirm(challengeId, exactResponse)
  }

  cancelManualUse(challengeId: string): void {
    this.manualRedemption.cancel(challengeId)
  }

  async updateAppSettings(input: UpdateAppSettingsInput): Promise<void> {
    const before = this.options.settings.get()
    const launchChanged =
      input.launchAtLogin !== undefined && input.launchAtLogin !== before.launchAtLogin
    if (launchChanged) await this.options.setLaunchAtLogin(input.launchAtLogin as boolean)

    try {
      await this.options.settings.updateAppSettings(input)
    } catch (error) {
      if (launchChanged) {
        try {
          await this.options.setLaunchAtLogin(before.launchAtLogin)
        } catch (rollbackError) {
          console.error('Could not roll back launch-at-login after settings failure.', rollbackError)
        }
      }
      throw error
    }

    if (input.expiryWarningsEnabled !== undefined) this.expiryWarnings.settingsChanged()
    this.emit()
    if (input.codexExecutable !== undefined) await this.refresh()
  }

  async resume(): Promise<void> {
    await this.refreshProfiles(false)
    this.expiryWarnings.resumed()
    await this.automation.tick()
  }

  async shutdown(): Promise<void> {
    if (this.refreshTimer) clearInterval(this.refreshTimer)
    if (this.automationTimer) clearInterval(this.automationTimer)
    this.refreshTimer = null
    this.automationTimer = null
    await Promise.all([this.automation.shutdown(), this.expiryWarnings.shutdown()])
    await this.sessions.closeAll()
  }

  private emit(): void {
    if (!this.initialized) return
    const state = this.getState()
    for (const listener of this.listeners) listener(state)
  }
}
