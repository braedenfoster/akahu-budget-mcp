# 07: Household-local dates for Periods and Transactions

**What to build:** Period resolution and Transaction dates use the calendar date in the Household time zone (`household_timezone`, default `Pacific/Auckland`), not the UTC date. This keeps `get_budget` and the Spending allowance on the same Period, and it puts each Transaction on its real day.

**Blocked by:** none

**Status:** shipped

## Problem

1. `resolvePeriod` picks the current Period from the UTC date. The Spending allowance picks it from the NZ date. From NZ midnight until 1pm on the Period start day (NZDT), `get_budget` returns the previous Period and the allowance returns the new one. `evaluate_purchase` counts `days_left` from the UTC date too.
2. Akahu sends each Transaction date as NZ midnight in UTC, for example `2026-10-15T11:00:00.000Z` for 16 Oct. The sync cuts the string to `2026-10-15`. On the Pi, 3,041 of about 3,085 Transactions are one day early. So a purchase on the first day of a Period counts in the previous Period.

## Acceptance criteria

- [x] With no `period` input, every tool resolves the current Period from local today in `household_timezone`
- [x] `evaluate_purchase` counts `days_left` from local today
- [x] The sync stores each Transaction date as the local calendar date of Akahu's `date` instant
- [x] A migration recalculates the date of every stored Transaction from its raw Akahu `date`
- [x] ADR-0011 no longer says that other tools keep UTC Period resolution

## Test seams

- Seam 1 (`invokeTool`, fixed clock): near NZ midnight on the Period start day, `get_budget` with no `period` returns the same Period as its `spending_allowance`. `evaluate_purchase` returns `days_left` from local today.
- Sync seam (`syncTransactions` with the fake Akahu client, read back through a tool): an Akahu date at NZ midnight shows as the next UTC day.
- Migration seam (prior art: the 0008 test in `15-category-kind.test.ts`): a row stored with the old cut date has the local date after migrating.

## Rollout

Deploy together with `BUDGET_MONTH_START_DAY=15` in the Pi's `.env`, so the Pi restarts once. Back up the database before the restart.

Migration 0009 calls `local_date()`, a JS function that `openDb` registers. Run it only through the server startup or `pnpm db:migrate`. The `sqlite3` CLI and `drizzle-kit migrate` cannot run it.

Out of scope: balance snapshots (`src/sync/accounts.ts`) keep the UTC date. The 2am sync labels the snapshot with the previous day, which is the day the balance closes.

## Comments

17 Oct 2026: The agent deployed `28b5eff` to the Pi together with `BUDGET_MONTH_START_DAY=15`. The database backup is `data/budget.sqlite.bak.pre-local-dates-20261017`, and the `.env` backup is `.env.bak.pre-start-day-15`. After the restart:
- `get_budget` returned Period 2026-10 as 15 Oct to 14 Nov.
- Stored Transactions on Akahu's NZ midnight have the NZ date.
- The widget route returned the same allowance as `get_budget`: +$2,568.58 ($620/week, 29 days left).

