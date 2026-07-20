# Income is classified into Income Streams, not guessed by a heuristic

Actual Income is determined by **classifying credit Transactions into household-defined Income Streams** via **Income Rules**, reusing the same matcher that routes expenses to Budget Categories (merchant / description / Akahu `type` / Akahu group). This replaces the V1 sync-time heuristic (`amount > 0 && type != TRANSFER`), which both **missed** real income (a partner's pay arriving as a bank `TRANSFER`, or income landing in an unconnected Account) and **mis-counted** it (refunds treated as income). A credit is Income **iff** it is classified into an Income Stream.

This refines the "lightweight, household-level income" of ADR-0004 and supersedes the heuristic described in the V1 spec — it keeps income household-level, but makes *what counts* explicit and correctable rather than guessed.

## Considered Options

- **Keep the heuristic, patch edge cases** — rejected: every fix is another special case, and it still can't see income that arrives as a transfer or in an account with no positive-credit signal.
- **Model income as a flavour of Budget Category** (`kind: income`) — rejected: conflates money-in with money-out in one table; "spent" vs "received" get muddy and the budget engine already treats every Category as an expense envelope.
- **A fully separate income subsystem with its own matching code** — rejected: would duplicate the merchant/description/type/group matcher. We instead **extract the matcher** and feed it from two rule tables.

## Consequences

- The matcher is extracted into a shared function; `income_rules` is a **separate table** from `mapping_rules` (clean FKs and unique constraints), but both run through the same matcher — the reuse is in the logic, not the table.
- A system **Unclassified income** Stream + a positive-non-transfer fallback preserves existing totals on rollout (no regression); unmatched positive credits — including transfers — surface in a review list so Income can never silently go missing again.
- `transactions.is_income` becomes **derived** (`income_stream_id IS NOT NULL`), set in the categorization pass, so the budget and reports engines that already filter on it don't change.
- Reads gain a per-Stream Income breakdown (so the Household can watch a Stream — e.g. Paid Parental Leave — drop to zero).
- **Deferred:** per-Stream *expected* income (expected income stays a single household figure); per-Member income attribution.
