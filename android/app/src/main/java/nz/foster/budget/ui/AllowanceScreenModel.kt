package nz.foster.budget.ui

import java.time.Instant
import java.time.YearMonth
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.util.Locale
import nz.foster.budget.allowance.AllowanceSnapshot
import nz.foster.budget.allowance.formatNzd
import nz.foster.budget.api.AllowanceStatus
import nz.foster.budget.api.SpendingAllowance
import nz.foster.budget.cache.FetchFailure
import nz.foster.budget.cache.LastFetch

data class AllowanceScreenModel(
    val figure: FigureModel?,
    /** The phone's last successful fetch. */
    val lastChecked: String?,
    /** Set when the latest fetch failed; [figure] then holds the last good response. */
    val lastFailure: FetchFailure?,
)

data class FigureModel(
    /** Null when the Period has no Budget. */
    val amount: String?,
    val over: Boolean,
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
)

private val NZ = Locale("en", "NZ")
private val timestampFormat = DateTimeFormatter.ofPattern("d MMM yyyy, h:mm a", NZ)
private val monthFormat = DateTimeFormatter.ofPattern("MMMM yyyy", NZ)

fun allowanceScreenModel(snapshot: AllowanceSnapshot, zone: ZoneId): AllowanceScreenModel = AllowanceScreenModel(
    figure = snapshot.allowance?.let { figureModel(it, zone) },
    lastChecked = snapshot.lastSuccessAtMillis?.let { formatTimestamp(Instant.ofEpochMilli(it), zone) },
    lastFailure = (snapshot.lastFetch as? LastFetch.Failed)?.failure,
)

private fun figureModel(a: SpendingAllowance, zone: ZoneId) = FigureModel(
    amount = a.amountCents?.let(::formatNzd),
    over = a.status == AllowanceStatus.Over,
    perWeek = a.perWeekCents?.let(::formatNzd),
    daysLeft = a.daysLeft,
    noBudgetMonth = if (a.status == AllowanceStatus.NoBudget) formatMonth(a.period) else null,
    flexibleRemaining = a.flexibleRemainingCents?.let(::formatNzd),
    committedOverspend = a.committedOverspendCents?.let(::formatNzd),
    uncategorizedSpent = a.uncategorizedSpentCents?.let(::formatNzd),
    uncategorizedCount = a.uncategorizedCount,
    dataAsOf = a.dataAsOf?.let { parseInstant(it) }?.let { formatTimestamp(it, zone) },
    stale = a.stale,
)

private fun formatTimestamp(instant: Instant, zone: ZoneId) = timestampFormat.format(instant.atZone(zone))

private fun formatMonth(period: String) = try {
    monthFormat.format(YearMonth.parse(period))
} catch (_: DateTimeParseException) {
    period
}

private fun parseInstant(iso: String) = try {
    Instant.parse(iso)
} catch (_: DateTimeParseException) {
    null
}
