# 02: Paid Bill occurrences and estimated amounts

**What to build:** After a sync, a Bill occurrence whose debit has landed shows as paid, with the actual debit amount and a tick. A Bill with a varying amount shows an estimate with "~", calculated from its recent debits.

**Blocked by:** 01 (Hand-entered Bills and the Bills view in Claude)

**Status:** resolved

Spec: `.scratch/upcoming-bills/spec.md` (section "Domain rules", matching and amounts)

- [x] A debit matches a Bill occurrence when it passes the Bill's matcher rule (the shared matcher) and its date is between 3 days before and 5 days after the due date
- [x] Internal transfers, Refunds and credits never match
- [x] A Transaction matches at most one occurrence, and an occurrence matches at most one Transaction
- [x] If two Bills match one debit, the Bill with the closest expected amount gets it (the two AIA policies on the 26th)
- [x] If overlapping weekly windows both match one debit, the occurrence with the nearest due date gets it
- [x] A matched occurrence is paid, shows the actual debit amount, and stays in the week list until 2 days after its due date
- [x] Paid occurrences are not in the week total
- [x] Estimated mode shows the median of the last 3 matched debits with "~". With no matched debits, it shows the expected amount with "~"
- [x] Matching runs each time the Bills view is built. No matched Transaction is stored on the Bill
- [x] Seam 1 tests cover early and late debits inside the window, a debit outside it, the AIA pair, a `LOAN` "AP#..." debit matched by description, overlapping weekly windows, an Internal transfer that does not match, paid visibility, and the median

## Comments

- 2026-10-20: The agent implemented all ten items, and the full server suite passes (204 tests). `manage_bills` now takes `amount_mode` on create and edit, because no other path sets estimated mode before ticket 03. Decisions for review:
  - Only an Akahu `TRANSFER` debit is excluded as an Internal transfer. The Bills module uses the spend rule (`isSpendSql`), so it follows ADR-0012 pairing when that work lands.
  - Matching ranks each (debit, occurrence) pair by the gap to the expected amount, then by days from the due date. Thus the amount also decides between two debits for one occurrence. The spec does not state this case.
  - The nearest-due-date rule can leave a debit unmatched. Example: a weekly debit 5 days late takes the next occurrence, and that occurrence's own debit then finds no free occurrence.
  - With 2 matched debits, the estimate is the mean of the two.
