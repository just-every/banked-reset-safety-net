import { APP_NAME } from '../../shared/branding'
import { formatLocalDateTime } from '../../shared/time'
import type { ExpiryWarningDeliveryRequest } from './expiryWarningRunner'

export const DESKTOP_NOTIFICATION_TEXT_MAX_BYTES = 256

export interface DesktopNotificationOptions {
  title: string
  body: string
}

export function desktopNotificationContent(
  request: ExpiryWarningDeliveryRequest
): DesktopNotificationOptions {
  const title =
    request.stage === 'day-before'
      ? 'Banked reset expires within 24 hours'
      : 'Banked reset use-by time reached'
  const expiry = formatLocalDateTime(request.candidate.expiresAt)
  const suffix = ` expires at ${expiry}. Open ${APP_NAME} to review.`
  const separator = ' for '
  const variableBudget =
    DESKTOP_NOTIFICATION_TEXT_MAX_BYTES -
    Buffer.byteLength(separator, 'utf8') -
    Buffer.byteLength(suffix, 'utf8')
  const creditTitle = cleanLabel(request.candidate.creditTitle) || 'Banked reset'
  const profileNames = uniqueProfileNames(request.candidate.profileNames)

  const initialTitle = truncateUtf8(
    creditTitle,
    Math.min(Buffer.byteLength(creditTitle, 'utf8'), Math.floor(variableBudget / 2))
  )
  const profileLabel = fitProfileNames(
    profileNames,
    variableBudget - Buffer.byteLength(initialTitle, 'utf8')
  )
  const fittedTitle = truncateUtf8(
    creditTitle,
    variableBudget - Buffer.byteLength(profileLabel, 'utf8')
  )
  const body = `${fittedTitle}${separator}${profileLabel}${suffix}`

  return {
    title: truncateUtf8(title, DESKTOP_NOTIFICATION_TEXT_MAX_BYTES),
    body: truncateUtf8(body, DESKTOP_NOTIFICATION_TEXT_MAX_BYTES)
  }
}

function uniqueProfileNames(profileNames: string[]): string[] {
  const unique = new Set<string>()
  for (const profileName of profileNames) {
    const cleaned = cleanLabel(profileName)
    if (cleaned) unique.add(cleaned)
  }
  return [...unique]
}

function fitProfileNames(profileNames: string[], maxBytes: number): string {
  if (profileNames.length === 0) {
    return truncateUtf8('configured profiles', maxBytes)
  }

  const fullList = profileNames.join(', ')
  if (Buffer.byteLength(fullList, 'utf8') <= maxBytes) return fullList
  if (profileNames.length === 1) return truncateUtf8(profileNames[0], maxBytes)

  for (let included = profileNames.length - 1; included >= 1; included -= 1) {
    const omitted = profileNames.length - included
    const candidate = `${profileNames.slice(0, included).join(', ')} +${omitted} more`
    if (Buffer.byteLength(candidate, 'utf8') <= maxBytes) return candidate
  }

  const omittedSuffix = ` +${profileNames.length - 1} more`
  const nameBudget = maxBytes - Buffer.byteLength(omittedSuffix, 'utf8')
  if (nameBudget > 0) {
    return `${truncateUtf8(profileNames[0], nameBudget)}${omittedSuffix}`
  }
  return truncateUtf8(`${profileNames.length} profiles`, maxBytes)
}

function cleanLabel(value: string | null): string {
  return (value ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (maxBytes <= 0) return ''
  if (Buffer.byteLength(value, 'utf8') <= maxBytes) return value

  const ellipsis = '…'
  const ellipsisBytes = Buffer.byteLength(ellipsis, 'utf8')
  const contentBudget = maxBytes >= ellipsisBytes ? maxBytes - ellipsisBytes : maxBytes
  let result = ''
  let bytes = 0

  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, 'utf8')
    if (bytes + characterBytes > contentBudget) break
    result += character
    bytes += characterBytes
  }

  return maxBytes >= ellipsisBytes ? `${result}${ellipsis}` : result
}
