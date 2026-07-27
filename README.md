# Banked Reset Safety Net

Banked Reset Safety Net is a cross-platform tray/menu-bar app for Codex usage windows and banked
usage-limit resets. It shows how much normal usage remains, when each normal window resets, whether
current use is ahead of or behind a time-based pace, and when every banked reset should be used
before expiry.

## Download the latest release

| **macOS** | **Windows** | **Linux** |
|:--|:--|:--|
| [**Download universal DMG →**][download-macos] | [**Download x64 →**][download-windows-x64]<br>[Download ARM64 →][download-windows-arm64] | [**Download x64 AppImage →**][download-linux-x64]<br>[Download ARM64 AppImage →][download-linux-arm64] |
| Signed, notarized, and ready for Apple silicon or Intel. | Native installers for x64 and ARM64 PCs. | Portable AppImages for x64 and ARM64 systems. |

**[Checksums and all release files →][download-all]**

The macOS version runs in the menu bar. The same Electron application is packaged for Windows and
Linux on x64 and ARM64.

## What it looks like

The status view focuses on one tracked Codex home at a time. Compact selectable rows keep every
home visible with its current percentage used, over/on/under-pace state, pace delta, and next
scheduled-reset countdown. When automatic use is enabled, an earlier banked-reset safety cutoff
takes priority over the normal reset. The active home then gets a large exact countdown before its
usage gauge.

<img src="docs/screenshots/usage-rhythm-overview.png" width="720" alt="Banked Reset Safety Net usage rhythm overview">

The center is a browsable local-time calendar. OpenAI-applied resets, confirmed banked-reset uses,
future scheduled resets, recommended banked-reset use dates, and final expiries use distinct
markers. A durable recent-history list keeps exact times and records schedule movement directly
below the calendar.

<img src="docs/screenshots/usage-rhythm-calendar.png" width="720" alt="Banked Reset Safety Net reset calendar and banked-reset schedule">

Status and configuration now live on separate tabs, keeping normal usage and reset planning focused
while all automation controls remain together in Settings.

<img src="docs/screenshots/usage-rhythm-settings.png" width="720" alt="Banked Reset Safety Net Settings tab">

These 2x PNG screenshots use live, read-only Codex data with an isolated application-data
directory. Automatic use is off for every automatically discovered home and the lead time is the
default 30 minutes. No reset-consumption request was made while capturing them.

## Install

### Download the latest release

| **macOS** | **Windows** | **Linux** |
|:--|:--|:--|
| [**Download universal DMG →**][download-macos] | [**Download x64 →**][download-windows-x64]<br>[Download ARM64 →][download-windows-arm64] | [**Download x64 AppImage →**][download-linux-x64]<br>[Download ARM64 AppImage →][download-linux-arm64] |
| Signed, notarized, and ready for Apple silicon or Intel. | Native installers for x64 and ARM64 PCs. | Portable AppImages for x64 and ARM64 systems. |

**[Checksums and all release files →][download-all]**

Published macOS builds are Developer ID signed, hardened, notarized by Apple, and verified with
Gatekeeper before the release can be created. Open the DMG and drag Banked Reset Safety Net to
Applications.
Windows artifacts are not yet Authenticode signed, so Microsoft SmartScreen may show a warning.
On Linux, make the AppImage executable (`chmod +x Banked-Reset-Safety-Net-linux-*.AppImage`) and
run it directly; it does not require root installation.
Place `SHA256SUMS.txt` beside the downloaded assets and run `shasum -a 256 -c SHA256SUMS.txt`
on macOS (or `sha256sum -c SHA256SUMS.txt` on Linux) to verify them.

Banked Reset Safety Net runs in the menu bar without a Dock icon. Its countdown follows the next
actual reset across connected homes: either a normal usage-window reset or, when automatic use is
enabled, a banked reset's configured safety cutoff. It does not count down to a credit expiry.
Click its icon/countdown once to open the window; right-click for Refresh and Quit.

## First run

1. Banked Reset Safety Net looks for the Codex CLI in common npm, Homebrew, ChatGPT app, and `PATH` locations.
2. It scans your user folder for `~/.codex` and sibling `.codex_*` or `.codex-*` directories.
   Inherited `CODEX_HOME` values do not change the desktop app's default.
