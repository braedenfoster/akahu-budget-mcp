# 01: Hand-entered Bills and the Bills view in Claude

**What to build:** A Member creates, edits and ends Bills through Claude. Claude answers "what Bills are due this week?" from the server's Bills view. The view shows each Bill occurrence in the week with its due date, state and amount. This ticket uses fixed amounts and has no paid state yet.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

Spec: `.scratch/upcoming-bills/spec.md` (sections "Domain rules", "Schema", "Bills module", "MCP tools")

- [ ] A migration adds the `bills` table: name, cadence, anchor, amount mode, expected amount, one matcher rule, status, end date
- [ ] `manage_bills` supports `create`, `edit` and `end`. `list_bills` lists active Bills, and ended Bills when asked
- [ ] Occurrence dates are correct for weekly, fortnightly, monthly, quarterly and yearly cadences. A missing day of the month moves to the last day of that month
- [ ] "Today" and all due dates use the Household time zone
- [ ] Without matching, each occurrence is upcoming, due, overdue or missed by its day offset. The offsets are named constants in one place
- [ ] An ended Bill makes no occurrences after its end date
- [ ] One Bills module builds the Bills view for a given today: `occurrences` (overdue first, then by due date), `today`, `next_upcoming` (can look past the week), `due_total_cents` / `due_total_display` (every occurrence that is not paid), `data_as_of`, `stale`
- [ ] `get_upcoming_bills` returns the Bills view from that module
- [ ] Seam 1 tests cover each cadence, the month-end move, February, the time zone at midnight, each state offset, the week list rules, `today`, `next_upcoming` past the week, the total, and an ended Bill
