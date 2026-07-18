import { EventEmitter } from 'node:events'
import type { ProgressInfo, UpdateDownloadedEvent, UpdateInfo } from 'electron-updater'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  UpdateManager,
  type UpdateAdapter
} from '../src/main/update/updateManager'

class FakeUpdater extends EventEmitter implements UpdateAdapter {
  autoDownload = false
  autoInstallOnAppQuit = false
  allowPrerelease = true
  allowDowngrade = true
  checkCount = 0
  installCount = 0

  async checkForUpdates(): Promise<void> {
    this.checkCount += 1
    this.emit('checking-for-update')
    this.emit('update-not-available', { version: '0.3.0' } as UpdateInfo)
  }

  quitAndInstall(): void {
    this.installCount += 1
  }

  emitAvailable(version: string): void {
    this.emit('update-available', { version } as UpdateInfo)
  }

  emitProgress(percent: number): void {
    this.emit('download-progress', { percent } as ProgressInfo)
  }

  emitDownloaded(version: string): void {
    this.emit('update-downloaded', { version } as UpdateDownloadedEvent)
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('automatic updates', () => {
  it('checks after startup and configures safe stable automatic downloads', async () => {
    vi.useFakeTimers()
    const updater = new FakeUpdater()
    const manager = new UpdateManager({
      updater,
      currentVersion: '0.3.0',
      notifyReady: vi.fn()
    })

    manager.initialize()
    expect(updater).toMatchObject({
      autoDownload: true,
      autoInstallOnAppQuit: true,
      allowPrerelease: false,
      allowDowngrade: false
    })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(updater.checkCount).toBe(1)
    expect(manager.getState()).toMatchObject({ status: 'current', currentVersion: '0.3.0' })
    manager.shutdown()
  })

  it('only offers installation after a complete download', () => {
    const updater = new FakeUpdater()
    const notifyReady = vi.fn()
    const manager = new UpdateManager({ updater, currentVersion: '0.3.0', notifyReady })
    manager.initialize()

    expect(() => manager.quitAndInstall()).toThrow('not finished')
    updater.emitAvailable('0.4.0')
    updater.emitProgress(57.4)
    expect(manager.getState()).toMatchObject({ status: 'downloading', downloadPercent: 57.4 })
    updater.emitDownloaded('0.4.0')
    expect(manager.getState()).toMatchObject({ status: 'ready', availableVersion: '0.4.0' })
    expect(notifyReady).toHaveBeenCalledWith('0.4.0')

    manager.quitAndInstall()
    expect(updater.installCount).toBe(1)
    manager.shutdown()
  })
})