3. Use **Scan now** after creating another Codex home, or **Track another Codex home** for a path
   elsewhere. A home you explicitly remove stays ignored by future automatic scans.
4. Leave **Use automatically** off if you only want usage and reset planning.
5. To automate a home, set the lead time (30 minutes by default), enable **Use automatically**, and
   accept the explicit confirmation.
6. Leave **Warn before a banked reset expires** on to receive the default advisory notifications.
7. Enable **Launch in the tray when I sign in** so a sleeping or restarted computer can resume the
   schedule. Banked Reset Safety Net must be running to act.

Every new profile starts with automatic use disabled. Changing a profile's `CODEX_HOME` also forces
automatic use off.

## Automatic app updates

Installed macOS, Windows, and Linux AppImage builds check the latest public GitHub release shortly
after startup and every four hours while running. A newer release downloads in the background. Banked Reset Safety Net shows the
download state in **Settings → App updates**, sends a notification when the signed package is ready,
and installs it when the app next quits. **Restart and install** applies it immediately.

Development builds never contact the update feed. macOS updates use the signed universal ZIP.
Windows and Linux use separate x64 and ARM64 feeds so an update cannot cross architectures.

## Expiry warnings

Advisory desktop warnings are enabled by default, independently of automatic use. For each
available banked reset, the running app warns:

- 24 hours before its exact expiry; and
- at its configured safety cutoff (`expiry − lead time`).

Starting the app after both thresholds produces only the more urgent cutoff warning. The same
backend credit exposed by multiple Codex homes is notified once, using its exact type, ID, and
expiry as the durable identity. Delivery state is stored in `notification-state.json`; failed
native delivery is retried on a bounded cadence rather than recorded as delivered.

The Settings page shows whether warnings are active, disabled, unsupported, or failing. Clicking a
warning only opens Banked Reset Safety Net for review. A notification has no path to the consume
method and never uses a reset. Warnings require the app to be running.

## Normal usage and pacing

Codex can return the standard Codex limit alongside model-specific limits. Banked Reset Safety Net
shows only the standard Codex window, keeping model-specific buckets such as GPT-5.3-Codex out of
the menu-bar view. The rhythm view reports:

- percent used and percent remaining;
- an at-a-glance status row for every tracked Codex home whose usage is available;
- a comparison bar showing actual usage against elapsed window time, with the remaining track
  showing the distance to the normal reset;
- the window length supplied by Codex;
- the exact next scheduled reset and a live countdown, distinguishing normal resets from automatic
  banked-reset safety cutoffs; and
- a time-based pace status.

For a window of duration `D` ending at `R`, Banked Reset Safety Net derives the start as `R − D`. The expected
percentage used now is the percentage of time elapsed in that window. Actual usage more than five
percentage points above that value is **Over pace**; more than five points below is **Under pace**;
the middle band is **On pace**.

Pace is an explanatory comparison, not a guarantee about future demand. The projected full-usage
point assumes the current average rate continues. It is recalculated from each read-only refresh.

## Reset history and banked-reset planning

Each successful read-only refresh observes the standard Codex reset-window boundary used by the
status view. Model-specific rolling buckets are excluded. For a window ending at `R` with duration
`D`, the applied reset time is `R − D`. The first refresh records
the active window boundary, so the latest reset can be backfilled even if it happened while the app
was closed. Later boundary changes are appended to `reset-history.json` with the previous and new
schedule. Confirmed automatic or manual banked-reset uses remain sourced from `automation-ledger.json`, which
provides their exact credit identity and completion time. The app never invents unobserved resets.

The reset calendar is navigable by month. It plots durable applied history, the normal reset
interval supplied by Codex, each banked recommendation, and each final expiry without inventing
dates when Codex has not supplied a usable interval. Banked recommendations are spaced
between the surrounding hard resets, with multiple credits divided across the interval and each
credit's safety cutoff treated as a hard deadline. For each available reset it also shows:

- the expiry timestamp and countdown;
- `expiry − configured lead time` as the latest safe use-by point; and
- a separate **Best use** point that balances the time between resets, or uses the current
  constant-rate exhaustion projection when it comes first.

