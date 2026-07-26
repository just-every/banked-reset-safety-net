import { createHash } from 'node:crypto'
import path from 'node:path'
import type { RedemptionSnapshot } from '../codex/codexSession'
import { comparablePath } from '../paths'

const ACCOUNT_FINGERPRINT_NAMESPACE = 'banked-reset-net:account-binding:v1'

export interface RedemptionAccountBinding {
  accountFingerprint: string
  canonicalCodexHome: string
}

export interface DisplayableRedemptionAccount extends RedemptionAccountBinding {
  email: string
}

export function requireDisplayableRedemptionAccount(
  snapshot: RedemptionSnapshot
): DisplayableRedemptionAccount {
  const account = snapshot.account.account
  if (account?.type !== 'chatgpt') {
    throw new Error('Manual reset use requires an identifiable ChatGPT account.')
  }
  const email = account.email?.trim()
  if (!email) {
    throw new Error('Manual reset use requires Codex to report a non-empty account email.')
  }
  const normalizedEmail = email.normalize('NFKC').toLocaleLowerCase('en-US')
  return {
    email,
    accountFingerprint: fingerprintForAccount(normalizedEmail),
    canonicalCodexHome: path.normalize(snapshot.canonicalCodexHome)
  }
}

export function requireRedemptionAccountBinding(
  snapshot: RedemptionSnapshot
): RedemptionAccountBinding {
  const { accountFingerprint, canonicalCodexHome } =
    requireDisplayableRedemptionAccount(snapshot)
  return { accountFingerprint, canonicalCodexHome }
}

export function sameAccountBinding(
  left: RedemptionAccountBinding,
  right: RedemptionAccountBinding
): boolean {
  return (
    left.accountFingerprint === right.accountFingerprint &&
    comparablePath(left.canonicalCodexHome) === comparablePath(right.canonicalCodexHome)
  )
}

function fingerprintForAccount(normalizedEmail: string): string {
  return createHash('sha256')
    .update(ACCOUNT_FINGERPRINT_NAMESPACE)
    .update('\0')
    .update('chatgpt')
    .update('\0')
    .update(normalizedEmail)
    .digest('hex')
}
