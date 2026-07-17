#!/usr/bin/env bash

set -euo pipefail

release_directory="${1:-release}"
app="$release_directory/mac-universal/Reset Net.app"

verify_app() {
  local candidate="$1"
  local executable="$candidate/Contents/MacOS/Reset Net"
  local architectures
  local signature
  local team_identifier

  if [[ ! -x "$executable" ]]; then
    echo "App executable is missing: $executable" >&2
    exit 1
  fi

  architectures="$(lipo -archs "$executable")"
  if [[ " $architectures " != *" x86_64 "* || " $architectures " != *" arm64 "* ]]; then
    echo "App is not universal (x86_64 + arm64): $candidate ($architectures)" >&2
    exit 1
  fi

  codesign --verify --deep --strict --verbose=2 "$candidate"
  signature="$(codesign --display --verbose=4 "$candidate" 2>&1)"
  if ! grep -q '^Authority=Developer ID Application:' <<< "$signature"; then
    echo "App is not signed with a Developer ID Application certificate: $candidate" >&2
    exit 1
  fi

  team_identifier="$(sed -n 's/^TeamIdentifier=//p' <<< "$signature")"
  if [[ -z "$team_identifier" || "$team_identifier" == 'not set' ]]; then
    echo "Signed app has no Apple team identifier: $candidate" >&2
    exit 1
  fi

  if ! grep -Eq '^CodeDirectory .*flags=.*\(runtime\)' <<< "$signature"; then
    echo "Signed app does not have the hardened runtime enabled: $candidate" >&2
    exit 1
  fi

  spctl --assess --type execute --verbose=4 "$candidate"
  xcrun stapler validate "$candidate"
}

if [[ ! -d "$app" ]]; then
  echo "Expected universal app was not produced at $app." >&2
  exit 1
fi

verify_app "$app"

shopt -s nullglob
dmgs=("$release_directory"/Reset-Net-*-mac-universal.dmg)
zips=("$release_directory"/Reset-Net-*-mac-universal.zip)
if (( ${#dmgs[@]} != 1 || ${#zips[@]} != 1 )); then
  echo 'Expected exactly one universal DMG and one universal ZIP.' >&2
  exit 1
fi

mount_directory="$(mktemp -d)"
zip_directory="$(mktemp -d)"
mounted=0

cleanup() {
  if (( mounted == 1 )); then
    hdiutil detach "$mount_directory" -quiet || true
  fi
  rm -rf -- "$mount_directory" "$zip_directory"
}
trap cleanup EXIT

hdiutil attach "${dmgs[0]}" -nobrowse -readonly -mountpoint "$mount_directory" -quiet
mounted=1
verify_app "$mount_directory/Reset Net.app"
hdiutil detach "$mount_directory" -quiet
mounted=0

ditto -x -k "${zips[0]}" "$zip_directory"
verify_app "$zip_directory/Reset Net.app"

shasum -a 256 "${dmgs[0]}" "${zips[0]}" > "$release_directory/SHA256SUMS-macos.txt"
