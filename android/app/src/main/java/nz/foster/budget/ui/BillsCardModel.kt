package nz.foster.budget.ui

import nz.foster.budget.allowance.AmountTone
import nz.foster.budget.allowance.OccurrenceRow
import nz.foster.budget.allowance.amountTone
import nz.foster.budget.allowance.formatNzd
import nz.foster.budget.allowance.occurrenceRow
import nz.foster.budget.api.BillsView

/** The "Bills this week" card. Totals, amounts and row order come from the server (ADR-0003). */
data class BillsCardModel(
    val total: String,
    val totalTone: AmountTone,
    val rows: List<OccurrenceRow>,
)

fun billsCardModel(bills: BillsView) = BillsCardModel(
    total = formatNzd(bills.dueTotalCents),
    totalTone = amountTone(warning = false, stale = bills.stale),
    rows = bills.occurrences.map { occurrenceRow(it, bills.stale) },
)
