# Banked Reset Safety Net

Banked Reset Safety Net is a cross-platform tray/menu-bar app for Codex usage windows and banked
usage-limit resets. It shows how much normal usage remains, when each normal window resets, whether
current use is ahead of or behind a time-based pace, and when every banked reset should be used
before expiry.

**Download latest:** [macOS universal DMG](https://github.com/just-every/banked-reset-safety-net/releases/latest/download/Banked-Reset-Safety-Net-mac-universal.dmg) · [Windows x64](https://github.com/just-every/banked-reset-safety-net/releases/latest/download/Banked-Reset-Safety-Net-win-x64.exe) · [Windows ARM64](https://github.com/just-every/banked-reset-safety-net/releases/latest/download/Banked-Reset-Safety-Net-win-arm64.exe) · [all release files](https://github.com/just-every/banked-reset-safety-net/releases/latest)

The macOS version runs in the menu bar. The same Electron application is packaged for Windows x64
and ARM64.

## What it looks like

The top status card summarizes every usage line across every tracked Codex home. Each profile then
shows its normal usage bars and banked-reset plan.

<img src="docs/screenshots/banked-reset-safety-net-overview.png" width="420" alt="Banked Reset Safety Net usage overview">

Each banked reset has a compact row showing its safe use-by time, expiry countdown, and configured
safety margin. When current usage is projected to run out first, one optional best-use note appears.

<img src="docs/screenshots/banked-reset-safety-net-schedule.png" width="392" alt="Banked Reset Safety Net banked-reset schedule">

Status and configuration now live on separate tabs, keeping normal usage and reset planning focused
while all automation controls remain together in Settings.

<img src="docs/screenshots/banked-reset-safety-net-settings.png" width="420" alt="Banked Reset Safety Net Settings tab">

These 2x PNG screenshots use live, read-only Codex data with an isolated application-data
directory. Automatic use is off for every automatically discovered home and the lead time is the
default 30 minutes. No reset-consumption request was made while capturing them.

## Install

Signed builds are published on
[GitHub Releases](https://github.com/just-every/banked-reset-safety-net/releases):

- macOS universal DMG or ZIP;
- Windows x64 NSIS installer; or
- Windows ARM64 NSIS installer.

Published macOS builds are Developer ID signed, hardened, notarized by Apple, and verified with
Gatekeeper before the release can be created. Open the DMG and drag Banked Reset Safety Net to
Applications.
Windows artifacts are not yet Authenticode signed, so Microsoft SmartScreen may show a warning.
Place `SHA256SUMS.txt` beside the downloaded assets and run `shasum -a 256 -c SHA256SUMS.txt`
on macOS (or `sha256sum -c SHA256SUMS.txt` on Linux) to verify them.

Banked Reset Safety Net runs in the menu bar without a Dock icon. Click its icon/countdown once to open the
window; right-click for Refresh and Quit.

## First run

1. Banked Reset Safety Net looks for the Codex CLI in common npm, Homebrew, ChatGPT app, and `PATH` locations.
2. It scans your user folder for `~/.codex` and sibling `.codex_*` or `.codex-*` directories.
   Inherited `CODEX_HOME` values do not change the desktop app's default.
3. Use **Scan now** after creating another Codex home, or **Track another Codex home** for a path
   elsewhere. A home you explicitly remove stays ignored by future automatic scans.
4. Leave **Use automatically** off if you only want usage and reset planning.
5. To automate a home, set the lead time (30 minutes by default), enable **Use automatically**, and
   accept the explicit confirmation.
6. Enable **Launch in the tray when I sign in** so a sleeping or restarted computer can resume the
   schedule. Banked Reset Safety Net must be running to act.

Every new profile starts with automatic use disabled. Changing a profile's `CODEX_HOME` also forces
automatic use off.

## Automatic app updates

Installed macOS and Windows builds check the latest public GitHub release shortly after startup and
every four hours while running. A newer release downloads in the background. Banked Reset Safety Net shows the
download state in **Settings → App updates**, sends a notification when the signed package is ready,
and installs it when the app next quits. **Restart and install** applies it immediately.

Development builds never contact the update feed. macOS updates use the signed universal ZIP;
Windows x64 and ARM64 have separate feeds and installers so an update cannot cross architectures.

## Normal usage and pacing

Codex can return the standard Codex limit alongside model-specific limits. Banked Reset Safety Net
shows only the standard Codex primary and secondary windows, keeping model-specific buckets such as
GPT-5.3-Codex out of the menu-bar view. A line reports:

- percent used and percent remaining;
- the window length supplied by Codex;
- the exact normal reset time and a live countdown; and
- a time-based pace status.

For a window of duration `D` ending at `R`, Banked Reset Safety Net derives the start as `R − D`. The expected
percentage used now is the percentage of time elapsed in that window. Actual usage more than five
percentage points above that value is **Over pace**; more than five points below is **Under pace**;
the middle band is **On pace**.

Pace is an explanatory comparison, not a guarantee about future demand. The projected full-usage
point assumes the current average rate continues. It is recalculated from each read-only refresh.

## Banked-reset planning

The banked-reset schedule uses the standard Codex primary window for its advisory projection. For
each available reset it shows:

- the expiry timestamp and countdown;
- `expiry − configured lead time` as the latest safe use-by point; and
- an earlier **Best use** point when the current constant-rate projection reaches full usage before
  the natural normal reset.

Only the earliest banked reset can use that current-window projection. Later credits retain their
own use-by points, so multiple credits remain separate and visible. A best-use suggestion is
advisory: it never changes the automatic-use schedule. If automation is enabled, the app still acts
only at the configured use-by point inside the final 60 minutes.

## How it talks to Codex

Banked Reset Safety Net launches the user's installed CLI as:

```text
CODEX_HOME=/path/to/home codex app-server --stdio
```

It uses the CLI's structured JSON-RPC API rather than replaying arrow keys in the terminal UI:

- `account/rateLimits/read` discovers normal usage windows, reset IDs, and Unix expiry timestamps.
- `account/rateLimitResetCredit/consume` is isolated to the automatic-use runner.
- Every consume request includes the exact credit ID and a durable UUID idempotency key.
- Automatic requests are hard-limited to the final 60 minutes and hold an exclusive cross-process
  lock keyed by the backend credit and expiry.

Banked Reset Safety Net never reads or copies `auth.json`; authentication remains owned by the Codex CLI. Version
`0.144.5` is the tested baseline because it exposes detailed usage buckets, reset credits, and the
consume endpoint.

See [docs/SAFETY.md](docs/SAFETY.md) for the full redemption contract and retry behavior.

## Multiple Codex homes

Profiles are polled concurrently and use separate app-server processes with separate `CODEX_HOME`
environments. A profile stores only:

- display name;
- absolute Codex home path;
- tracking state;
- automatic-use state; and
- lead time.

To preserve settings and redemption locks across the product rename, application data remains in
the original directory:

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

Set `BANKED_RESET_SAFETY_NET_USER_DATA` to an isolated directory when testing first-run behavior
without touching the installed app's settings or automation ledger.

Run a real, read-only account probe (the app itself defaults to `~/.codex`):

```bash
pnpm probe -- --home ~/.codex
```

The probe only calls `account/rateLimits/read`; it has no call to the consume method and omits
credit IDs from its output. It prints the normalized normal-usage windows as well as banked expiry
details.

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

- Codex CLI `0.144.5` with live, read-only `account/rateLimits/read` calls
- standard and model-specific usage-bucket parsing
- multiple `CODEX_HOME` sessions polled concurrently
- development and built macOS tray UI through the real accessibility tree
- isolated first-run UI with automatic use off across automatically discovered Codex homes
- renderer sandbox, context isolation, CommonJS preload bridge, and CSP
- thirteen test files / forty-four tests, including pacing, planning, display filtering,
  exact-credit, one-hour, lock,
  fail-closed ledger, no-auto-use, and single-click tray cases
- deterministic macOS and Windows icons generated from the checked-in logo source

No live redemption was requested while implementing, testing, or capturing this usage-planning
update.
