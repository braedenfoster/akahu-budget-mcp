# Bills are detected, then confirmed by a Member

Upcoming Bills come from a **stored list of confirmed Bills**, not from live detection over Transaction history. The server detects repeating debits (steady merchant or description, steady cadence, steady amount) and proposes them as **Bill candidates**; a Member confirms a candidate through Claude, which stores the Bill with its cadence, due day, expected amount, and a matcher rule. Only confirmed Bills reach the app and widget. Paid status comes from matching later debits to the stored Bill with the same matcher Income Rules use (merchant / description / Akahu `type` / Akahu group), so automatic payments that carry only an "AP#..." description and a `STANDING ORDER` or `LOAN` type can still be recognised.

## Considered Options

- **Detection only** — rejected: a cancelled Bill (the gym, 3 Sep 2026) keeps appearing until enough months pass, one-off dated payments (council rates) look like Bills, and a new Bill stays invisible until it repeats. Every error lands on the phone with no way to correct it.
- **Hand-entered only** — rejected: exact, but every Bill must be typed in through Claude, and the Household already has 15+ repeating debits in its history.

## Consequences

- Bills need their own table with a matcher rule, separate from `mapping_rules` and `income_rules`; the reuse is in the matcher, as in ADR-0009.
- A Bill that passes its due date with no matching debit is a signal to the Household that it may have been cancelled; ending a Bill is an explicit Member action.
