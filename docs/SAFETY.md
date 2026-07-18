# Automatic-use safety contract

Using a banked reset is irreversible. Reset Net keeps discovery and redemption in separate code
paths, defaults every profile to read-only behavior, and applies the checks below before the only
production consume call.

## Discovery cannot redeem

Normal refreshes call only `account/rateLimits/read`. They update normal-usage percentages, reset
times, banked-expiry countdowns, and the advisory pace projection, but cannot select or consume a
credit. The CLI probe used during development calls the same read method and has no consume path.

## Authorization checks

An automatic request is eligible only when all of these remain true:

1. the profile is enabled;
2. automatic use is explicitly enabled for that profile;
3. the credit is the earliest available `codexRateLimits` credit for that profile;
4. the current time is at or after `expiry − lead time` and before expiry;
5. a fresh `account/rateLimits/read` returns the same opaque credit ID;
6. the fresh credit has the same expiry timestamp, type, and `available` status;
7. the app-server reports the same canonical `CODEX_HOME` that was configured;
8. settings do not change while the request is being prepared; and
9. no more than 60 minutes remain before expiry, checked again immediately before consumption.

The consumer API requires a non-empty credit ID. Reset Net never asks the backend to choose an
unspecified "next" credit.

## Durable idempotency

Before sending a request, Reset Net derives one deterministic UUID from the backend credit ID and
expiry. The identity does not include the local profile, so two `CODEX_HOME`s exposing the same
account credit reuse the same UUID. If the app loses the response after sending, it can safely ask
about the same logical attempt rather than constructing a second attempt.

An atomic lock file keyed by the same identity is held from fresh revalidation through persisted
outcome handling. It fences overlapping profiles and processes. A dead process's valid lock can be
recovered; a live or malformed lock fails closed.

The backend outcomes are handled explicitly:

- `reset`: mark complete and notify;
- `alreadyRedeemed`: treat the same idempotent attempt as complete;
- `nothingToReset`: keep the credit and retry before expiry;
- `noCredit`: stop retrying that credit.

Unknown outcomes are errors; there is no fallback redemption path.

## Retry timing

If Codex says usage does not currently need resetting, Reset Net retries the same credit and
idempotency key every five minutes. During the final ten minutes before expiry it retries every
minute. It never acts after the recorded expiry.

Only the earliest available credit can be due for a profile in one scheduler pass. Unrelated
credits remain parallel, while the same backend credit is serialized across profiles.

## User-visible controls

- Automatic use is off by default.
- Enabling it requires a dedicated confirmation naming the profile and lead time.
- Lead time is constrained to 1–60 whole minutes.
- There is no manual redemption action. Consequently, no UI or automation path can use a reset
  more than one hour early; a future manual early-use feature must add a separate two-confirmation
  challenge bound to the exact account, credit, and expiry.
- Changing `CODEX_HOME` disables automatic use.
- Disabling tracking or automatic use removes the profile from future scheduler passes.
- Activity is persisted locally and shown in the app.

## Test boundary

Production discovery and the documented UI were tested against live, read-only `~/.codex` data.
Redemption behavior is covered by the automated test suite. No consume method was called while
implementing or capturing the usage-planning update.
