package nz.foster.budget.widget

import java.io.File
import java.time.Instant
import java.time.ZoneId
import nz.foster.budget.allowance.AllowanceSnapshot
import nz.foster.budget.api.SpendingAllowance
import nz.foster.budget.api.parseSpendingAllowance
import nz.foster.budget.auth.AuthState
import nz.foster.budget.cache.FetchFailure
import nz.foster.budget.cache.LastFetch
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WidgetStateTest {
    private val zone = ZoneId.of("Pacific/Auckland")
    private val fetchedAt = Instant.parse("2026-10-16T19:30:00Z").toEpochMilli()
    private val succeeded = LastFetch.Succeeded(fetchedAt)

    private fun allowance(state: String) = parseSpendingAllowance(
        File(System.getProperty("budget.contractsDir"), "spending-allowance.$state.json").readText(),
    )

    private fun state(
        allowance: SpendingAllowance?,
        lastFetch: LastFetch? = succeeded,
        auth: AuthState = AuthState.SignedIn,
    ) = widgetState(AllowanceSnapshot(auth, allowance, fetchedAt.takeIf { allowance != null }, lastFetch), zone)

    private fun figure(allowance: SpendingAllowance?, lastFetch: LastFetch? = succeeded) =
        state(allowance, lastFetch) as WidgetState.Figure

    @Test
    fun `ok shows the amount, per week, and days left`() {
        assertEquals(
            WidgetState.Figure(
                amount = "$365.00",
                over = false,
                perWeek = "$150.29",
                daysLeft = 17,
                stale = false,
                asOf = null,
                offline = false,
                uncategorizedBadge = 1,
            ),
            state(allowance("ok")),
        )
    }

    @Test
    fun `over shows the negative amount as over with no per-week figure`() {
        val over = figure(allowance("over"))

        assertEquals("-$115.00", over.amount)
        assertTrue(over.over)
        assertNull(over.perWeek)
    }

    @Test
    fun `over hides a per-week figure even if the server sends one`() {
        assertNull(figure(allowance("over").copy(perWeekCents = 100)).perWeek)
    }

    @Test
    fun `no budget names the month`() {
        assertEquals(WidgetState.NoBudget(month = "October 2026", offline = false), state(allowance("no_budget")))
    }

    @Test
    fun `stale greys the number and shows the Data-as-of date`() {
        val stale = figure(allowance("stale"))

        assertTrue(stale.stale)
        assertEquals("13 Oct", stale.asOf)
        assertEquals("$365.00", stale.amount)
        assertFalse(stale.offline)
    }

    @Test
    fun `a fresh figure has no as-of date`() {
        assertNull(figure(allowance("ok")).asOf)
    }

    @Test
    fun `signed out shows Sign in whatever is cached`() {
        assertEquals(WidgetState.SignedOut, state(allowance("ok"), auth = AuthState.SignedOut))
        assertEquals(WidgetState.SignedOut, state(null, lastFetch = null, auth = AuthState.SignedOut))
    }

    @Test
    fun `offline keeps the last good value with an offline mark`() {
        val offline = figure(allowance("ok"), LastFetch.Failed(fetchedAt + 1, FetchFailure.Offline))

        assertTrue(offline.offline)
        assertEquals("$365.00", offline.amount)
        assertEquals("$150.29", offline.perWeek)
    }

    @Test
    fun `a server error is shown as offline`() {
        assertTrue(figure(allowance("ok"), LastFetch.Failed(fetchedAt + 1, FetchFailure.ServerError)).offline)
    }

    @Test
    fun `a stale figure that then goes offline is both greyed and marked offline`() {
        val both = figure(allowance("stale"), LastFetch.Failed(fetchedAt + 1, FetchFailure.Offline))

        assertTrue(both.stale)
        assertEquals("13 Oct", both.asOf)
        assertTrue(both.offline)
    }

    @Test
    fun `no budget can be offline`() {
        val noBudget = state(allowance("no_budget"), LastFetch.Failed(fetchedAt + 1, FetchFailure.Offline))

        assertEquals(WidgetState.NoBudget(month = "October 2026", offline = true), noBudget)
    }

    @Test
    fun `signed in with nothing cached waits for the first fetch`() {
        assertEquals(WidgetState.NoFigure(offline = false), state(null, lastFetch = null))
        assertEquals(
            WidgetState.NoFigure(offline = true),
            state(null, lastFetch = LastFetch.Failed(fetchedAt, FetchFailure.Offline)),
        )
    }

    @Test
    fun `the Uncategorized badge shows in every state with a number`() {
        assertEquals(1, figure(allowance("ok")).uncategorizedBadge)
        assertEquals(1, figure(allowance("over")).uncategorizedBadge)
        assertEquals(1, figure(allowance("stale")).uncategorizedBadge)
        assertEquals(1, figure(allowance("ok"), LastFetch.Failed(fetchedAt + 1, FetchFailure.Offline)).uncategorizedBadge)
    }

    @Test
    fun `the Uncategorized badge is hidden when the count is zero`() {
        assertNull(figure(allowance("ok").copy(uncategorizedCount = 0)).uncategorizedBadge)
        assertNull(figure(allowance("over").copy(uncategorizedCount = 0)).uncategorizedBadge)
    }
}
