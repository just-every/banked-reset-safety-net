#!/usr/bin/env bash

set -euo pipefail

architecture="${1:-}"
release_directory="${2:-release}"
project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

case "$architecture" in
  x64)
    expected_machine='Advanced Micro Devices X86-64'
    expected_host='x86_64'
    metadata_name='latest-linux.yml'
    expected_channel='latest'
    ;;
  arm64)
    expected_machine='AArch64'
    expected_host='aarch64'
    metadata_name='latest-arm64-linux-arm64.yml'
    expected_channel='latest-arm64'
    ;;
  *)
    echo 'Usage: verify-linux-artifacts.sh <x64|arm64> [release-directory]' >&2
    exit 2
    ;;
esac

case "$release_directory" in
  /*) ;;
  *) release_directory="$project_root/$release_directory" ;;
esac

artifact_name="Banked-Reset-Safety-Net-linux-$architecture.AppImage"
app_image="$release_directory/$artifact_name"
metadata="$release_directory/$metadata_name"
host_architecture="$(uname -m)"

if [[ "$host_architecture" != "$expected_host" ]]; then
  echo "Linux $architecture verification requires a native $expected_host runner; found $host_architecture." >&2
  exit 1
fi

if [[ ! -s "$app_image" || ! -x "$app_image" ]]; then
  echo "Expected a non-empty executable AppImage at $app_image." >&2
  exit 1
fi

if [[ ! -s "$metadata" ]]; then
  echo "Expected Linux $architecture update metadata at $metadata." >&2
  exit 1
fi

machine="$(LC_ALL=C readelf -h "$app_image" | sed -n 's/^[[:space:]]*Machine:[[:space:]]*//p')"
if [[ "$machine" != "$expected_machine" ]]; then
  echo "AppImage machine is '$machine'; expected '$expected_machine' for $architecture." >&2
  exit 1
fi

version="$(node -p "JSON.parse(require('node:fs').readFileSync('$project_root/package.json', 'utf8')).version")"
if ! grep -Fq "version: $version" "$metadata" || ! grep -Fq "$artifact_name" "$metadata"; then
  echo "$metadata_name does not target version $version and $artifact_name." >&2
  exit 1
fi

temporary_root="$(mktemp -d)"
cleanup() {
  rm -rf -- "$temporary_root"
}
trap cleanup EXIT

extract_directory="$temporary_root/extract"
mkdir -p "$extract_directory"
(
  cd "$extract_directory"
  "$app_image" --appimage-extract >"$temporary_root/extract.log" 2>&1
)

app_root="$extract_directory/squashfs-root"
packaged_executable="$app_root/banked-reset-safety-net"
packaged_asar="$app_root/resources/app.asar"
packaged_update_config="$app_root/resources/app-update.yml"
mapfile -t desktop_entries < <(find "$app_root" -maxdepth 1 -type f -name '*.desktop' -print)

if [[ ! -x "$packaged_executable" || ! -s "$packaged_asar" || ! -s "$packaged_update_config" ]]; then
  echo 'The extracted AppImage is missing its executable, app.asar, or updater config.' >&2
  exit 1
fi

node --input-type=module - "$packaged_update_config" "$expected_channel" <<'NODE'
import { readFile } from 'node:fs/promises'

const [configPath, expectedChannel] = process.argv.slice(2)
const config = await readFile(configPath, 'utf8')
for (const expected of [
  'provider: github',
  'owner: just-every',
  'repo: banked-reset-safety-net',
  `channel: ${expectedChannel}`
]) {
  if (!config.split(/\r?\n/u).includes(expected)) {
    throw new Error(`Packaged updater config is missing ${JSON.stringify(expected)}.`)
  }
}
NODE

if (( ${#desktop_entries[@]} != 1 )); then
  echo "Expected exactly one AppImage desktop entry, found ${#desktop_entries[@]}." >&2
  exit 1
fi

if ! grep -Fq 'Name=Banked Reset Safety Net' "${desktop_entries[0]}" ||
  ! grep -Fq 'Categories=Utility;' "${desktop_entries[0]}"; then
  echo "The AppImage desktop entry has unexpected product metadata: ${desktop_entries[0]}" >&2
  exit 1
fi

if ! command -v xvfb-run >/dev/null || ! command -v timeout >/dev/null; then
  echo 'xvfb-run and timeout are required for the native Linux smoke test.' >&2
  exit 1
fi

smoke_home="$temporary_root/home"
smoke_user_data="$temporary_root/user-data"
smoke_log="$temporary_root/smoke.log"
mkdir -p "$smoke_home" "$smoke_user_data"

set +e
timeout --kill-after=5s 14s \
  env -u CODEX_HOME \
  HOME="$smoke_home" \
  XDG_CONFIG_HOME="$smoke_home/.config" \
  PATH='/usr/bin:/bin' \
  BANKED_RESET_SAFETY_NET_USER_DATA="$smoke_user_data" \
  xvfb-run -a --server-args='-screen 0 1280x1024x24' "$app_image" \
  >"$smoke_log" 2>&1
smoke_status=$?
set -e

if (( smoke_status != 124 )); then
  echo "The native AppImage exited before the isolated smoke window (status $smoke_status)." >&2
  cat "$smoke_log" >&2
  exit 1
fi

node --input-type=module - \
  "$smoke_user_data/settings.json" \
  "$smoke_user_data/automation-ledger.json" \
  "$smoke_user_data/notification-state.json" <<'NODE'
import { readFile } from 'node:fs/promises'

const [settingsPath, ledgerPath, notificationsPath] = process.argv.slice(2)
const [settings, ledger, notifications] = await Promise.all(
  [settingsPath, ledgerPath, notificationsPath].map(
    async (file) => JSON.parse(await readFile(file, 'utf8'))
  )
)

if (!Array.isArray(settings.profiles) || settings.profiles.length !== 0) {
  throw new Error('The isolated Linux smoke test unexpectedly discovered a Codex home.')
}
if (settings.expiryWarningsEnabled !== true) {
  throw new Error('The isolated Linux smoke test did not default expiry warnings on.')
}
if (
  typeof ledger.records !== 'object' ||
  ledger.records === null ||
  Object.keys(ledger.records).length !== 0 ||
  !Array.isArray(ledger.events) ||
  ledger.events.length !== 0
) {
  throw new Error('The isolated Linux smoke test wrote redemption activity.')
}
if (
  notifications.version !== 1 ||
  typeof notifications.records !== 'object' ||
  notifications.records === null ||
  Object.keys(notifications.records).length !== 0
) {
  throw new Error('The isolated Linux smoke test wrote unexpected notification state.')
}
NODE

(
  cd "$release_directory"
  sha256sum "$artifact_name" "$metadata_name" >"SHA256SUMS-linux-$architecture.txt"
)

echo "Verified Linux $architecture AppImage, updater channel, isolated startup, warnings, and empty redemption ledger."
