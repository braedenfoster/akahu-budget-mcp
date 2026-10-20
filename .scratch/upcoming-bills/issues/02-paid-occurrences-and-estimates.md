# 02: Paid Bill occurrences and estimated amounts

**What to build:** After a sync, a Bill occurrence whose debit has landed shows as paid, with the actual debit amount and a tick. A Bill with a varying amount shows an estimate with "~", calculated from its recent debits.

**Blocked by:** 01 (Hand-entered Bills and the Bills view in Claude)

**Status:** ready-for-agent

Spec: `.scratch/upcoming-bills/spec.md` (section "Domain rules", matching and amounts)

- [ ] A debit matches a Bill occurrence when it passes the Bill's matcher rule (the shared matcher) and its date is between 3 days before and 5 days after the due date
- [ ] Internal transfers, Refunds and credits never match
- [ ] A Transaction matches at most one occurrence, and an occurrence matches at most one Transaction
- [ ] If two Bills match one debit, the Bill with the closest expected amount gets it (the two AIA policies on the 26th)
- [ ] If overlapping weekly windows both match one debit, the occurrence with the nearest due date gets it
- [ ] A matched occurrence is paid, shows the actual debit amount, and stays in the week list until 2 days after its due date
- [ ] Paid occurrences are not in the week total
- [ ] Estimated mode shows the median of the last 3 matched debits with "~". With no matched debits, it shows the expected amount with "~"
- [ ] Matching runs each time the Bills view is built. No matched Transaction is stored on the Bill
- [ ] Seam 1 tests cover early and late debits inside the window, a debit outside it, the AIA pair, a `LOAN` "AP#..." debit matched by description, overlapping weekly windows, an Internal transfer that does not match, paid visibility, and the median
