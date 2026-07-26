import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from '../../src/renderer/src/App'
import type { AppViewState } from '../../src/shared/types'
import {
  makeAppViewState,
  makeProfileRuntimeState,
  makeResetCredit,
  makeUpdateViewState
} from './support/appViewState'
import {
  installResetNetBridge
} from './support/resetNetBridgeSpy'

describe('App', () => {
  it('shows a loading state while the first renderer IPC request is pending', () => {
    const bridge = installResetNetBridge()
    bridge.getState.mockReturnValue(new Promise<AppViewState>(() => undefined))

    render(<App />)

    expect(screen.getByRole('main')).toHaveTextContent(
      'Opening Banked Reset Safety Net…'
    )
  })

  it('navigates between Status and Settings', async () => {
    installResetNetBridge()
    const user = userEvent.setup()
    render(<App />)

    expect(
      await screen.findByRole('heading', { name: 'Primary' })
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    expect(
      await screen.findByRole('heading', { name: 'Codex homes' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'App settings' })
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Status' }))
    expect(
      await screen.findByRole('heading', { name: 'Primary' })
    ).toBeInTheDocument()
  })

  it('refreshes the current status through the bridge', async () => {
    const bridge = installResetNetBridge()
    const user = userEvent.setup()
    render(<App />)
    const refresh = await screen.findByRole('button', { name: 'Refresh' })

    await user.click(refresh)

    expect(bridge.refresh).toHaveBeenCalledOnce()
  })

  it('renders state and update subscription changes', async () => {
    const initial = makeAppViewState()
    const bridge = installResetNetBridge(initial)
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: 'Primary' })

    const next: AppViewState = {
      ...initial,
      settings: {
        ...initial.settings,
        profiles: [
          {
            ...initial.settings.profiles[0],
            name: 'Renamed profile'
          }
        ]
      },
      updatedAt: initial.updatedAt + 1
    }
    act(() => bridge.emitState(next))
    expect(
      await screen.findByRole('heading', { name: 'Renamed profile' })
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Settings' }))
    act(() => {
      bridge.emitUpdateState(
        makeUpdateViewState({
          status: 'ready',
          availableVersion: '1.0.0',
          message: 'Version 1.0.0 is ready to install.'
        })
      )
    })
    const install = await screen.findByRole('button', {
      name: 'Restart and install'
    })
    await user.click(install)
    expect(bridge.installUpdate).toHaveBeenCalledOnce()
  })

  it('surfaces an action IPC error and lets the user dismiss it', async () => {
    const bridge = installResetNetBridge()
    bridge.refresh.mockRejectedValue(
      new Error(
        "Error invoking remote method 'reset-net:refresh': Error: Codex is unavailable"
      )
    )
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Refresh' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Codex is unavailable'
    )
    await user.click(screen.getByRole('button', { name: 'Dismiss error' }))
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  it('surfaces an initial state failure and retries instead of hanging on the opening screen', async () => {
    const bridge = installResetNetBridge()
    bridge.getState.mockRejectedValueOnce(new Error('Settings file is unreadable'))
    const user = userEvent.setup()
    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Settings file is unreadable'
    )
    bridge.getState.mockResolvedValue(makeAppViewState())
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('heading', { name: 'Primary' })).toBeInTheDocument()
    expect(bridge.getState).toHaveBeenCalledTimes(2)
  })

  it('opens manual review only for the earliest available reset', async () => {
    const nowSeconds = Math.floor(Date.now() / 1_000)
    const state = makeAppViewState({
      profiles: [
        makeProfileRuntimeState({
          availableCount: 2,
          credits: [
            makeResetCredit({
              id: 'credit-later',
              expiresAt: nowSeconds + 48 * 60 * 60
            }),
            makeResetCredit({
              id: 'credit-earliest',
              expiresAt: nowSeconds + 24 * 60 * 60
            })
          ]
        })
      ]
    })
    const bridge = installResetNetBridge(state)
    bridge.prepareManualUse.mockResolvedValue({
      challengeId: 'challenge-1',
      profile: {
        id: 'profile-primary',
        name: 'Primary',
        codexHome: '/Users/test/.codex'
      },
      account: { type: 'chatgpt', email: 'owner@example.com' },
      credit: {
        id: 'credit-earliest',
        resetType: 'codexRateLimits',
        title: 'Banked reset',
        expiresAt: nowSeconds + 24 * 60 * 60
      },
      reviewExpiresAt: Date.now() + 120_000
    })
    const user = userEvent.setup()
    render(<App />)

    const useNow = await screen.findByRole('button', { name: 'Use now…' })
    expect(screen.getAllByText('Available')).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Use now…' })).toHaveLength(1)
    await user.click(useNow)

    expect(bridge.prepareManualUse).toHaveBeenCalledWith(
      'profile-primary',
      'credit-earliest'
    )
    expect(
      await screen.findByRole('dialog', { name: 'Review the exact banked reset' })
    ).toBeInTheDocument()
  })

  it('shows warning health and changes advisory warnings independently', async () => {
    const state = makeAppViewState({
      expiryWarnings: {
        status: 'unsupported',
        message: 'Desktop expiry warnings are unavailable on this system.'
      }
    })
    const bridge = installResetNetBridge(state)
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Settings' }))
    expect(screen.getByText('Expiry warnings unavailable')).toBeInTheDocument()
    expect(
      screen.getByText('Desktop expiry warnings are unavailable on this system.')
    ).toBeInTheDocument()
    await user.click(
      screen.getByRole('checkbox', { name: 'Warn before a banked reset expires' })
    )

    expect(bridge.updateSettings).toHaveBeenCalledWith({
      expiryWarningsEnabled: false
    })
  })

  it('turns an update-state IPC rejection into visible error state', async () => {
    const bridge = installResetNetBridge()
    bridge.getUpdateState.mockRejectedValue(new Error('Updater metadata is unreadable'))
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Settings' }))

    expect(await screen.findByText(/Updater metadata is unreadable/)).toBeInTheDocument()
  })

  it('unsubscribes from both renderer event streams when unmounted', async () => {
    const bridge = installResetNetBridge()
    const view = render(<App />)
    await screen.findByRole('navigation', {
      name: 'Banked Reset Safety Net sections'
    })
    expect(bridge.onStateChanged).toHaveBeenCalledOnce()
    expect(bridge.onUpdateStateChanged).toHaveBeenCalledOnce()

    view.unmount()

    expect(bridge.unsubscribeState).toHaveBeenCalledOnce()
    expect(bridge.unsubscribeUpdateState).toHaveBeenCalledOnce()
  })
})
