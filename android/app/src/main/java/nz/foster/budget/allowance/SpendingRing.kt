package nz.foster.budget.allowance

import nz.foster.budget.api.SpendingAllowance

/** The share of the Flexible allocation spent this Period, drawn as a ring. [fill] is 0..1. */
data class SpendingRing(val fill: Float, val tone: AmountTone)

/** Turns server cents into a ring angle only; the app shows no money figure derived from it (ADR-0003). */
fun spendingRing(allowance: SpendingAllowance): SpendingRing? {
    val amount = allowance.amountCents ?: return null
    val allocated = allowance.flexibleAllocatedCents?.takeIf { it > 0 } ?: return null
    val spentFraction = (1 - amount.toDouble() / allocated).coerceIn(0.0, 1.0)
    return SpendingRing(fill = spentFraction.toFloat(), tone = allowance.amountTone)
}
