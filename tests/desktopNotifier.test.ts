import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import {
  DESKTOP_NOTIFICATION_TEXT_MAX_BYTES,
  DesktopNotifier,
  type DesktopNotification,
  type DesktopNotificationOptions,
  type DesktopNotificationTimer
} from '../src/main/notifications/desktopNotifier'
import type { ExpiryWarningDeliveryRequest } from '../src/main/notifications/expiryWarningRunner'
import type { ExpiryWarningStage } from '../src/shared/expiryWarnings'
import { formatLocalDateTime } from '../src/shared/time'

const EXPIRES_AT = 2_000_003_600

describe('DesktopNotifier', () => {
  it('returns unsupported without constructing a notification', async () => {
    const createNotification = vi.fn()
    const notifier = new DesktopNotifier({
      isSupported: () => false,
      createNotification,
      showApp: vi.fn()
    })

    await expect(notifier.deliver(request())).resolves.toEqual({ status: 'unsupported' })
    expect(createNotification).not.toHaveBeenCalled()
  })

  it.each([
    ['day-before', 'Banked reset expires within 24 hours'],
    ['use-by', 'Banked reset use-by time reached']
  ] satisfies Array<[ExpiryWarningStage, string]>)(
    'uses exact %s wording and resolves only after the native show event',
    async (stage, expectedTitle) => {
      const fixture = notifierFixture()
      const delivery = fixture.notifier.deliver(request(stage))
      const notification = fixture.notifications[0]

      expect(notification?.showCalls).toBe(1)
      expect(fixture.timer.cleared).toEqual([])
      expect(await promiseState(delivery)).toBe('pending')
      notification?.emit('show')

      await expect(delivery).resolves.toEqual({ status: 'delivered' })
      expect(notification?.options.title).toBe(expectedTitle)
      expect(notification?.options.body).toContain('Full reset for Codex, Work')
      expect(notification?.options.body).toContain(
        `expires at ${formatLocalDateTime(EXPIRES_AT)}`
      )
      expect(notification?.options.body).toContain(
        'Open Banked Reset Safety Net to review.'
      )
      expect(Object.keys(notification?.options ?? {}).sort()).toEqual(['body', 'title'])
      expect(fixture.timer.cleared).toEqual([fixture.timer.lastHandle])
    }
  )

  it('reports the native failed event without marking it delivered', async () => {
    const fixture = notifierFixture()
    const delivery = fixture.notifier.deliver(request())
    const notification = fixture.notifications[0]

    notification?.emit('failed', undefined, 'Notifications are blocked')

    await expect(delivery).resolves.toEqual({
      status: 'failed',
      error: 'Notifications are blocked'
    })
    expect(notification?.closeCalls).toBe(1)
    expect(notification?.eventNames()).toEqual([])
  })

  it.each(['factory', 'show'] as const)(
    'reports a synchronous %s throw as failed',
    async (throwPoint) => {
      const timer = new RecordingTimer()
      const notification = new FakeNotification({ title: '', body: '' })
      notification.showError = throwPoint === 'show' ? new Error('show failed') : null
      const notifier = new DesktopNotifier({
        isSupported: () => true,
        createNotification: () => {
          if (throwPoint === 'factory') throw new Error('factory failed')
          return notification
        },
        showApp: vi.fn(),
        timer,
        deliveryTimeoutMs: 25
      })

      await expect(notifier.deliver(request())).resolves.toEqual({
        status: 'failed',
        error: `${throwPoint} failed`
      })
      if (throwPoint === 'show') {
        expect(notification.closeCalls).toBe(1)
        expect(notification.eventNames()).toEqual([])
      }
    }
  )

  it('fails and closes a notification after the bounded delivery timeout', async () => {
    const fixture = notifierFixture()
    const delivery = fixture.notifier.deliver(request())
    const notification = fixture.notifications[0]

    fixture.timer.fire()

    await expect(delivery).resolves.toEqual({
      status: 'failed',
      error: 'Native notification did not report delivery within 25ms.'
    })
    expect(notification?.closeCalls).toBe(1)
    expect(notification?.eventNames()).toEqual([])
  })

  it('binds notification clicks only to opening the app UI', async () => {
    const showApp = vi.fn()
    const fixture = notifierFixture(showApp)
    const delivery = fixture.notifier.deliver(request())
    const notification = fixture.notifications[0]
    notification?.emit('show')
    await delivery

    notification?.emit('click')

    expect(showApp).toHaveBeenCalledTimes(1)
    expect(notification?.options).toEqual({
      title: 'Banked reset expires within 24 hours',
      body: `Full reset for Codex, Work expires at ${formatLocalDateTime(EXPIRES_AT)}. Open Banked Reset Safety Net to review.`
    })
  })

  it('retains shown notifications through their lifecycle and closes them on shutdown', async () => {
    const showApp = vi.fn()
    const fixture = notifierFixture(showApp)
    const firstDelivery = fixture.notifier.deliver(request())
    const first = fixture.notifications[0]
    first?.emit('show')
    await firstDelivery
    expect(first?.listenerCount('click')).toBe(1)

    const secondDelivery = fixture.notifier.deliver(request('use-by'))
    const second = fixture.notifications[1]
    fixture.notifier.shutdown()

    await expect(secondDelivery).resolves.toEqual({
      status: 'failed',
      error: 'Desktop notifier shut down before notification delivery.'
    })
    expect(first?.closeCalls).toBe(1)
    expect(second?.closeCalls).toBe(1)
    expect(first?.eventNames()).toEqual([])
    expect(second?.eventNames()).toEqual([])
    first?.emit('click')
    expect(showApp).not.toHaveBeenCalled()
  })

  it('safely aggregates names and keeps multibyte notification text within 256 bytes', async () => {
    const fixture = notifierFixture()
    const delivery = fixture.notifier.deliver(
      request('day-before', {
        creditTitle: `Detailed ${'🌏'.repeat(100)} reset`,
        profileNames: [
          `Main\n${'🧑🏽‍💻'.repeat(30)}`,
          `Work ${'🌟'.repeat(30)}`,
          `Third ${'🛡️'.repeat(30)}`
        ]
      })
    )
    const notification = fixture.notifications[0]
    notification?.emit('show')
    await delivery

    const body = notification?.options.body ?? ''
    expect(Buffer.byteLength(notification?.options.title ?? '', 'utf8')).toBeLessThanOrEqual(
      DESKTOP_NOTIFICATION_TEXT_MAX_BYTES
    )
    expect(Buffer.byteLength(body, 'utf8')).toBeLessThanOrEqual(
      DESKTOP_NOTIFICATION_TEXT_MAX_BYTES
    )
    expect(body).toContain('Main')
    expect(body).toMatch(/\+\d+ more/)
    expect(body).toContain(`expires at ${formatLocalDateTime(EXPIRES_AT)}`)
    expect(body.endsWith('Open Banked Reset Safety Net to review.')).toBe(true)
    expect(body).not.toContain('\n')
  })
})

