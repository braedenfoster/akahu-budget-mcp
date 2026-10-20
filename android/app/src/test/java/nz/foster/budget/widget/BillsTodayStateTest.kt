package nz.foster.budget.widget

import nz.foster.budget.allowance.AllowanceSnapshot
import nz.foster.budget.allowance.AmountTone
import nz.foster.budget.allowance.OccurrenceRow
import nz.foster.budget.api.BillsView
import nz.foster.budget.api.contractAllowance
import nz.foster.budget.api.contractBills
import nz.foster.budget.auth.AuthState
import nz.foster.budget.cache.FetchFailure
import nz.foster.budget.cache.LastFetch
import org.junit.Assert.assertEquals
import org.junit.Test

class BillsTodayStateTest {
    private val succeeded = LastFetch.Succeeded(1L)
    private val failedOffline = LastFetch.Failed(2L, FetchFailure.Offline)

    private fun state(fixture: String, bills: BillsView? = contractBills(fixture), lastFetch: LastFetch = succeeded) =
        billsTodayState(AllowanceSnapshot(AuthState.SignedIn, contractAllowance(fixture), 1L, lastFetch, bills))

    private val power = OccurrenceRow("Mon", "Power", "$212.00", paid = false, tone = AmountTone.Over)
    private val spotify = OccurrenceRow("Tue", "Spotify", "$26.49", paid = true, tone = AmountTone.Normal)
    private val internet = OccurrenceRow("Wed", "Internet", "$89.99", paid = false, tone = AmountTone.Normal)

    @Test
    fun `today's rows show with a tick for paid and the warning colour for overdue`() {
        assertEquals(
            BillsTodayState.Today(rows = listOf(power, spotify, internet), moreCount = 0, asOf = null, showsOfflineMark = false),
            state("ok"),
        )
    }

    @Test
    fun `more than 3 rows shows the first 3 in the server's order and counts the rest`() {
        val ok = contractBills("ok")
        val five = ok.copy(today = ok.today + ok.today.take(2))

        assertEquals(
            BillsTodayState.Today(rows = listOf(power, spotify, internet), moreCount = 2, asOf = null, showsOfflineMark = false),
            state("ok", five),
        )
    }

    @Test
    fun `no Bills today shows the next upcoming Bill`() {
        assertEquals(
            BillsTodayState.NoneToday(
                next = OccurrenceRow("Tue", "Water", "~$80.00", paid = false, tone = AmountTone.Normal),
                asOf = null,
                showsOfflineMark = false,
            ),
            state("no_bills_today"),
        )
    }

    @Test
    fun `no Bills today and no next upcoming Bill shows only that`() {
        val none = contractBills("no_bills_today").copy(nextUpcoming = null)

        assertEquals(BillsTodayState.NoneToday(next = null, asOf = null, showsOfflineMark = false), state("no_bills_today", none))
    }

    @Test
    fun `stale greys the rows and shows the Data-as-of date, but an overdue row keeps the warning colour`() {
        assertEquals(
            BillsTodayState.Today(
                rows = listOf(power, spotify.copy(tone = AmountTone.Stale), internet.copy(tone = AmountTone.Stale)),
                moreCount = 0,
                asOf = "13 Oct",
                showsOfflineMark = false,
            ),
            state("stale"),
        )
    }

    @Test
    fun `stale greys the next upcoming Bill and shows the Data-as-of date`() {
        val stale = contractBills("no_bills_today").copy(stale = true, dataAsOf = contractBills("stale").dataAsOf)
        val none = state("no_bills_today", stale) as BillsTodayState.NoneToday

        assertEquals(AmountTone.Stale, none.next?.tone)
        assertEquals("13 Oct", none.asOf)
    }

    @Test
    fun `a response without bills asks the Member to open the app`() {
        assertEquals(BillsTodayState.BillsUnavailable(showsOfflineMark = false), state("ok", bills = null))
    }

    @Test
    fun `offline keeps the cached Bills with an offline mark`() {
        assertEquals(
            BillsTodayState.Today(rows = listOf(power, spotify, internet), moreCount = 0, asOf = null, showsOfflineMark = true),
            state("ok", lastFetch = failedOffline),
        )
        assertEquals(true, (state("no_bills_today", lastFetch = failedOffline) as BillsTodayState.NoneToday).showsOfflineMark)
    }

    @Test
    fun `signed out shows Sign in whatever is cached`() {
        assertEquals(
            BillsTodayState.SignedOut,
            billsTodayState(AllowanceSnapshot(AuthState.SignedOut, contractAllowance("ok"), 1L, succeeded, contractBills("ok"))),
        )
        assertEquals(BillsTodayState.SignedOut, billsTodayState(AllowanceSnapshot(AuthState.SignedOut, null, null, null)))
    }

    @Test
    fun `signed in with nothing cached waits for the first fetch, as the Spending widget does`() {
        assertEquals(
            BillsTodayState.NothingCached(showsOfflineMark = false),
            billsTodayState(AllowanceSnapshot(AuthState.SignedIn, null, null, null)),
        )
        assertEquals(
            BillsTodayState.NothingCached(showsOfflineMark = true),
            billsTodayState(AllowanceSnapshot(AuthState.SignedIn, null, null, failedOffline)),
        )
    }
}
