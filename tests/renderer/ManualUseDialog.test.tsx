import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ManualUseDialog } from '../../src/renderer/src/components/ManualUseDialog'
import type {
  ManualUseResult,
  ManualUseReview,
  ManualUseTypedChallenge
} from '../../src/shared/types'

const review: ManualUseReview = {
  challengeId: 'review-challenge',
  profile: {
    id: 'profile-primary',
    name: 'Primary',
    codexHome: '/Users/test/.codex'
  },
  account: {
    type: 'chatgpt',
    email: 'owner@example.com'
  },
  credit: {
    id: 'credit-primary',
    resetType: 'codexRateLimits',
    title: 'Banked reset',
    expiresAt: 1_800_000_000
  },
  reviewExpiresAt: 1_799_999_900
}

const challenge: ManualUseTypedChallenge = {
  challengeId: review.challengeId,
  confirmationPrompt: 'USE CREDIT credit-primary FOR owner@example.com',
  confirmationExpiresAt: 1_799_999_950
}

const success: ManualUseResult = {
  outcome: 'reset',
  message: 'Codex used the reviewed banked reset.'
}

interface DialogHarness {
  acknowledge: ReturnType<
    typeof vi.fn<(challengeId: string) => Promise<ManualUseTypedChallenge>>
  >
  confirm: ReturnType<
    typeof vi.fn<(challengeId: string, exactResponse: string) => Promise<ManualUseResult>>
  >
  cancel: ReturnType<typeof vi.fn<(challengeId: string) => Promise<void>>>
  onClose: ReturnType<typeof vi.fn<() => void>>
  user: ReturnType<typeof userEvent.setup>
}

function renderDialog(): DialogHarness {
  const acknowledge =
    vi.fn<(challengeId: string) => Promise<ManualUseTypedChallenge>>()
  const confirm =
    vi.fn<(challengeId: string, exactResponse: string) => Promise<ManualUseResult>>()
  const cancel = vi.fn<(challengeId: string) => Promise<void>>()
  const onClose = vi.fn<() => void>()
  acknowledge.mockResolvedValue(challenge)
  confirm.mockResolvedValue(success)
  cancel.mockResolvedValue()

  render(
    <ManualUseDialog
      review={review}
      acknowledge={acknowledge}
      confirm={confirm}
      cancel={cancel}
      onClose={onClose}
    />
  )

  return {
    acknowledge,
    confirm,
    cancel,
    onClose,
    user: userEvent.setup()
  }
}

describe('ManualUseDialog', () => {
  it('requires both sequential confirmations and the exact bound phrase before use', async () => {
    const { acknowledge, confirm, cancel, onClose, user } = renderDialog()

    expect(
      screen.getByRole('dialog', { name: 'Review the exact banked reset' })
    ).toHaveAccessibleDescription(
      'This request can happen before the automatic safety window. Check every identity below before continuing.'
    )
    expect(screen.getByText('owner@example.com')).toBeInTheDocument()
    expect(screen.getByText('credit-primary')).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'I reviewed these exact details' })
    )

    expect(acknowledge).toHaveBeenCalledOnce()
    expect(acknowledge).toHaveBeenCalledWith(review.challengeId)
    const input = await screen.findByRole('textbox', {
      name: 'Exact confirmation phrase'
    })
    expect(input).toHaveFocus()

    const useButton = screen.getByRole('button', {
      name: 'Use this exact reset now'
    })
    expect(useButton).toBeDisabled()
    await user.type(input, challenge.confirmationPrompt.toLowerCase())
    expect(useButton).toBeDisabled()
    await user.clear(input)
    await user.type(input, `${challenge.confirmationPrompt} `)
    expect(useButton).toBeDisabled()
    await user.clear(input)
    await user.type(input, challenge.confirmationPrompt)
    expect(useButton).toBeEnabled()

    await user.click(useButton)

    expect(confirm).toHaveBeenCalledOnce()
    expect(confirm).toHaveBeenCalledWith(
      challenge.challengeId,
      challenge.confirmationPrompt
    )
    expect(
      await screen.findByRole('heading', { name: 'Codex responded' })
    ).toBeInTheDocument()
    expect(screen.getByText('Reset used')).toBeInTheDocument()
    expect(screen.getAllByText(success.message)).toHaveLength(2)
    expect(cancel).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(cancel).not.toHaveBeenCalled()
  })

  it('cancels the review before closing', async () => {
    const { cancel, onClose, user } = renderDialog()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(cancel).toHaveBeenCalledOnce()
    expect(cancel).toHaveBeenCalledWith(review.challengeId)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('cancels the active typed challenge when Escape is pressed', async () => {
    const { cancel, onClose, user } = renderDialog()
    await user.click(
      screen.getByRole('button', { name: 'I reviewed these exact details' })
    )
    await screen.findByRole('textbox', { name: 'Exact confirmation phrase' })

    await user.keyboard('{Escape}')

    expect(cancel).toHaveBeenCalledOnce()
    expect(cancel).toHaveBeenCalledWith(review.challengeId)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('stops after an acknowledgement error without offering the final action', async () => {
    const { acknowledge, confirm, onClose, user } = renderDialog()
    acknowledge.mockRejectedValue(
      new Error(
        "Error invoking remote method 'reset-net:acknowledge-manual-use': Error: Review expired"
      )
    )

    await user.click(
      screen.getByRole('button', { name: 'I reviewed these exact details' })
    )

    expect(
      await screen.findByRole('heading', { name: 'Manual use stopped' })
    ).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Review expired')
    expect(
      screen.queryByRole('button', { name: 'Use this exact reset now' })
    ).not.toBeInTheDocument()
    expect(confirm).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('reports a final confirmation error and never retries it', async () => {
    const { confirm, user } = renderDialog()
    confirm.mockRejectedValue(new Error('Credit identity changed'))
    await user.click(
      screen.getByRole('button', { name: 'I reviewed these exact details' })
    )
    const input = await screen.findByRole('textbox', {
      name: 'Exact confirmation phrase'
    })
    await user.type(input, challenge.confirmationPrompt)

    await user.click(
      screen.getByRole('button', { name: 'Use this exact reset now' })
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Credit identity changed'
    )
    expect(confirm).toHaveBeenCalledOnce()
    expect(
      screen.queryByRole('button', { name: 'Use this exact reset now' })
    ).not.toBeInTheDocument()
  })

  it('blocks double submission while the irreversible request is pending', async () => {
    const { confirm, user } = renderDialog()
    const pending = deferred<ManualUseResult>()
    confirm.mockReturnValue(pending.promise)
    await user.click(
      screen.getByRole('button', { name: 'I reviewed these exact details' })
    )
    await user.type(
      await screen.findByRole('textbox', {
        name: 'Exact confirmation phrase'
      }),
      challenge.confirmationPrompt
    )
    const useButton = screen.getByRole('button', {
      name: 'Use this exact reset now'
    })

    await user.click(useButton)
    expect(useButton).toBeDisabled()
    await user.click(useButton)
    expect(confirm).toHaveBeenCalledOnce()

    await act(async () => {
      pending.resolve(success)
      await pending.promise
    })
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Codex responded' })
      ).toBeInTheDocument()
    })
  })
})

function deferred<T>(): {
  promise: Promise<T>
  resolve(value: T): void
} {
  let resolvePromise: (value: T) => void = () => undefined
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve
  })
  return {
    promise,
    resolve: resolvePromise
  }
}