class FakeNotification extends EventEmitter implements DesktopNotification {
  showCalls = 0
  closeCalls = 0
  showError: Error | null = null

  constructor(readonly options: DesktopNotificationOptions) {
    super()
  }

  show(): void {
    this.showCalls += 1
    if (this.showError) throw this.showError
  }

  close(): void {
    this.closeCalls += 1
  }
}

class RecordingTimer implements DesktopNotificationTimer {
  cleared: unknown[] = []
  lastHandle: object | null = null
  private callback: (() => void) | null = null

  setTimeout(callback: () => void, delayMs: number): unknown {
    expect(delayMs).toBe(25)
    this.callback = callback
    this.lastHandle = {}
    return this.lastHandle
  }

  clearTimeout(handle: unknown): void {
    this.cleared.push(handle)
    if (handle === this.lastHandle) this.callback = null
  }

  fire(): void {
    const callback = this.callback
    this.callback = null
    callback?.()
  }
}

function notifierFixture(showApp = vi.fn()): {
  notifier: DesktopNotifier
  notifications: FakeNotification[]
  timer: RecordingTimer
} {
  const notifications: FakeNotification[] = []
  const timer = new RecordingTimer()
  return {
    notifier: new DesktopNotifier({
      isSupported: () => true,
      createNotification: (options) => {
        const notification = new FakeNotification(options)
        notifications.push(notification)
        return notification
      },
      showApp,
      timer,
      deliveryTimeoutMs: 25
    }),
    notifications,
    timer
  }
}

function request(
  stage: ExpiryWarningStage = 'day-before',
  candidateOverrides: Partial<ExpiryWarningDeliveryRequest['candidate']> = {}
): ExpiryWarningDeliveryRequest {
  return {
    stage,
    candidate: {
      identity: `codexRateLimits\0credit-1\0${EXPIRES_AT}`,
      resetType: 'codexRateLimits',
      creditId: 'credit-1',
      creditTitle: 'Full reset',
      expiresAt: EXPIRES_AT,
      useByAt: EXPIRES_AT - 1_800,
      leadTimeMinutes: 30,
      profileIds: ['profile-1', 'profile-2'],
      profileNames: ['Codex', 'Work'],
      dueStages: [stage],
      ...candidateOverrides
    }
  }
}

async function promiseState(promise: Promise<unknown>): Promise<'pending' | 'settled'> {
  return Promise.race([
    promise.then(() => 'settled' as const),
    Promise.resolve('pending' as const)
  ])
}
