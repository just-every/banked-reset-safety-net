# Banked-reset use safety contract

Using a banked reset is irreversible. Banked Reset Safety Net keeps discovery, notifications, and
redemption in separate code paths, defaults every profile to read-only behavior, and applies the
checks below before the only production consume call.

## Discovery and notifications cannot redeem

Normal refreshes call only `account/rateLimits/read`. They update normal-usage percentages, reset
times, banked-expiry countdowns, and the advisory pace projection, but cannot select or consume a
credit. The CLI probe used during development calls the same read method and has no consume path.

Expiry-warning selection reads the same in-memory refresh results. Native notification clicks only
show the application window. Neither warning selection nor delivery imports or calls the
redemption executor.

## Shared authorization checks

Every new automatic or manual request must retain all of these:

1. the profile is enabled and its settings revision is unchanged;
2. the target is the earliest available `codexRateLimits` credit;
3. two fresh snapshots return the same exact credit ID, expiry, type, and `available` status;
4. `account/read` returns a ChatGPT email whose SHA-256 fingerprint matches the authorized account;
5. the app-server reports the same canonical `CODEX_HOME`;
6. no other process holds the lock for the backend credit and expiry;
7. the ledger has no terminal outcome for that credit;
8. the request uses the one durable idempotency key for that exact backend identity; and
9. a synchronous authorization callback repeats the applicable checks immediately before the sole
   JSON-RPC write.

Automatic authorization additionally requires the per-profile **Use automatically** switch and a
time at or after `expiry − lead time`, before expiry, with no more than 60 minutes remaining. Those
timing checks run again immediately before the write.

Manual authorization may bypass only those automatic switch and timing requirements. It requires
a prepared authorization from the two-confirmation challenge below. All shared checks still apply.

The consumer API requires a non-empty credit ID. Banked Reset Safety Net never asks the backend to
choose an unspecified "next" credit.

## Durable idempotency

Before sending a request, Banked Reset Safety Net derives one deterministic UUID from the backend
credit ID and expiry. The identity does not include the local profile, so two `CODEX_HOME`s exposing
the same account credit reuse the same UUID. If the app loses the response after sending, it can
retry the same logical attempt rather than constructing a second attempt.

An atomic lock file keyed by the same identity is held from fresh revalidation through persisted
outcome handling. It fences overlapping profiles and processes. A dead process's valid lock can be
recovered; a live or malformed lock fails closed.

The backend outcomes are handled explicitly:

- `reset`: mark complete and notify;
- `alreadyRedeemed`: treat the same idempotent attempt as complete;
- `nothingToReset`: keep the credit available;
- `noCredit`: stop retrying that credit.

Unknown outcomes are errors; there is no fallback redemption path. Interrupted recovery replays
only the stored credit ID, expiry, account/home binding, authorization kind, and idempotency key.
It never substitutes another available credit. A legacy ledger record without a persisted binding
must still expose the fresh exact earliest credit before it can be retried.

## Retry timing

If an automatic request returns `nothingToReset`, Banked Reset Safety Net retries the same credit
and idempotency key every five minutes. During the final ten minutes before expiry it retries every
minute. It never acts after the recorded expiry. A manual `nothingToReset` result does not create
automatic early retries.

Only the earliest available credit can be due for a profile in one scheduler pass. Unrelated
credits remain parallel, while the same backend credit is serialized across profiles.

## User-visible controls

- Automatic use is off by default.
- Enabling it requires a dedicated confirmation naming the profile and lead time.
- Lead time is constrained to 1–60 whole minutes.
- Changing `CODEX_HOME`, lead time, or tracking state disables automatic use and requires fresh
  authorization.
- Disabling tracking or automatic use removes the profile from future new automatic attempts.
- An uncertain request that may already have reached Codex remains eligible only for exact,
  idempotent recovery under the stored account/home binding.
- Activity is persisted locally and shown in the app.

## Manual early-use challenge

Only the earliest available row exposes **Use now…**. Preparing it performs a fresh account and
rate-limit snapshot, then binds an in-memory review to the exact profile, ChatGPT email, SHA-256
account fingerprint, canonical home, credit ID/type/expiry, and settings revision.

The first confirmation is the button **I reviewed these exact details**. It changes the
main-process challenge state and produces a generated phrase. The second confirmation requires
typing that phrase exactly; the irreversible button is disabled for any case, spacing, or content
difference. Review challenges expire after two minutes, typed challenges after one minute, and
each challenge is single-use. At most 100 can exist concurrently.

The email is displayed but never persisted. API-key sessions fail closed because they do not
provide a stable, non-secret account identity to bind to the review. Closing the dialog cancels a
non-consuming challenge; once the sole write starts, it cannot be cancelled or submitted again.

## Advisory expiry warnings

Warnings default on and are independently switchable. They are due 24 hours before exact expiry
and at the configured safety cutoff. Durable deduplication uses exact credit type, ID, and expiry
across all homes. A later-stage catch-up supersedes an earlier missed stage, and a stage is recorded
only after the native system reports delivery.

Unsupported and failed native delivery remain visible in Settings. Failures retry after a bounded
delay; notification-state failures never stop discovery, automation, or manual guards. Warning
delivery cannot redeem.

## Test boundary

Production discovery and the documented UI are validated against live, read-only Codex data.
Automatic and manual redemption behavior, malformed IPC, concurrent challenges, account/home and
settings changes, symlink retargeting, ledger migration/recovery, notification failures, and
renderer confirmations are covered by the automated suites. Packaging smoke tests use isolated
homes and assert an empty redemption ledger. No consume method was called while implementing or
testing v1.0.
