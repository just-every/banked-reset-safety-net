import type {
  ExpiryWarningViewState,
  ProfileRuntimeState,
  ProfileSettings
} from '../../shared/types'
import {
  ExpiryWarningRunner,
  type ExpiryWarningDeliveryRequest,
  type ExpiryWarningDeliveryResult,
  type ExpiryWarningIntervalScheduler
} from './expiryWarningRunner'
import type { ExpiryWarningStore } from './expiryWarningStore'

interface ExpiryWarningCoordinatorOptions {
  store: ExpiryWarningStore
  getProfiles: () => ProfileSettings[]
  getRuntimeStates: () => ProfileRuntimeState[]
  isEnabled: () => boolean
  isSupported: () => boolean
  deliver: (
    request: ExpiryWarningDeliveryRequest
  ) => ExpiryWarningDeliveryResult | Promise<ExpiryWarningDeliveryResult>
  onChange: () => void
  now?: () => number
  scheduler?: ExpiryWarningIntervalScheduler
}

const ACTIVE_MESSAGE =
  'Expiry warnings are on: 24 hours before expiry and again at the safety cutoff while this app is running.'
const DISABLED_MESSAGE = 'Expiry warnings are off.'
const UNSUPPORTED_MESSAGE =
  'Desktop expiry warnings are unavailable on this system. Keep the app open to review expiry times.'

export class ExpiryWarningCoordinator {
  private runner: ExpiryWarningRunner | null = null
  private supported = false
  private storageReady = false
  private initialized = false
  private started = false
  private state: ExpiryWarningViewState = {
    status: 'error',
    message: 'Expiry warnings have not initialized.'
  }

  constructor(private readonly options: ExpiryWarningCoordinatorOptions) {}

  async initialize(): Promise<void> {
    if (this.initialized) return
    this.initialized = true

    try {
      await this.options.store.initialize(this.options.now?.() ?? Date.now())
    } catch (error) {
      this.setError('Expiry warning storage could not be opened', error)
      return
    }
    this.storageReady = true

    this.runner = new ExpiryWarningRunner({
      store: this.options.store,
      getProfiles: this.options.getProfiles,
      getRuntimeStates: this.options.getRuntimeStates,
      isEnabled: () => this.options.isEnabled() && this.supported,
      deliver: this.options.deliver,
      onDeliveryResult: (_request, result) => this.handleDeliveryResult(result),
      onError: (error) => this.setError('Expiry warning evaluation failed', error),
      now: this.options.now,
      scheduler: this.options.scheduler
    })
    this.refreshAvailability()
  }

  start(): void {
    this.started = true
    this.runner?.start()
  }

  settingsChanged(): void {
    this.refreshAvailability()
    this.evaluate()
  }

  resumed(): void {
    this.refreshAvailability()
    this.evaluate()
  }

  profilesRefreshed(): void {
    if (this.started) this.evaluate()
  }

  getState(): ExpiryWarningViewState {
    return structuredClone(this.state)
  }

  async shutdown(): Promise<void> {
    await this.runner?.shutdown()
  }

  private evaluate(): void {
    void this.runner?.tick().catch((error) => {
      this.setError('Expiry warning evaluation failed', error)
    })
  }

  private refreshAvailability(): void {
    if (!this.storageReady) return
    if (!this.options.isEnabled()) {
      this.supported = false
      this.setState({ status: 'disabled', message: DISABLED_MESSAGE })
      return
    }

    try {
      this.supported = this.options.isSupported()
    } catch (error) {
      this.supported = false
      this.setError('Desktop notification support could not be checked', error)
      return
    }

    this.setState(
      this.supported
        ? { status: 'active', message: ACTIVE_MESSAGE }
        : { status: 'unsupported', message: UNSUPPORTED_MESSAGE }
    )
  }

  private handleDeliveryResult(result: ExpiryWarningDeliveryResult): void {
    if (!this.options.isEnabled()) {
      this.setState({ status: 'disabled', message: DISABLED_MESSAGE })
      return
    }
    if (result.status === 'delivered') {
      this.setState({ status: 'active', message: ACTIVE_MESSAGE })
    } else if (result.status === 'unsupported') {
      this.supported = false
      this.setState({ status: 'unsupported', message: UNSUPPORTED_MESSAGE })
    } else {
      this.setError('Desktop expiry warning delivery failed', result.error)
    }
  }

  private setError(context: string, error: unknown): void {
    this.setState({
      status: 'error',
      message: `${context}: ${errorMessage(error)}. Automatic and manual redemption guards are unaffected.`
    })
  }

  private setState(state: ExpiryWarningViewState): void {
    if (this.state.status === state.status && this.state.message === state.message) return
    this.state = state
    this.options.onChange()
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
