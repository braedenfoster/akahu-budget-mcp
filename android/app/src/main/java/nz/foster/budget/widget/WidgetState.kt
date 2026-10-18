package nz.foster.budget.widget

import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import nz.foster.budget.allowance.AllowanceSnapshot
import nz.foster.budget.allowance.formatNzd
import nz.foster.budget.api.AllowanceStatus
import nz.foster.budget.auth.AuthState
import nz.foster.budget.cache.LastFetch
import nz.foster.budget.ui.formatMonth
import nz.foster.budget.ui.parseInstant

/**
 * What the home-screen widget shows. `offline` means the latest fetch failed (network or server),
 * so the figure is the last good response. It is independent of `stale`, which the server sets.
 */
sealed interface WidgetState {
    data object SignedOut : WidgetState

    /** Signed in, but no good response is cached yet. */
    data class NoFigure(val offline: Boolean) : WidgetState

    data class NoBudget(val month: String, val offline: Boolean) : WidgetState

    data class Figure(
        val amount: String,
        val over: Boolean,
        val perWeek: String?,
        val daysLeft: Int,
        val stale: Boolean,
        /** The Data-as-of date, set only when [stale]. */
        val asOf: String?,
        val offline: Boolean,
        /** The Uncategorized count, or null when it is 0. */
        val uncategorizedBadge: Int?,
    ) : WidgetState
}

private val asOfFormat = DateTimeFormatter.ofPattern("d MMM", Locale("en", "NZ"))

fun widgetState(snapshot: AllowanceSnapshot, zone: ZoneId): WidgetState {
    if (snapshot.auth == AuthState.SignedOut) return WidgetState.SignedOut
    val offline = snapshot.lastFetch is LastFetch.Failed
    val allowance = snapshot.allowance ?: return WidgetState.NoFigure(offline)
    val amountCents = allowance.amountCents
    if (allowance.status == AllowanceStatus.NoBudget || amountCents == null) {
        return WidgetState.NoBudget(formatMonth(allowance.period), offline)
    }
    val over = allowance.status == AllowanceStatus.Over
    return WidgetState.Figure(
        amount = formatNzd(amountCents),
        over = over,
        perWeek = allowance.perWeekCents?.takeUnless { over }?.let(::formatNzd),
        daysLeft = allowance.daysLeft,
        stale = allowance.stale,
        asOf = allowance.dataAsOf?.takeIf { allowance.stale }?.let(::parseInstant)?.let { asOfFormat.format(it.atZone(zone)) },
        offline = offline,
        uncategorizedBadge = allowance.uncategorizedCount.takeIf { it > 0 },
    )
}
