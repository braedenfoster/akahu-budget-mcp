# 02: Member override for Internal transfers

**What to build:** A Member can mark Transactions as Internal transfers when pairing cannot see the other leg (e.g. before the other Account's history starts), forbid a wrong pair, or clear the override. Overrides survive every re-categorization.

**Blocked by:** 01 (Pair Internal transfers)

**Status:** ready-for-agent

Spec: `.scratch/internal-transfers/spec.md` (Tools)

- [ ] New tool `mark_internal_transfer(transaction_ids[], internal)` where `true` forces an Internal transfer, `false` forbids pairing, `null` clears the override
- [ ] It accepts several Transaction ids in one call
- [ ] A Member override wins over pairing, Income Rules, and refund matching
- [ ] Overrides survive a re-categorization and a backfill
- [ ] The tool is audited and refused in read-only mode
- [ ] Seam 1 tests cover the criteria above
