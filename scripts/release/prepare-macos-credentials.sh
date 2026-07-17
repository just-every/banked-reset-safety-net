#!/usr/bin/env bash

set -euo pipefail
umask 077

missing=()
for name in MAC_CSC_LINK CSC_KEY_PASSWORD APPLE_API_KEY_P8 APPLE_API_KEY_ID APPLE_API_ISSUER RUNNER_TEMP GITHUB_ENV; do
  if [[ -z "${!name:-}" ]]; then
    missing+=("$name")
  fi
done

if (( ${#missing[@]} > 0 )); then
  printf 'Missing required release secret or runner value(s): %s\n' "${missing[*]}" >&2
  exit 1
fi

certificate_path="$RUNNER_TEMP/developer-id-application.p12"
api_key_path="$RUNNER_TEMP/AuthKey_${APPLE_API_KEY_ID}.p8"

cleanup_failed_decode() {
  rm -f -- "$certificate_path" "$api_key_path"
}
trap cleanup_failed_decode ERR

if ! printf '%s' "$MAC_CSC_LINK" | base64 --decode > "$certificate_path"; then
  echo 'MAC_CSC_LINK is not valid base64.' >&2
  exit 1
fi

if ! printf '%s' "$APPLE_API_KEY_P8" | base64 --decode > "$api_key_path"; then
  echo 'APPLE_API_KEY_P8 is not valid base64.' >&2
  exit 1
fi

if [[ ! -s "$certificate_path" || ! -s "$api_key_path" ]]; then
  echo 'Decoded Apple credential files must not be empty.' >&2
  exit 1
fi

if ! grep -q -- '-----BEGIN PRIVATE KEY-----' "$api_key_path"; then
  echo 'APPLE_API_KEY_P8 did not decode to an App Store Connect private key.' >&2
  exit 1
fi

chmod 600 "$certificate_path" "$api_key_path"
printf 'CSC_LINK=%s\n' "$certificate_path" >> "$GITHUB_ENV"
printf 'APPLE_API_KEY=%s\n' "$api_key_path" >> "$GITHUB_ENV"

trap - ERR
