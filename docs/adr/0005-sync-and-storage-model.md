# Sync and storage: nightly incremental, raw-plus-typed, integer cents, keep forever

Akahu Personal App data only refreshes upstream ~once daily, so a `node-cron` job on the Pi syncs **once nightly**, pulling **incrementally** (a dated window reaching back before the last successful sync) into sqlite; a `force` refresh tool covers "check now." All tools then read from sqlite instantly. Transactions are stored with **typed columns for querying plus the full raw Akahu payload as JSON**, money as **integer minor units (cents) + currency**, and we **never delete** and **keep history forever**.

## Considered Options

- **Lazy TTL only** / **manual refresh only** — rejected: the first daily read pays a slow round-trip, or you routinely query stale data unknowingly.

## Consequences

- Upserts are **idempotent, keyed on Akahu's transaction `_id`**; pending→settled and re-categorizations are updates, never delete-and-reinsert. This is a first-class tested invariant (re-syncing overlapping windows must never double-count spend).
- **The incremental watermark is a date, never a cursor.** Akahu pages newest → oldest and its cursor carries position only — not the `start` filter, and not a "new since last time" marker. Two rules follow, both pinned by tests:
  1. A cursor is **scoped to a single sync run** and is never persisted. `sync_state.cursor` is written null. Resuming a cursor left over from a finished backfill replays the oldest page of history forever while reporting success — this silently froze ingestion for two weeks in Aug 2026.
  2. `start` is **repeated on every page request**. Following a cursor without it reopens the query to all history from page 2 onward.
- Each run asks for `last_synced_at` minus `SYNC_OVERLAP_DAYS` (7) so late-posted and newly-settled transactions are re-seen; the idempotent upsert makes the overlap free. The watermark advances only after a window drains without throwing, so a failed run re-covers its ground.
- **A stale watermark can outlive its data.** If ingestion breaks while the watermark keeps advancing, repairing the code is not enough — rewind `sync_state.last_synced_at` to before the last known-good transaction date, or the gap is skipped permanently.
- Keeping `raw` JSON lets us **re-derive** Budget Categories when Mapping Rules change or Akahu improves enrichment, without re-hitting the API.
- History accumulates on the Pi beyond Akahu's ~90-day window, powering trend reports.
- **Daily balance snapshots are captured from V1** (one cheap row per Account per day) so the deferred cashflow feature (ADR-0004) launches with history instead of none.
