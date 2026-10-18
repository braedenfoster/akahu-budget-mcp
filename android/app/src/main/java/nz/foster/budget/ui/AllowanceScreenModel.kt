package nz.foster.budget.ui

import java.time.Instant
import nz.foster.budget.allowance.AllowanceSnapshot
import nz.foster.budget.allowance.AmountTone
import nz.foster.budget.allowance.SpendingRing
import nz.foster.budget.allowance.amountTone
import nz.foster.budget.allowance.formatMonth
import nz.foster.budget.allowance.formatNzd
import nz.foster.budget.allowance.householdDateFormat
import nz.foster.budget.allowance.spendingRing
import nz.foster.budget.api.AllowanceStatus
import nz.foster.budget.api.SpendingAllowance
import nz.foster.budget.cache.FetchFailure
import nz.foster.budget.cache.LastFetch

data class AllowanceScreenModel(
    val allowance: AllowanceModel?,
    /** The phone's last successful fetch. */
    val lastChecked: String?,
    /** Set when the latest fetch failed; [allowance] then holds the last good response. */
    val lastFailure: FetchFailure?,
)

data class AllowanceModel(
    /** Null when the Period has no Budget. */
    val amount: String?,
    val tone: AmountTone,
    val perWeek: String?,
    val daysLeft: Int,
    /** Set only when the Period has no Budget, e.g. "October 2026". */
    val noBudgetMonth: String?,
    val flexibleRemaining: String?,
    val committedOverspend: String?,
    val uncategorizedSpent: String?,
    val uncategorizedCount: Int,
    val dataAsOf: String?,
    val stale: Boolean,
    /** Null when the Period has no Budget or the Flexible allocation is 0 or missing, so no ring is drawn. */
    val ring: SpendingRing?,
)

private val timestampFormat = householdDateFormat("d MMM yyyy, h:mm a")

fun allowanceScreenModel(snapshot: AllowanceSnapshot): AllowanceScreenModel = AllowanceScreenModel(
    allowance = snapshot.allowance?.let(::allowanceModel),
    lastChecked = snapshot.lastSuccessAtMillis?.let { timestampFormat.format(Instant.ofEpochMilli(it)) },
    lastFailure = (snapshot.lastFetch as? LastFetch.Failed)?.failure,
)

private fun allowanceModel(a: SpendingAllowance) = AllowanceModel(
    amount = a.amountCents?.let(::formatNzd),
    tone = a.amountTone,
    perWeek = a.perWeekCents?.let(::formatNzd),
    daysLeft = a.daysLeft,
    noBudgetMonth = if (a.status == AllowanceStatus.NoBudget) formatMonth(a.period) else null,
    flexibleRemaining = a.flexibleRemainingCents?.let(::formatNzd),
    committedOverspend = a.committedOverspendCents?.let(::formatNzd),
    uncategorizedSpent = a.uncategorizedSpentCents?.let(::formatNzd),
    uncategorizedCount = a.uncategorizedCount,
    dataAsOf = a.dataAsOf?.let(timestampFormat::format),
    stale = a.stale,
    ring = spendingRing(a),
)
