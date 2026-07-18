# Reset Net

Reset Net is a small tray/menu-bar app for Codex banked usage-limit resets. It shows the next
expiry as a live countdown, tracks multiple `CODEX_HOME` directories, and can ask Codex to use the
earliest banked reset a configurable number of minutes before it expires.

The macOS version is implemented and tested. The same Electron application is packaged for
Windows x64 and ARM64 by the release workflow.

## Install

Signed builds are published on
[GitHub Releases](https://github.com/just-every/banked-reset-safety-net/releases):

- macOS universal DMG or ZIP;
- Windows x64 NSIS installer; or
- Windows ARM64 NSIS installer.

Published macOS builds are Developer ID signed, hardened, notarized by Apple, and verified with
Gatekeeper before the release can be created. Open the DMG and drag Reset Net to Applications.
Windows artifacts are not yet Authenticode signed, so Microsoft SmartScreen may show a warning.
Place `SHA256SUMS.txt` beside the downloaded assets and run `shasum -a 256 -c SHA256SUMS.txt`
on macOS (or `sha256sum -c SHA256SUMS.txt` on Linux) to verify them.

Reset Net runs in the menu bar without a Dock icon. Click its icon/countdown to open the window;
right-click for Refresh and Quit.

## First run

1. Reset Net looks for the Codex CLI in common npm, Homebrew, ChatGPT app, and `PATH` locations.
2. It initially tracks `~/.codex` if that directory exists. Inherited `CODEX_HOME` values do not
   change the desktop app's default.
3. Use **Track another Codex home** for additional accounts or environments.
4. Leave **Use automatically** off if you only want countdowns.
5. To automate a home, set the lead time (30 minutes by default), enable **Use automatically**, and
   accept the explicit confirmation.
6. Enable **Launch in the tray when I sign in** so a sleeping or restarted computer can resume the
   schedule. Reset Net must be running to act.

Every new profile starts with automatic use disabled. Changing a profile's `CODEX_HOME` also forces
automatic use off.

## How it talks to Codex

Reset Net launches the user's installed CLI as:

```text
CODEX_HOME=/path/to/home codex app-server --stdio
```

It uses the CLI's structured JSON-RPC API rather than replaying arrow keys in the terminal UI:

- `account/rateLimits/read` discovers reset IDs and Unix expiry timestamps.
- `account/rateLimitResetCredit/consume` is isolated to the automatic-use runner.
- Every consume request includes the exact credit ID and a durable UUID idempotency key.
- Automatic requests are hard-limited to the final 60 minutes and hold an exclusive cross-process
  lock keyed by the backend credit and expiry.

Reset Net never reads or copies `auth.json`; authentication remains owned by the Codex CLI. Version
`0.144.5` is the tested baseline because it exposes detailed reset credits and the consume endpoint.

See [docs/SAFETY.md](docs/SAFETY.md) for the full redemption contract and retry behavior.

## Multiple Codex homes

Profiles are polled concurrently and use separate app-server processes with separate `CODEX_HOME`
environments. A profile stores only:

- display name;
- absolute Codex home path;
- tracking state;
- automatic-use state;
- lead time.

Settings and the idempotency/audit ledger live in Electron's normal per-user application-data
directory:

- macOS: `~/Library/Application Support/Reset Net/`
- Windows: `%APPDATA%\Reset Net\`

## Development

Requirements: Node.js, pnpm, and an installed Codex CLI.

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm dev
```

Run a real, read-only account probe (the app itself defaults to `~/.codex`):

```bash
pnpm probe -- --home ~/.codex
```

The probe only calls `account/rateLimits/read`; it has no call to the consume method and omits
credit IDs from its output.

Build the application locally:

```bash
pnpm build
```

Signed macOS distribution requires the project signing credentials. See
[docs/RELEASING.md](docs/RELEASING.md) before running:

```bash
pnpm dist:mac
```

On Windows, build an architecture-specific NSIS installer with:

```powershell
pnpm install
pnpm dist:win:x64
# or: pnpm dist:win:arm64
```

CI builds the macOS universal, Windows x64, and Windows ARM64 targets in parallel. A version tag
publishes a GitHub release only after every artifact and the macOS security checks pass.

## Verified in this checkout

- Codex CLI `0.144.5` with `CODEX_HOME=~/.codex`
- native CLI resolution under a Finder-style minimal `PATH`
- live read-only discovery of four banked resets
- development and packaged macOS tray UI
- renderer sandbox, context isolation, CommonJS preload bridge, and CSP
- eleven test files / thirty-three tests, including exact-credit, one-hour, lock, fail-closed ledger,
  no-auto-use, and single-click tray cases
- universal macOS and Windows x64 packaging smoke tests
- deterministic macOS and Windows icons generated from the checked-in logo source

No live redemption was attempted during development, packaging, or testing.
