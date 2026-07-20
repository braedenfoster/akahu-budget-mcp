# 03 — Transaction sync + list/search + refresh + nightly cron

**What to build:** Transactions from Akahu are cached in sqlite and queryable via `list_transactions` and `search_transactions`; a `refresh` tool syncs on demand and a nightly job syncs automatically — all without ever double-counting. This ticket owns the sync invariants (Seam 2). See ADR-0005 (sync + storage) and `CONTEXT.md`.

**Blocked by:** 02.

**Status:** ready-for-agent

- [ ] `transactions` table stores typed columns for querying (`akahu_id`, `account_id`, `date`, `amount` in cents, `currency`, `description`, `merchant`, `akahu_category_id`, `type`, `pending`) **plus** the full `raw` Akahu payload as JSON. `sync_state` holds a per-Connection cursor.
- [ ] Sync is incremental (since cursor) with **idempotent upserts keyed on Akahu txn `_id`**; pending→settled applied as updates, never delete-and-reinsert; never deletes; history retained indefinitely.
- [ ] `refresh` tool triggers an immediate incremental sync and reports what changed; a `node-cron` in-process job runs it nightly.
- [ ] `list_transactions` filters by Period, Account, Member, merchant, amount range; `search_transactions` does text search; both stamp `data-as-of`.
- [ ] Seam 2 invariant tests: re-syncing overlapping windows produces **no double-counting**; a pending txn that settles updates in place; balance snapshots continue to accrue.
