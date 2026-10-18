package nz.foster.budget.ui

import java.time.Instant
import nz.foster.budget.allowance.AllowanceSnapshot
import nz.foster.budget.allowance.AmountTone
import nz.foster.budget.api.contractAllowance
import nz.foster.budget.auth.AuthState
import nz.foster.budget.cache.FetchFailure
import nz.foster.budget.cache.LastFetch
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AllowanceScreenModelTest {
    private val checkedAt = Instant.parse("2026-10-16T19:30:00Z").toEpochMilli()

    private fun model(state: String?, lastFetch: LastFetch? = LastFetch.Succeeded(checkedAt)) = allowanceScreenModel(
        AllowanceSnapshot(AuthState.SignedIn, state?.let(::contractAllowance), checkedAt.takeIf { state != null }, lastFetch),
    )

    @Test
    fun `ok shows the amount, per week, and the breakdown`() {
        val allowance = model("ok").allowance!!

        assertEquals("$365.00", allowance.amount)
        assertEquals(AmountTone.Normal, allowance.tone)
        assertEquals("$150.29", allowance.perWeek)
        assertEquals(17, allowance.daysLeft)
        assertEquals("$380.00", allowance.flexibleRemaining)
        assertEquals("$0.00", allowance.committedOverspend)
        assertEquals("$15.00", allowance.uncategorizedSpent)
        assertEquals(1, allowance.uncategorizedCount)
        assertNull(allowance.noBudgetMonth)
        assertFalse(allowance.stale)
    }

    @Test
    fun `over shows a negative amount and no per-week figure`() {
        val allowance = model("over").allowance!!

        assertEquals("-$115.00", allowance.amount)
        assertEquals(AmountTone.Over, allowance.tone)
        assertNull(allowance.perWeek)
        assertEquals("-$100.00", allowance.flexibleRemaining)
    }

    @Test
    fun `no budget names the month and shows no amounts`() {
        val allowance = model("no_budget").allowance!!

        assertEquals("October 2026", allowance.noBudgetMonth)
        assertNull(allowance.amount)
        assertNull(allowance.perWeek)
        assertNull(allowance.flexibleRemaining)
        assertNull(allowance.committedOverspend)
        assertNull(allowance.uncategorizedSpent)
        assertEquals(1, allowance.uncategorizedCount)
    }

    @Test
    fun `stale is flagged and greyed`() {
        val allowance = model("stale").allowance!!

        assertTrue(allowance.stale)
        assertEquals(AmountTone.Stale, allowance.tone)
    }

    @Test
    fun `data as of and last checked use the Household zone`() {
        val screen = model("ok")

        assertEquals("15 Oct 2026, 9:00 pm", screen.allowance!!.dataAsOf)
        assertEquals("17 Oct 2026, 8:30 am", screen.lastChecked)
    }

    @Test
    fun `a failed last fetch is reported with the last good Spending allowance`() {
        val screen = model("ok", LastFetch.Failed(checkedAt + 1, FetchFailure.Offline))

        assertEquals(FetchFailure.Offline, screen.lastFailure)
        assertEquals("$365.00", screen.allowance!!.amount)
        assertEquals("17 Oct 2026, 8:30 am", screen.lastChecked)
    }

    @Test
    fun `nothing cached gives an empty screen`() {
        val screen = model(null, lastFetch = null)

        assertNull(screen.allowance)
        assertNull(screen.lastChecked)
        assertNull(screen.lastFailure)
    }
}
