package nz.foster.budget.widget

import java.time.Instant
import nz.foster.budget.allowance.AllowanceSnapshot
import nz.foster.budget.allowance.AmountTone
import nz.foster.budget.api.SpendingAllowance
import nz.foster.budget.api.contractAllowance
import nz.foster.budget.auth.AuthState
import nz.foster.budget.cache.FetchFailure
import nz.foster.budget.cache.LastFetch
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WidgetStateTest {
    private val fetchedAt = Instant.parse("2026-10-16T19:30:00Z").toEpochMilli()
    private val succeeded = LastFetch.Succeeded(fetchedAt)
    private val failedOffline = LastFetch.Failed(fetchedAt + 1, FetchFailure.Offline)

    private fun state(
        allowance: SpendingAllowance?,
        lastFetch: LastFetch? = succeeded,
        auth: AuthState = AuthState.SignedIn,
    ) = widgetState(AllowanceSnapshot(auth, allowance, fetchedAt.takeIf { allowance != null }, lastFetch))

    private fun shown(allowance: SpendingAllowance, lastFetch: LastFetch? = succeeded) =
        state(allowance, lastFetch) as WidgetState.Allowance

    @Test
    fun `ok shows the amount, per week, and days left`() {
        assertEquals(
            WidgetState.Allowance(
                amount = "$365.00",
                tone = AmountTone.Normal,
                perWeek = "$150.29",
                daysLeft = 17,
                asOf = null,
                showsOfflineMark = false,
                uncategorizedBadgeCount = 1,
            ),
            state(contractAllowance("ok")),
        )
    }

    @Test
    fun `over shows the negative amount in the warning tone with no per-week figure`() {
        val over = shown(contractAllowance("over"))

        assertEquals("-$115.00", over.amount)
        assertEquals(AmountTone.Over, over.tone)
        assertNull(over.perWeek)
    }

    @Test
    fun `over hides a per-week figure even if the server sends one`() {
        assertNull(shown(contractAllowance("over").copy(perWeekCents = 100)).perWeek)
    }

    @Test
    fun `no budget names the month`() {
        assertEquals(WidgetState.NoBudget(month = "October 2026", showsOfflineMark = false), state(contractAllowance("no_budget")))
    }

    @Test
    fun `stale greys the number and shows the Data-as-of date`() {
        val stale = shown(contractAllowance("stale"))

        assertEquals(AmountTone.Stale, stale.tone)
        assertEquals("13 Oct", stale.asOf)
        assertEquals("$365.00", stale.amount)
        assertFalse(stale.showsOfflineMark)
    }

    @Test
    fun `stale and over keeps the warning tone and shows the Data-as-of date`() {
        val staleOver = contractAllowance("over").copy(stale = true, dataAsOf = contractAllowance("stale").dataAsOf)

        val shown = shown(staleOver)

        assertEquals(AmountTone.Over, shown.tone)
        assertEquals("13 Oct", shown.asOf)
    }

    @Test
    fun `a fresh Spending allowance has no as-of date`() {
        assertNull(shown(contractAllowance("ok")).asOf)
    }

    @Test
    fun `signed out shows Sign in whatever is cached`() {
        assertEquals(WidgetState.SignedOut, state(contractAllowance("ok"), auth = AuthState.SignedOut))
        assertEquals(WidgetState.SignedOut, state(null, lastFetch = null, auth = AuthState.SignedOut))
    }

    @Test
    fun `offline keeps the last good value with an offline mark`() {
        val offline = shown(contractAllowance("ok"), failedOffline)

        assertTrue(offline.showsOfflineMark)
        assertEquals("$365.00", offline.amount)
        assertEquals("$150.29", offline.perWeek)
    }

    @Test
    fun `a server error shows the offline mark`() {
        assertTrue(shown(contractAllowance("ok"), LastFetch.Failed(fetchedAt + 1, FetchFailure.ServerError)).showsOfflineMark)
    }

    @Test
    fun `a stale Spending allowance that then goes offline is both greyed and marked offline`() {
        val both = shown(contractAllowance("stale"), failedOffline)

        assertEquals(AmountTone.Stale, both.tone)
        assertEquals("13 Oct", both.asOf)
        assertTrue(both.showsOfflineMark)
    }

    @Test
    fun `no budget can be offline`() {
        assertEquals(
            WidgetState.NoBudget(month = "October 2026", showsOfflineMark = true),
            state(contractAllowance("no_budget"), failedOffline),
        )
    }

    @Test
    fun `signed in with nothing cached waits for the first fetch`() {
        assertEquals(WidgetState.NoAllowanceYet(showsOfflineMark = false), state(null, lastFetch = null))
        assertEquals(
            WidgetState.NoAllowanceYet(showsOfflineMark = true),
            state(null, lastFetch = LastFetch.Failed(fetchedAt, FetchFailure.Offline)),
        )
    }

    @Test
    fun `the Uncategorized badge shows in every state with a number`() {
        assertEquals(1, shown(contractAllowance("ok")).uncategorizedBadgeCount)
        assertEquals(1, shown(contractAllowance("over")).uncategorizedBadgeCount)
        assertEquals(1, shown(contractAllowance("stale")).uncategorizedBadgeCount)
        assertEquals(1, shown(contractAllowance("ok"), failedOffline).uncategorizedBadgeCount)
    }

    @Test
    fun `the Uncategorized badge is hidden when the count is zero`() {
        assertNull(shown(contractAllowance("ok").copy(uncategorizedCount = 0)).uncategorizedBadgeCount)
        assertNull(shown(contractAllowance("over").copy(uncategorizedCount = 0)).uncategorizedBadgeCount)
    }
}
