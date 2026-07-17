#!/usr/bin/env bash

set -euo pipefail

distribution_directory="${1:-dist}"
version="${2:?A package version is required.}"

dmg="$distribution_directory/Reset-Net-${version}-mac-universal.dmg"
zip="$distribution_directory/Reset-Net-${version}-mac-universal.zip"
windows_x64="$distribution_directory/Reset-Net-${version}-win-x64.exe"
windows_arm64="$distribution_directory/Reset-Net-${version}-win-arm64.exe"

for asset in "$dmg" "$zip" "$windows_x64" "$windows_arm64"; do
  if [[ ! -s "$asset" ]]; then
    echo "Required release asset is missing or empty: $asset" >&2
    exit 1
  fi
done

sha256sum "$dmg" "$zip" "$windows_x64" "$windows_arm64" > "$distribution_directory/SHA256SUMS.txt"
