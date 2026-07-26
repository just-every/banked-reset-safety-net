import type {
  ExpiryWarningDeliveryRequest,
  ExpiryWarningDeliveryResult
} from './expiryWarningRunner'
import {
  desktopNotificationContent,
  type DesktopNotificationOptions
} from './desktopNotificationContent'

export {
  DESKTOP_NOTIFICATION_TEXT_MAX_BYTES,
  type DesktopNotificationOptions
} from './desktopNotificationContent'

export const DESKTOP_NOTIFICATION_DELIVERY_TIMEOUT_MS = 5_000

export interface DesktopNotification {
  on(event: string, listener: (...arguments_: any[]) => void): this
  removeListener(event: string, listener: (...arguments_: any[]) => void): this
  show(): void
  close(): void
}

export interface DesktopNotificationTimer {
  setTimeout(callback: () => void, delayMs: number): unknown
  clearTimeout(handle: unknown): void
}

export interface DesktopNotifierOptions {
  isSupported: () => boolean
  createNotification: (options: DesktopNotificationOptions) => DesktopNotification
  showApp: () => void
  timer?: DesktopNotificationTimer
  deliveryTimeoutMs?: number
}

interface ActiveNotification {
  notification: DesktopNotification
  resolve: (result: ExpiryWarningDeliveryResult) => void
  timerHandle: unknown | null
  pendingDelivery: boolean
  onShow: () => void
  onFailed: (...arguments_: any[]) => void
  onClick: () => void
  onClose: () => void
}

const systemTimer: DesktopNotificationTimer = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout)
}

export class DesktopNotifier {
  private readonly activeNotifications = new Map<DesktopNotification, ActiveNotification>()
  private readonly timer: DesktopNotificationTimer
  private readonly deliveryTimeoutMs: number
  private stopped = false

  constructor(private readonly options: DesktopNotifierOptions) {
    this.timer = options.timer ?? systemTimer
    this.deliveryTimeoutMs =
      options.deliveryTimeoutMs ?? DESKTOP_NOTIFICATION_DELIVERY_TIMEOUT_MS
    if (
      !Number.isSafeInteger(this.deliveryTimeoutMs) ||
      this.deliveryTimeoutMs <= 0 ||
      this.deliveryTimeoutMs > 60_000
    ) {
      throw new Error('Desktop notification delivery timeout must be 1–60000 milliseconds.')
    }
  }

  readonly deliver = async (
    request: ExpiryWarningDeliveryRequest
  ): Promise<ExpiryWarningDeliveryResult> => {
    if (this.stopped) {
      return { status: 'failed', error: 'Desktop notifier is shut down.' }
    }

    try {
      if (!this.options.isSupported()) return { status: 'unsupported' }
    } catch (error) {
      return failedResult(error)
    }

    return new Promise<ExpiryWarningDeliveryResult>((resolve) => {
      let active: ActiveNotification | null = null
      try {
        const notification = this.options.createNotification(
          desktopNotificationContent(request)
        )
        active = {
          notification,
          resolve,
          timerHandle: null,
          pendingDelivery: true,
          onShow: () => {
            if (active) this.markShown(active)
          },
          onFailed: (...arguments_: any[]) => {
            if (active) this.markFailed(active, nativeFailureMessage(arguments_))
          },
          onClick: () => this.options.showApp(),
          onClose: () => {
            if (active) this.markClosed(active)
          }
        }

        this.activeNotifications.set(notification, active)
        notification.on('show', active.onShow)
        notification.on('failed', active.onFailed)
        notification.on('click', active.onClick)
        notification.on('close', active.onClose)
        active.timerHandle = this.timer.setTimeout(() => {
          if (active) {
            this.markFailed(
              active,
              `Native notification did not report delivery within ${this.deliveryTimeoutMs}ms.`
            )
          }
        }, this.deliveryTimeoutMs)
        notification.show()
      } catch (error) {
        if (active) this.release(active, true)
        resolve(failedResult(error))
      }
    })
  }

  shutdown(): void {
    if (this.stopped) return
    this.stopped = true

    for (const active of [...this.activeNotifications.values()]) {
      if (active.pendingDelivery) {
        active.pendingDelivery = false
        active.resolve({
          status: 'failed',
          error: 'Desktop notifier shut down before notification delivery.'
        })
      }
      this.release(active, true)
    }
  }

  private markShown(active: ActiveNotification): void {
    if (!active.pendingDelivery) return
    active.pendingDelivery = false
    this.clearDeliveryTimer(active)
    active.notification.removeListener('show', active.onShow)
    active.notification.removeListener('failed', active.onFailed)
    active.resolve({ status: 'delivered' })
  }

  private markFailed(active: ActiveNotification, error: string): void {
    if (!active.pendingDelivery) return
    active.pendingDelivery = false
    active.resolve({ status: 'failed', error })
    this.release(active, true)
  }

  private markClosed(active: ActiveNotification): void {
    if (active.pendingDelivery) {
      active.pendingDelivery = false
      active.resolve({
        status: 'failed',
        error: 'Native notification closed before reporting delivery.'
      })
    }
    this.release(active, false)
  }

  private release(active: ActiveNotification, close: boolean): void {
    this.clearDeliveryTimer(active)
    this.activeNotifications.delete(active.notification)
    active.notification.removeListener('show', active.onShow)
    active.notification.removeListener('failed', active.onFailed)
    active.notification.removeListener('click', active.onClick)
    active.notification.removeListener('close', active.onClose)
    if (close) {
      try {
        active.notification.close()
      } catch {
        // The notification is already detached; shutdown and failure remain fail-closed.
      }
    }
  }

  private clearDeliveryTimer(active: ActiveNotification): void {
    if (active.timerHandle === null) return
    this.timer.clearTimeout(active.timerHandle)
    active.timerHandle = null
  }
}

function nativeFailureMessage(arguments_: any[]): string {
  const error = arguments_[1]
  return typeof error === 'string' && error.trim()
    ? error
    : 'Native notification delivery failed.'
}

function failedResult(error: unknown): ExpiryWarningDeliveryResult {
  return {
    status: 'failed',
    error: error instanceof Error ? error.message : String(error)
  }
}
