import { useEffect, useRef, useState } from 'react'
import { formatHomePathForDisplay } from '../../../shared/pathDisplay'
import type {
  ManualUseResult,
  ManualUseReview,
  ManualUseTypedChallenge
} from '../../../shared/types'

interface ManualUseDialogProps {
  review: ManualUseReview
  acknowledge(challengeId: string): Promise<ManualUseTypedChallenge>
  confirm(challengeId: string, exactResponse: string): Promise<ManualUseResult>
  cancel(challengeId: string): Promise<void>
  onClose(): void
}

type DialogStage = 'review' | 'challenge' | 'result' | 'failed'

export function ManualUseDialog({
  review,
  acknowledge,
  confirm,
  cancel,
  onClose
}: ManualUseDialogProps): React.JSX.Element {
  const [stage, setStage] = useState<DialogStage>('review')
  const [challenge, setChallenge] = useState<ManualUseTypedChallenge | null>(null)
  const [response, setResponse] = useState('')
  const [result, setResult] = useState<ManualUseResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const challengeInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (stage === 'challenge') challengeInput.current?.focus()
  }, [stage])

  const close = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      if (stage !== 'result') await cancel(review.challengeId)
    } catch {
      // Cancellation is fail-closed in the main process because challenges expire and are single-use.
    } finally {
      onClose()
    }
  }

  const acknowledgeDetails = async (): Promise<void> => {
    if (busy || stage !== 'review') return
    setBusy(true)
    setError(null)
    try {
      const next = await acknowledge(review.challengeId)
      setChallenge(next)
      setResponse('')
      setStage('challenge')
    } catch (reason) {
      setError(errorMessage(reason))
      setStage('failed')
    } finally {
      setBusy(false)
    }
  }

  const confirmExactUse = async (): Promise<void> => {
    if (
      busy ||
      stage !== 'challenge' ||
      !challenge ||
      response !== challenge.confirmationPrompt
    ) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const next = await confirm(challenge.challengeId, response)
      setResult(next)
      setStage('result')
    } catch (reason) {
      setError(errorMessage(reason))
      setStage('failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="manual-use-backdrop"
      role="presentation"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          void close()
        }
      }}
    >
      <section
        className="manual-use-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="manual-use-title"
        aria-describedby="manual-use-description"
      >
        <header>
          <span className="manual-use-warning-icon" aria-hidden="true">
            !
          </span>
          <div>
            <p className="manual-use-eyebrow">Irreversible early use</p>
            <h2 id="manual-use-title">
              {stage === 'review'
                ? 'Review the exact banked reset'
                : stage === 'challenge'
                  ? 'Type the exact confirmation'
                  : stage === 'result'
                    ? 'Codex responded'
                    : 'Manual use stopped'}
            </h2>
          </div>
        </header>

        <p id="manual-use-description" className="manual-use-description">
          {stage === 'review'
            ? 'This request can happen before the automatic safety window. Check every identity below before continuing.'
            : stage === 'challenge'
              ? 'This is the second and final confirmation. The phrase is bound to the reviewed account, credit, and expiry.'
              : stage === 'result'
                ? result?.message
                : 'No new reset request will be made from this dialog. Start again to create a fresh review.'}
        </p>

        {stage === 'review' || stage === 'challenge' ? (
          <dl className="manual-use-details">
            <div>
              <dt>Account</dt>
              <dd>{review.account.email}</dd>
            </div>
            <div>
              <dt>Codex home</dt>
              <dd title={review.profile.codexHome}>
                {review.profile.name} · {formatHomePathForDisplay(review.profile.codexHome)}
              </dd>
            </div>
            <div>
              <dt>Credit ID</dt>
              <dd className="manual-use-identity">{review.credit.id}</dd>
            </div>
            <div>
              <dt>Expires</dt>
              <dd>
                {formatExpiry(review.credit.expiresAt)}
                <small>{new Date(review.credit.expiresAt * 1_000).toISOString()}</small>
              </dd>
            </div>
          </dl>
        ) : null}

        {stage === 'challenge' && challenge ? (
          <div className="manual-use-challenge">
            <p>Type this phrase exactly:</p>
            <code>{challenge.confirmationPrompt}</code>
            <label>
              <span>Exact confirmation phrase</span>
              <input
                ref={challengeInput}
                value={response}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setResponse(event.currentTarget.value)}
                disabled={busy}
              />
            </label>
          </div>
        ) : null}

        {stage === 'result' && result ? (
          <div className={`manual-use-result outcome-${result.outcome}`}>
            <strong>{outcomeLabel(result.outcome)}</strong>
            <span>{result.message}</span>
          </div>
        ) : null}

        {error ? (
          <div className="manual-use-error" role="alert">
            {error}
          </div>
        ) : null}

        <footer>
          {stage === 'review' ? (
            <>
              <button type="button" className="secondary-button" onClick={() => void close()}>
                Cancel
              </button>
              <button
                type="button"
                className="manual-use-continue"
                disabled={busy}
                onClick={() => void acknowledgeDetails()}
              >
                I reviewed these exact details
              </button>
            </>
          ) : null}
          {stage === 'challenge' && challenge ? (
            <>
              <button type="button" className="secondary-button" onClick={() => void close()}>
                Cancel
              </button>
              <button
                type="button"
                className="manual-use-confirm"
                disabled={busy || response !== challenge.confirmationPrompt}
                onClick={() => void confirmExactUse()}
              >
                Use this exact reset now
              </button>
            </>
          ) : null}
          {stage === 'result' || stage === 'failed' ? (
            <button type="button" className="secondary-button" onClick={onClose}>
              Close
            </button>
          ) : null}
        </footer>
      </section>
    </div>
  )
}

function formatExpiry(expiresAt: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'full',
    timeStyle: 'long'
  }).format(new Date(expiresAt * 1_000))
}

function outcomeLabel(outcome: ManualUseResult['outcome']): string {
  if (outcome === 'reset') return 'Reset used'
  if (outcome === 'alreadyRedeemed') return 'Already used'
  if (outcome === 'nothingToReset') return 'Usage did not need resetting'
  return 'Reset unavailable'
}

function errorMessage(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason)
  return message.replace(/^Error invoking remote method '[^']+': Error: /, '')
}