Only the earliest banked reset can use the current-window projection. Later credits are balanced
inside the normal reset interval containing their deadlines, and move earlier when necessary to
leave room for another credit. A best-use suggestion is advisory: it never changes the
automatic-use schedule. If automation is enabled, the app still acts only at the configured use-by
point inside the final 60 minutes.

The earliest available row also offers **Use now…**. This deliberately bypasses only the automatic
timing window. It first opens a fresh review showing the ChatGPT account email, canonical Codex
home, full credit ID, and exact local and UTC expiry. Continuing creates a second, short-lived typed
challenge. The final button remains disabled until that generated phrase matches exactly.

Manual early use retains the same exact-earliest-credit, fresh account/home, settings revision,
exclusive lock, durable idempotency, and immediately-before-write authorization guards as
automatic use. It fails closed for API-key sessions because they do not provide a stable,
non-secret account identity for the confirmation. See [docs/SAFETY.md](docs/SAFETY.md) for the
complete contract.

## How it talks to Codex

Banked Reset Safety Net launches the user's installed CLI as:

```text
CODEX_HOME=/path/to/home codex app-server --stdio
```

It uses the CLI's structured JSON-RPC API rather than replaying arrow keys in the terminal UI:

- `account/rateLimits/read` discovers normal usage windows, reset IDs, and Unix expiry timestamps.
- `account/read` supplies the non-secret ChatGPT account identity used by redemption guards.
- `account/rateLimitResetCredit/consume` exists at one production call site behind the shared
  guarded automatic/manual executor.
- Every consume request includes the exact credit ID and a durable UUID idempotency key.
- Automatic requests are hard-limited to the final 60 minutes. Manual requests require the
  two-confirmation challenge. Both hold an exclusive cross-process lock keyed by the backend credit
  and expiry.

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
- Linux: `$XDG_CONFIG_HOME/Reset Net/` (normally `~/.config/Reset Net/`)

That directory contains `reset-history.json` for observed usage-window boundaries,
`automation-ledger.json` for guarded banked-reset attempts and confirmed uses, and
`notification-state.json` for durable expiry-warning deduplication.

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

On Linux, build the architecture-matched AppImage with:

```bash
pnpm dist:linux:x64
# or, on ARM64: pnpm dist:linux:arm64
```

CI builds the macOS universal, Windows x64/ARM64, and Linux x64/ARM64 targets in parallel. A
version tag publishes a GitHub release only after every artifact, native Linux smoke test, updater
channel check, and macOS security check passes.

## Verified in this checkout

- Codex CLI `0.144.5` with live, read-only `account/rateLimits/read` calls
- standard and model-specific usage-bucket parsing
- multiple `CODEX_HOME` sessions polled concurrently
- development and built macOS tray UI through the real accessibility tree
- isolated first-run UI with automatic use off across automatically discovered Codex homes
- renderer sandbox, context isolation, CommonJS preload bridge, and CSP
- twenty-eight test files / 157 tests, including renderer interaction, two-confirmation manual use,
  warning selection/deduplication/delivery persistence, Linux packaging/autostart, pacing, calendar
  layout, reset history, exact-credit/account/home guards, locks, uncertain recovery, and
  no-auto-use cases
- deterministic macOS, Windows, and Linux icons generated from the checked-in logo source
- native x64 and ARM64 AppImage packaging contracts with isolated startup, empty-ledger, default
  warning, updater-channel, and architecture checks

No live redemption was requested while implementing or testing v1.0.

[download-macos]: https://github.com/just-every/banked-reset-safety-net/releases/latest/download/Banked-Reset-Safety-Net-mac-universal.dmg
[download-windows-x64]: https://github.com/just-every/banked-reset-safety-net/releases/latest/download/Banked-Reset-Safety-Net-win-x64.exe
[download-windows-arm64]: https://github.com/just-every/banked-reset-safety-net/releases/latest/download/Banked-Reset-Safety-Net-win-arm64.exe
[download-linux-x64]: https://github.com/just-every/banked-reset-safety-net/releases/latest/download/Banked-Reset-Safety-Net-linux-x64.AppImage
[download-linux-arm64]: https://github.com/just-every/banked-reset-safety-net/releases/latest/download/Banked-Reset-Safety-Net-linux-arm64.AppImage
[download-all]: https://github.com/just-every/banked-reset-safety-net/releases/latest
