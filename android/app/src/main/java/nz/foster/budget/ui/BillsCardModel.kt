package nz.foster.budget.ui

import nz.foster.budget.allowance.AmountTone
import nz.foster.budget.allowance.amountTone
import nz.foster.budget.allowance.formatWeekday
import nz.foster.budget.api.BillOccurrence
import nz.foster.budget.api.BillOccurrenceState
import nz.foster.budget.api.BillsView

/** The "Bills this week" card. Totals, amounts and row order come from the server as given (ADR-0003). */
data class BillsCardModel(
    val total: String,
    val totalTone: AmountTone,
    val rows: List<OccurrenceRow>,
)

data class OccurrenceRow(
    val weekday: String,
    val name: String,
    val amount: String,
    val paid: Boolean,
    /** [AmountTone.Over] marks an overdue Bill occurrence. */
    val tone: AmountTone,
)

fun billsCardModel(bills: BillsView) = BillsCardModel(
    total = bills.dueTotalDisplay,
    totalTone = amountTone(warning = false, stale = bills.stale),
    rows = bills.occurrences.map { occurrenceRow(it, bills.stale) },
)

private fun occurrenceRow(o: BillOccurrence, stale: Boolean) = OccurrenceRow(
    weekday = formatWeekday(o.dueDate),
    name = o.name,
    amount = o.amountDisplay,
    paid = o.state == BillOccurrenceState.Paid,
    tone = amountTone(warning = o.state == BillOccurrenceState.Overdue, stale = stale),
)
