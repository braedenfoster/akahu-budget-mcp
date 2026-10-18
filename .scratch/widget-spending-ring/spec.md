# Spending ring

_Vocabulary follows `CONTEXT.md` (Household, Member, Period, Envelope, Flexible, Committed, Spending allowance, Uncategorized). Also read ADR-0003 (the server owns all money math), ADR-0011 (Spending allowance) and ADR-0013 (native Android app). The native app spec is `.scratch/native-android-app/spec.md`._

## Problem

The widget and the in-app screen show how much Spending allowance is left. They do not show how much of it the Household has already spent, or whether spending is ahead of the Period.

## Solution

A ring shows the share of the Flexible allocation that is spent. A tick on the ring shows how far through the Period the Household is. The widget shows the ring at its right edge. The in-app screen shows the same ring next to the headline amount.

## User stories

1. As a Member, I want a ring on the widget that fills as the Household spends, so that I see the spent share at a glance.
2. As a Member, I want the same ring in the app, so that the widget and the app agree.
3. As a Member, I want a tick on the ring at today's point in the Period, so that I see if spending is ahead of pace.
4. As a Member, I want a full ring in the error colour when the Spending allowance is over, so that "over" is obvious.
5. As a Member, I want a grey ring when the data is stale, so that the ring matches the greyed number.

## Decisions

### Server

- `computeSpendingAllowance` adds two fields. `/api/spending-allowance` and `get_budget` both return them, from the same function (ADR-0013).
  - `flexible_allocated_cents`: the sum of the Flexible Envelopes' allocations in the Period. Uncategorized and Committed Envelopes do not count. Null when there is no Budget. `computeAllocatedByKind` already computes this sum. Use one code path for both.
  - `period_days`: the number of days in the Period. Present in every state, including no Budget.
- The contract fixtures are regenerated with `UPDATE_CONTRACTS=1 pnpm test`.

### App

- The app does no money math (ADR-0003). It only turns server values into ring angles. It never displays a money figure that it derived.
- Spent fraction: `1 − amount_cents ÷ flexible_allocated_cents`, limited to 0..1.
  - A negative `amount_cents` gives a full ring.
  - The fraction counts Committed overspend and Uncategorized spend as spent, because they already reduce the Spending allowance.
- Pace fraction: `(period_days − days_left) ÷ period_days`, limited to 0..1.
- The ring states:

| State | Ring |
|---|---|
| ok | Fill = spent fraction, normal colour |
| over | Full, error colour |
| stale | Fill = spent fraction, grey (like the greyed number) |
| no budget | No ring |
| signed out | No ring |
| tap to load / nothing cached | No ring |
| `flexible_allocated_cents` is 0 or null | No ring |

- The offline mark does not change the ring. It keeps the ring of the cached response.
- The tick shows in every state that shows a ring.

### Widget

- Glance has no determinate circular indicator. The widget draws the ring on a bitmap and shows it as an image at the right edge of the row.
- The ring must stay legible at about 3×1 and when resized.
- If the widget is narrower than 240dp, the widget hides the ring. At 2 cells (about 196dp on a Pixel 8 Pro), the ring made the amount wrap onto two lines. The amount is more important than the ring.

### In-app screen

- The screen draws the ring with a Compose `Canvas`, next to the headline amount.

## Testing

- **Server (contract seam):** the fixture test checks the two new fields in every state. Add engine tests for `flexible_allocated_cents` (Flexible only, Uncategorized excluded) and `period_days` (pay-cycle Period).
- **App (JVM):** pure functions map a cached response to the ring model (fill, tick, colour role, or no ring). Test every row of the ring state table, the clamps, and the zero-allocation case.
- **Manual:** check the ring on both phones at 3×1 and resized, against `get_budget`.

## Out of scope

- A ring for any single Envelope.
- Animations.
- Any change to the Spending allowance figure.
