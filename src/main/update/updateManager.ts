import type { AppUpdater, ProgressInfo, UpdateDownloadedEvent, UpdateInfo } from 'electron-updater'
import { APP_NAME } from '../../shared/branding'
import type { UpdateViewState } from '../../shared/types'

const INITIAL_CHECK_DELAY_MS = 10_000
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1_000

type UpdateEventMap = {
  error: (error: Error) => void
  'checking-for-update': () => void
  'update-not-available': (info: UpdateInfo) => void
  'update-available': (info: UpdateInfo) => void
  'download-progress': (info: ProgressInfo) => void
  'update-downloaded': (event: UpdateDownloadedEvent) => void
}

export interface UpdateAdapter {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  allowPrerelease: boolean
  allowDowngrade: boolean
  on<Event extends keyof UpdateEventMap>(event: Event, listener: UpdateEventMap[Event]): unknown
  off<Event extends keyof UpdateEventMap>(event: Event, listener: UpdateEventMap[Event]): unknown
  checkForUpdates(): Promise<unknown>
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void
}

interface UpdateManagerOptions {
  updater: UpdateAdapter | null
  currentVersion: string
  notifyReady: (version: string) => void
  setTimeout?: typeof global.setTimeout
  clearTimeout?: typeof global.clearTimeout
  setInterval?: typeof global.setInterval
  clearInterval?: typeof global.clearInterval
}

export class UpdateManager {
  private state: UpdateViewState
  private readonly listeners = new Set<(state: UpdateViewState) => void>()
  private initialTimer: NodeJS.Timeout | null = null
  private intervalTimer: NodeJS.Timeout | null = null
  private initialized = false
  private readonly setTimeoutFn: typeof global.setTimeout
  private readonly clearTimeoutFn: typeof global.clearTimeout
  private readonly setIntervalFn: typeof global.setInterval
  private readonly clearIntervalFn: typeof global.clearInterval

  constructor(private readonly options: UpdateManagerOptions) {
    this.state = {
      status: options.updater ? 'idle' : 'unsupported',
      currentVersion: options.currentVersion,
      availableVersion: null,
      downloadPercent: null,
      checkedAt: null,
      message: options.updater
        ? 'Updates are checked automatically.'
        : 'Automatic updates are available in installed macOS and Windows builds.'
    }
    this.setTimeoutFn = options.setTimeout ?? global.setTimeout
    this.clearTimeoutFn = options.clearTimeout ?? global.clearTimeout
    this.setIntervalFn = options.setInterval ?? global.setInterval
    this.clearIntervalFn = options.clearInterval ?? global.clearInterval
  }

  initialize(): void {
    if (this.initialized || !this.options.updater) return
    this.initialized = true
    const updater = this.options.updater
    updater.autoDownload = true
    updater.autoInstallOnAppQuit = true
    updater.allowPrerelease = false
    updater.allowDowngrade = false
    updater.on('checking-for-update', this.onChecking)
    updater.on('update-not-available', this.onCurrent)
    updater.on('update-available', this.onAvailable)
    updater.on('download-progress', this.onDownloadProgress)
    updater.on('update-downloaded', this.onDownloaded)
    updater.on('error', this.onError)

    this.initialTimer = this.setTimeoutFn(() => void this.check(), INITIAL_CHECK_DELAY_MS)
    this.intervalTimer = this.setIntervalFn(
      () => void this.check(),
      UPDATE_CHECK_INTERVAL_MS
    )
  }

  getState(): UpdateViewState {
    return structuredClone(this.state)
  }

  subscribe(listener: (state: UpdateViewState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async check(): Promise<void> {
    if (!this.options.updater) throw new Error(this.state.message)
    if (this.state.status === 'checking' || this.state.status === 'downloading') return
    try {
      await this.options.updater.checkForUpdates()
    } catch (error) {
      this.onError(error instanceof Error ? error : new Error(String(error)))
    }
  }

  quitAndInstall(): void {
    if (!this.options.updater || this.state.status !== 'ready') {
      throw new Error('An update has not finished downloading.')
    }
    this.options.updater.quitAndInstall(false, true)
  }

  shutdown(): void {
    if (this.initialTimer) this.clearTimeoutFn(this.initialTimer)
    if (this.intervalTimer) this.clearIntervalFn(this.intervalTimer)
    this.initialTimer = null
    this.intervalTimer = null
    const updater = this.options.updater
    if (!updater || !this.initialized) return
    updater.off('checking-for-update', this.onChecking)
    updater.off('update-not-available', this.onCurrent)
    updater.off('update-available', this.onAvailable)
    updater.off('download-progress', this.onDownloadProgress)
    updater.off('update-downloaded', this.onDownloaded)
    updater.off('error', this.onError)
    this.initialized = false
  }

  private readonly onChecking = (): void => {
    this.setState({
      status: 'checking',
      downloadPercent: null,
      message: 'Checking GitHub Releases…'
    })
  }

  private readonly onCurrent = (): void => {
    this.setState({
      status: 'current',
      availableVersion: null,
      downloadPercent: null,
      checkedAt: Date.now(),
      message: `${APP_NAME} ${this.state.currentVersion} is up to date.`
    })
  }

  private readonly onAvailable = (info: UpdateInfo): void => {
    this.setState({
      status: 'available',
      availableVersion: info.version,
      downloadPercent: 0,
      checkedAt: Date.now(),
      message: `Downloading ${APP_NAME} ${info.version}…`
    })
  }

  private readonly onDownloadProgress = (info: ProgressInfo): void => {
    const percent = Math.min(100, Math.max(0, info.percent))
    this.setState({
      status: 'downloading',
      downloadPercent: percent,
      message: `Downloading update… ${Math.round(percent)}%`
    })
  }

  private readonly onDownloaded = (event: UpdateDownloadedEvent): void => {
    this.setState({
      status: 'ready',
      availableVersion: event.version,
      downloadPercent: 100,
      checkedAt: Date.now(),
      message: `${APP_NAME} ${event.version} is ready. Restart to install it.`
    })
    this.options.notifyReady(event.version)
  }

  private readonly onError = (error: Error): void => {
    this.setState({
      status: 'error',
      checkedAt: Date.now(),
      message: `Update check failed: ${error.message}`
    })
  }

  private setState(changes: Partial<UpdateViewState>): void {
    this.state = { ...this.state, ...changes }
    const snapshot = this.getState()
    for (const listener of this.listeners) listener(snapshot)
  }
}

export function installedUpdater(
  packaged: boolean,
  platform: NodeJS.Platform,
  updater: AppUpdater
): UpdateAdapter | null {
  return packaged && (platform === 'darwin' || platform === 'win32') ? updater : null
}
