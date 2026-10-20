package nz.foster.budget.allowance

import nz.foster.budget.api.BillOccurrence
import nz.foster.budget.api.BillOccurrenceState

/** One Bill occurrence as the "Bills this week" card and the "Bills today" widget show it. */
data class OccurrenceRow(
    val weekday: String,
    val name: String,
    val amount: String,
    val paid: Boolean,
    /** [AmountTone.Over] marks an overdue Bill occurrence. */
    val tone: AmountTone,
)

fun occurrenceRow(o: BillOccurrence, stale: Boolean) = OccurrenceRow(
    weekday = formatWeekday(o.dueDate),
    name = o.name,
    amount = (if (o.estimated) "~" else "") + formatNzd(o.amountCents),
    paid = o.state == BillOccurrenceState.Paid,
    tone = amountTone(warning = o.state == BillOccurrenceState.Overdue, stale = stale),
)
