package nz.foster.budget.allowance

import nz.foster.budget.api.SpendingAllowance

/**
 * The share of the Flexible allocation spent this Period, drawn as a ring. [pace] is how far through the
 * Period the Household is, drawn as a tick: a fill past the tick is ahead of pace. Both are 0..1.
 */
data class SpendingRing(val fill: Float, val pace: Float, val tone: AmountTone)

/** Turns server cents into a ring angle only; the app shows no money figure derived from it (ADR-0003). */
fun spendingRing(allowance: SpendingAllowance): SpendingRing? {
    val amount = allowance.amountCents ?: return null
    val allocated = allowance.flexibleAllocatedCents?.takeIf { it > 0 } ?: return null
    val spentFraction = (1 - amount.toDouble() / allocated).coerceIn(0.0, 1.0)
    return SpendingRing(fill = spentFraction.toFloat(), pace = pace(allowance), tone = allowance.amountTone)
}

private fun pace(allowance: SpendingAllowance): Float {
    val periodDays = allowance.periodDays.takeIf { it > 0 } ?: return 0f
    return ((periodDays - allowance.daysLeft).toDouble() / periodDays).coerceIn(0.0, 1.0).toFloat()
}
