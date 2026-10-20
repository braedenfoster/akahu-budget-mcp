package nz.foster.budget.widget

import nz.foster.budget.allowance.AllowanceSnapshot
import nz.foster.budget.allowance.OccurrenceRow
import nz.foster.budget.allowance.householdDateFormat
import nz.foster.budget.allowance.occurrenceRow
import nz.foster.budget.auth.AuthState
import nz.foster.budget.cache.LastFetch

/**
 * What the "Bills today" widget shows. The server picks and orders the rows (ADR-0003); the widget only cuts the list.
 * `showsOfflineMark` and `asOf` have the same meaning as in [WidgetState].
 */
sealed interface BillsTodayState {
    data object SignedOut : BillsTodayState

    /** Signed in, but no good response is cached yet. */
    data class NothingCached(val showsOfflineMark: Boolean) : BillsTodayState

    /** The cached response has no Bills view this APK can read, for example from a server older than Bills. */
    data class BillsUnavailable(val showsOfflineMark: Boolean) : BillsTodayState

    data class Today(
        val rows: List<OccurrenceRow>,
        /** The rows cut from the list, shown as "+N more". */
        val moreCount: Int,
        val asOf: String?,
        val showsOfflineMark: Boolean,
    ) : BillsTodayState

    /** [next] is the first Bill occurrence after today, or null when no active Bill has one. */
    data class NoneToday(val next: OccurrenceRow?, val asOf: String?, val showsOfflineMark: Boolean) : BillsTodayState
}

private const val MAX_ROWS = 3

private val asOfFormat = householdDateFormat("d MMM")

fun billsTodayState(snapshot: AllowanceSnapshot): BillsTodayState {
    if (snapshot.auth == AuthState.SignedOut) return BillsTodayState.SignedOut
    val showsOfflineMark = snapshot.lastFetch is LastFetch.Failed
    if (snapshot.allowance == null) return BillsTodayState.NothingCached(showsOfflineMark)
    val bills = snapshot.bills ?: return BillsTodayState.BillsUnavailable(showsOfflineMark)
    val asOf = bills.dataAsOf?.takeIf { bills.stale }?.let(asOfFormat::format)
    if (bills.today.isEmpty()) {
        return BillsTodayState.NoneToday(bills.nextUpcoming?.let { occurrenceRow(it, bills.stale) }, asOf, showsOfflineMark)
    }
    return BillsTodayState.Today(
        rows = bills.today.take(MAX_ROWS).map { occurrenceRow(it, bills.stale) },
        moreCount = (bills.today.size - MAX_ROWS).coerceAtLeast(0),
        asOf = asOf,
        showsOfflineMark = showsOfflineMark,
    )
}
