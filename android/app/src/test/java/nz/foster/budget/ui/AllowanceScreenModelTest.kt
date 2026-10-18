package nz.foster.budget.ui

import java.io.File
import java.time.Instant
import java.time.ZoneId
import nz.foster.budget.allowance.AllowanceSnapshot
import nz.foster.budget.api.parseSpendingAllowance
import nz.foster.budget.auth.AuthState
import nz.foster.budget.cache.FetchFailure
import nz.foster.budget.cache.LastFetch
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AllowanceScreenModelTest {
    private val zone = ZoneId.of("Pacific/Auckland")
    private val checkedAt = Instant.parse("2026-10-16T19:30:00Z").toEpochMilli()

    private fun allowance(state: String) = parseSpendingAllowance(
        File(System.getProperty("budget.contractsDir"), "spending-allowance.$state.json").readText(),
    )

    private fun model(state: String?, lastFetch: LastFetch? = LastFetch.Succeeded(checkedAt)) = allowanceScreenModel(
        AllowanceSnapshot(AuthState.SignedIn, state?.let(::allowance), checkedAt.takeIf { state != null }, lastFetch),
        zone,
    )

    @Test
    fun `ok shows the amount, per week, and the breakdown`() {
        val figure = model("ok").figure!!

        assertEquals("$365.00", figure.amount)
        assertFalse(figure.over)
        assertEquals("$150.29", figure.perWeek)
        assertEquals(17, figure.daysLeft)
        assertEquals("$380.00", figure.flexibleRemaining)
        assertEquals("$0.00", figure.committedOverspend)
        assertEquals("$15.00", figure.uncategorizedSpent)
        assertEquals(1, figure.uncategorizedCount)
        assertNull(figure.noBudgetMonth)
        assertFalse(figure.stale)
    }

    @Test
    fun `over shows a negative amount and no per-week figure`() {
        val figure = model("over").figure!!

        assertEquals("-$115.00", figure.amount)
        assertTrue(figure.over)
        assertNull(figure.perWeek)
        assertEquals("-$100.00", figure.flexibleRemaining)
    }

    @Test
    fun `no budget names the month and shows no amounts`() {
        val figure = model("no_budget").figure!!

        assertEquals("October 2026", figure.noBudgetMonth)
        assertNull(figure.amount)
        assertNull(figure.perWeek)
        assertNull(figure.flexibleRemaining)
        assertNull(figure.committedOverspend)
        assertNull(figure.uncategorizedSpent)
        assertEquals(1, figure.uncategorizedCount)
    }

    @Test
    fun `stale is flagged`() {
        assertTrue(model("stale").figure!!.stale)
    }

    @Test
    fun `data as of and last checked use the phone's time zone`() {
        val screen = model("ok")

        assertEquals("15 Oct 2026, 9:00 pm", screen.figure!!.dataAsOf)
        assertEquals("17 Oct 2026, 8:30 am", screen.lastChecked)
    }

    @Test
    fun `a failed last fetch is reported with the last good figure`() {
        val screen = model("ok", LastFetch.Failed(checkedAt + 1, FetchFailure.Offline))

        assertEquals(FetchFailure.Offline, screen.lastFailure)
        assertEquals("$365.00", screen.figure!!.amount)
        assertEquals("17 Oct 2026, 8:30 am", screen.lastChecked)
    }

    @Test
    fun `no cached figure gives an empty screen`() {
        val screen = model(null, lastFetch = null)

        assertNull(screen.figure)
        assertNull(screen.lastChecked)
        assertNull(screen.lastFailure)
    }
}
