# Sync and storage: nightly incremental, raw-plus-typed, integer cents, keep forever

Akahu Personal App data only refreshes upstream ~once daily, so a `node-cron` job on the Pi syncs **once nightly**, pulling **incrementally** (transactions since the last cursor) into sqlite; a `force` refresh tool covers "check now." All tools then read from sqlite instantly. Transactions are stored with **typed columns for querying plus the full raw Akahu payload as JSON**, money as **integer minor units (cents) + currency**, and we **never delete** and **keep history forever**.

## Considered Options

- **Lazy TTL only** / **manual refresh only** — rejected: the first daily read pays a slow round-trip, or you routinely query stale data unknowingly.

## Consequences

- Upserts are **idempotent, keyed on Akahu's transaction `_id`**; pending→settled and re-categorizations are updates, never delete-and-reinsert. This is a first-class tested invariant (re-syncing overlapping windows must never double-count spend).
- Keeping `raw` JSON lets us **re-derive** Budget Categories when Mapping Rules change or Akahu improves enrichment, without re-hitting the API.
- History accumulates on the Pi beyond Akahu's ~90-day window, powering trend reports.
- **Daily balance snapshots are captured from V1** (one cheap row per Account per day) so the deferred cashflow feature (ADR-0004) launches with history instead of none.
