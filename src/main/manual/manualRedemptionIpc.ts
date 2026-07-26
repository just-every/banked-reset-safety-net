const MAX_IDENTIFIER_LENGTH = 1_024
const MAX_CONFIRMATION_LENGTH = 128

export function parseManualPrepareArguments(
  values: unknown[]
): { profileId: string; creditId: string } {
  requireArgumentCount(values, 2)
  return {
    profileId: requireNonEmptyString(values[0], 'profileId', MAX_IDENTIFIER_LENGTH),
    creditId: requireNonEmptyString(values[1], 'creditId', MAX_IDENTIFIER_LENGTH)
  }
}

export function parseManualAcknowledgeArguments(
  values: unknown[]
): { challengeId: string } {
  requireArgumentCount(values, 1)
  return {
    challengeId: requireNonEmptyString(values[0], 'challengeId', MAX_IDENTIFIER_LENGTH)
  }
}

export function parseManualConfirmArguments(
  values: unknown[]
): { challengeId: string; exactResponse: string } {
  requireArgumentCount(values, 2)
  return {
    challengeId: requireNonEmptyString(values[0], 'challengeId', MAX_IDENTIFIER_LENGTH),
    exactResponse: requireNonEmptyString(
      values[1],
      'exactResponse',
      MAX_CONFIRMATION_LENGTH
    )
  }
}

export const parseManualCancelArguments = parseManualAcknowledgeArguments

function requireArgumentCount(values: unknown[], expected: number): void {
  if (values.length !== expected) {
    throw new Error(`Expected exactly ${expected} manual reset argument${expected === 1 ? '' : 's'}.`)
  }
}

function requireNonEmptyString(value: unknown, label: string, maximumLength: number): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximumLength) {
    throw new Error(`${label} must be a non-empty string of at most ${maximumLength} characters.`)
  }
  return value
}
