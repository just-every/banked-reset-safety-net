# Releasing Banked Reset Safety Net

The release workflow builds three platform targets in parallel: a universal macOS app, a Windows
x64 installer, and a Windows ARM64 installer. A GitHub release is published only after every target
succeeds and the macOS app passes Developer ID signature, Gatekeeper, and notarization-ticket
checks. Each platform job also produces the update metadata and blockmaps consumed by the installed
app.

Manual workflow runs build, assemble, checksum, and retain the complete release bundle for inspection. They do not publish a release unless the selected ref is a version tag.

## One-time Apple setup

The macOS job deliberately fails before building if any signing or notarization credential is missing.

1. In Keychain Access, create a certificate signing request.
2. In the Apple Developer portal, [create a **Developer ID Application** certificate](https://developer.apple.com/help/account/certificates/create-developer-id-certificates/) from that request. The Apple Account Holder must perform this step.
3. Install the downloaded certificate on the Mac that created the request. In Keychain Access, confirm the certificate has its private key, then export the identity as a password-protected `.p12` file.
4. In App Store Connect, create a team API key with the **Developer** role for
   [notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution).
   Save the `.p8` file when it is offered; Apple permits downloading it only once. Record the Key
   ID and Issuer ID.

An installer certificate is not needed because the macOS deliverables are a signed application inside a DMG and ZIP, not a `.pkg` installer.

## Configure GitHub Actions secrets

From a trusted Mac with GitHub CLI authenticated for `just-every/banked-reset-safety-net`, set the secrets below. The certificate and API key are base64 encoded so GitHub can store their binary contents exactly.

```bash
base64 < /secure/path/DeveloperIDApplication.p12 | tr -d '\n' | gh secret set MAC_CSC_LINK --repo just-every/banked-reset-safety-net
gh secret set MAC_CSC_KEY_PASSWORD --repo just-every/banked-reset-safety-net
base64 < /secure/path/AuthKey_KEYID.p8 | tr -d '\n' | gh secret set APPLE_API_KEY_P8 --repo just-every/banked-reset-safety-net
gh secret set APPLE_API_KEY_ID --repo just-every/banked-reset-safety-net
gh secret set APPLE_API_ISSUER --repo just-every/banked-reset-safety-net
```

The interactive `gh secret set` commands prompt for the value without putting it in shell history. Do not commit the `.p12`, `.p8`, their passwords, or their base64 encodings.

The required secrets are:

| Secret | Value |
| --- | --- |
| `MAC_CSC_LINK` | Base64-encoded Developer ID Application `.p12` file |
| `MAC_CSC_KEY_PASSWORD` | Password used when exporting the `.p12` file |
| `APPLE_API_KEY_P8` | Base64-encoded App Store Connect API `.p8` file |
| `APPLE_API_KEY_ID` | App Store Connect API Key ID |
| `APPLE_API_ISSUER` | App Store Connect API Issuer ID |

## Test the packaging workflow

Run **Release** from the repository's Actions page on the `main` branch. This exercises all packaging, verification, and final-bundle assembly jobs but does not create a GitHub release. Download the retained workflow artifacts and test them on clean machines.

The macOS verification step checks the unpacked app, the app mounted from the DMG, and the app extracted from the ZIP. Each copy must:

- have a strict, valid code signature;
- be signed by a Developer ID Application certificate with a team identifier;
- pass Gatekeeper assessment; and
- contain a valid stapled notarization ticket.

The Windows jobs build x64 and ARM64 targets independently on parallel, native-architecture
GitHub-hosted runners. x64 publishes `latest.yml`; ARM64 embeds the `latest-arm64` channel and
publishes `latest-arm64.yml`. This split is required because both installers share one GitHub
release. Windows artifacts are not Authenticode-signed until a Windows code-signing certificate is
added to the project, so users may see a Microsoft SmartScreen warning.

## Publish a release

1. Update `package.json` to the intended semantic version and commit the change to `main`.
2. Confirm CI and a manual Release workflow run pass.
3. Create and push the matching version tag:

```bash
release_version="$(node -p "require('./package.json').version")"
git tag -a "v${release_version}" -m "Banked Reset Safety Net v${release_version}"
git push origin "v${release_version}"
```

The workflow rejects a tag that does not exactly equal `v` followed by the `package.json` version.
Once the signed/notarized macOS job and both Windows jobs pass, it publishes one GitHub release with
the DMG, ZIP, both Windows installers, updater blockmaps and channel files, generated release notes,
and a combined `SHA256SUMS.txt` file. The release bundle verifier checks that each channel file
contains the release version and the correct architecture-specific artifact name. Manifest entries
are bare filenames, so verification runs from the directory containing the downloaded assets.

The primary download filenames intentionally omit the version. This keeps the README's
`releases/latest/download/...` links stable across releases. The Git tag, release title, app bundle,
and updater metadata retain the exact semantic version.

If a build or verification step fails, fix the cause before publishing. Do not bypass the signature, Gatekeeper, notarization, artifact-count, or checksum checks.
