import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ProfileCard } from '../../src/renderer/src/components/ProfileCard'
import {
  makeProfileSettings
} from './support/appViewState'
import {
  installResetNetBridge,
  type ResetNetBridgeSpy
} from './support/resetNetBridgeSpy'

type RunAction = (action: () => Promise<void>) => Promise<void>

interface ProfileHarness {
  bridge: ResetNetBridgeSpy
  run: ReturnType<typeof vi.fn<RunAction>>
  user: ReturnType<typeof userEvent.setup>
}

function renderProfile(
  profile = makeProfileSettings()
): ProfileHarness {
  const bridge = installResetNetBridge()
  const run = vi.fn<RunAction>(async (action) => action())
  render(<ProfileCard profile={profile} run={run} />)
  return {
    bridge,
    run,
    user: userEvent.setup()
  }
}

describe('ProfileCard', () => {
  it('requires confirmation before enabling real automatic use', async () => {
    const profile = makeProfileSettings({
      name: 'Work',
      leadTimeMinutes: 45
    })
    const { bridge, run, user } = renderProfile(profile)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)

    await user.click(
      screen.getByRole('checkbox', { name: 'Use automatically' })
    )

    expect(confirm).toHaveBeenCalledOnce()
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining('Enable real automatic reset use for “Work”?')
    )
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining('45 minutes before it expires')
    )
    expect(bridge.updateProfile).toHaveBeenCalledWith(profile.id, {
      autoRedeemEnabled: true,
      autoRedeemConfirmed: true
    })
    expect(run).toHaveBeenCalledOnce()
  })

  it('leaves automatic use off when confirmation is cancelled', async () => {
    const { bridge, run, user } = renderProfile()
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    await user.click(
      screen.getByRole('checkbox', { name: 'Use automatically' })
    )

    expect(bridge.updateProfile).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
  })

  it('turns automatic use off without another confirmation', async () => {
    const profile = makeProfileSettings({ autoRedeemEnabled: true })
    const { bridge, user } = renderProfile(profile)
    const confirm = vi.spyOn(window, 'confirm')

    await user.click(
      screen.getByRole('checkbox', { name: 'Use automatically' })
    )

    expect(confirm).not.toHaveBeenCalled()
    expect(bridge.updateProfile).toHaveBeenCalledWith(profile.id, {
      autoRedeemEnabled: false
    })
  })

  it('disables automatic use controls when profile tracking is disabled', () => {
    renderProfile(makeProfileSettings({ enabled: false }))

    expect(
      screen.getByRole('checkbox', { name: 'Use automatically' })
    ).toBeDisabled()
  })

  it('saves an integer lead time when the field is committed', async () => {
    const profile = makeProfileSettings({ leadTimeMinutes: 30 })
    const { bridge, user } = renderProfile(profile)
    const leadTime = screen.getByRole('spinbutton', { name: 'min before' })

    await user.clear(leadTime)
    await user.type(leadTime, '45')
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(bridge.updateProfile).toHaveBeenCalledWith(profile.id, {
        leadTimeMinutes: 45
      })
    })
  })

  it('only changes a Codex home after selection and confirmation', async () => {
    const profile = makeProfileSettings()
    const { bridge, user } = renderProfile(profile)
    bridge.chooseCodexHome.mockResolvedValue('/Users/test/.codex_work')
    const confirm = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
    const changeHome = screen.getByRole('button', { name: 'Change home' })

    await user.click(changeHome)
    expect(bridge.updateProfile).not.toHaveBeenCalled()

    await user.click(changeHome)
    expect(confirm).toHaveBeenCalledTimes(2)
    expect(bridge.updateProfile).toHaveBeenCalledOnce()
    expect(bridge.updateProfile).toHaveBeenCalledWith(profile.id, {
      codexHome: '/Users/test/.codex_work'
    })
  })

  it('updates whether the profile is tracked', async () => {
    const profile = makeProfileSettings({ enabled: true })
    const { bridge, user } = renderProfile(profile)

    await user.click(screen.getByRole('checkbox', { name: 'Track' }))

    expect(bridge.updateProfile).toHaveBeenCalledWith(profile.id, {
      enabled: false
    })
  })

  it('only removes a profile after confirmation', async () => {
    const profile = makeProfileSettings({ name: 'Disposable' })
    const { bridge, run, user } = renderProfile(profile)
    vi.spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
    const remove = screen.getByRole('button', { name: 'Remove' })

    await user.click(remove)
    expect(bridge.removeProfile).not.toHaveBeenCalled()

    await user.click(remove)
    expect(bridge.removeProfile).toHaveBeenCalledOnce()
    expect(bridge.removeProfile).toHaveBeenCalledWith(profile.id)
    expect(run).toHaveBeenCalledOnce()
  })
})
