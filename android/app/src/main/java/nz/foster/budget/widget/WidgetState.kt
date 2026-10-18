package nz.foster.budget.widget

import nz.foster.budget.allowance.AllowanceSnapshot
import nz.foster.budget.allowance.AmountTone
import nz.foster.budget.allowance.SpendingRing
import nz.foster.budget.allowance.amountTone
import nz.foster.budget.allowance.formatMonth
import nz.foster.budget.allowance.formatNzd
import nz.foster.budget.allowance.householdDateFormat
import nz.foster.budget.allowance.spendingRing
import nz.foster.budget.api.AllowanceStatus
import nz.foster.budget.auth.AuthState
import nz.foster.budget.cache.LastFetch

/**
 * What the home-screen widget shows. `showsOfflineMark` means the latest fetch failed (network or server),
 * so the widget shows the last good response. It is independent of `stale`, which the server sets.
 */
sealed interface WidgetState {
    data object SignedOut : WidgetState

    /** Signed in, but no good response is cached yet. */
    data class NoAllowanceYet(val showsOfflineMark: Boolean) : WidgetState

    data class NoBudget(val month: String, val showsOfflineMark: Boolean) : WidgetState

    data class Allowance(
        val amount: String,
        val tone: AmountTone,
        val perWeek: String?,
        val daysLeft: Int,
        /** The Data-as-of date, set only when the response is stale. */
        val asOf: String?,
        val showsOfflineMark: Boolean,
        /** Null when the Uncategorized count is 0, so the badge is hidden. */
        val uncategorizedBadgeCount: Int?,
        /** Null when the Flexible allocation is 0 or missing, so no ring is drawn. */
        val ring: SpendingRing?,
    ) : WidgetState
}

private val asOfFormat = householdDateFormat("d MMM")

fun widgetState(snapshot: AllowanceSnapshot): WidgetState {
    if (snapshot.auth == AuthState.SignedOut) return WidgetState.SignedOut
    val showsOfflineMark = snapshot.lastFetch is LastFetch.Failed
    val allowance = snapshot.allowance ?: return WidgetState.NoAllowanceYet(showsOfflineMark)
    val amountCents = allowance.amountCents
    if (allowance.status == AllowanceStatus.NoBudget || amountCents == null) {
        return WidgetState.NoBudget(formatMonth(allowance.period), showsOfflineMark)
    }
    return WidgetState.Allowance(
        amount = formatNzd(amountCents),
        tone = allowance.amountTone,
        perWeek = allowance.perWeekCents?.takeUnless { allowance.status == AllowanceStatus.Over }?.let(::formatNzd),
        daysLeft = allowance.daysLeft,
        asOf = allowance.dataAsOf?.takeIf { allowance.stale }?.let(asOfFormat::format),
        showsOfflineMark = showsOfflineMark,
        uncategorizedBadgeCount = allowance.uncategorizedCount.takeIf { it > 0 },
        ring = spendingRing(allowance),
    )
}
