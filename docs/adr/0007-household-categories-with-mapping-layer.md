# Household-defined Budget Categories with a mapping layer

Budget Categories are **household-defined**, and a **Mapping Rule** table in sqlite routes each Akahu Category (and specific merchants) to a Budget Category. The mapping is **seeded automatically from Akahu's `personal_finance` groups** so it works on day one, then refined over time — including AI-assisted cleanup of whatever lands in **Uncategorized**.

## Considered Options

- **Use Akahu's `personal_finance` groups directly as Budget Categories** — zero mapping work, but a fixed ~dozen buckets you can't rename/merge/split to match how the household actually thinks ("kids stuff", "date nights").
- **Fully manual categorization** — maximum control, unusable at transaction volume.

## Consequences

- An explicit **Uncategorized** Budget Category always exists so totals reconcile (Akahu enriches only "where possible").
- Mapping Rules are **data, not code**, edited via tools — which is also what lets the AI resolve "a $2,000 couch" to the right Envelope. A rule can backfill existing Transactions; combined with the stored `raw` payload (ADR-0005), categorization is fully re-derivable.
