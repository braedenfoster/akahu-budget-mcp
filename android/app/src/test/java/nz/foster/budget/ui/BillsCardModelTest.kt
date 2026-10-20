package nz.foster.budget.ui

import nz.foster.budget.allowance.AllowanceSnapshot
import nz.foster.budget.allowance.AmountTone
import nz.foster.budget.api.BillsView
import nz.foster.budget.api.contractAllowance
import nz.foster.budget.api.contractBills
import nz.foster.budget.auth.AuthState
import nz.foster.budget.cache.LastFetch
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class BillsCardModelTest {
    private val weekRows = listOf(
        OccurrenceRow("Mon", "Power", "$212.00", paid = false, tone = AmountTone.Over),
        OccurrenceRow("Tue", "Spotify", "$26.49", paid = true, tone = AmountTone.Normal),
        OccurrenceRow("Wed", "Internet", "$89.99", paid = false, tone = AmountTone.Normal),
        OccurrenceRow("Tue", "Water", "~$80.00", paid = false, tone = AmountTone.Normal),
    )

    @Test
    fun `ok shows the server's total and the week's rows in the server's order`() {
        assertEquals(BillsCardModel("$381.99", AmountTone.Normal, weekRows), billsCardModel(contractBills("ok")))
    }

    @Test
    fun `the card does not depend on the Budget`() {
        for (state in listOf("over", "no_budget")) {
            assertEquals(state, billsCardModel(contractBills("ok")), billsCardModel(contractBills(state)))
        }
    }

    @Test
    fun `stale greys the total and the rows, but an overdue row keeps the warning colour`() {
        val card = billsCardModel(contractBills("stale"))

        assertEquals(AmountTone.Stale, card.totalTone)
        assertEquals(
            listOf(AmountTone.Over, AmountTone.Stale, AmountTone.Stale, AmountTone.Stale),
            card.rows.map { it.tone },
        )
        assertEquals(weekRows.map { it.copy(tone = AmountTone.Normal) }, card.rows.map { it.copy(tone = AmountTone.Normal) })
    }

    @Test
    fun `a week with only an upcoming Bill shows that row`() {
        assertEquals(
            BillsCardModel("$80.00", AmountTone.Normal, listOf(weekRows.last())),
            billsCardModel(contractBills("no_bills_today")),
        )
    }

    @Test
    fun `an empty week has no rows`() {
        assertEquals(
            BillsCardModel("$0.00", AmountTone.Normal, emptyList()),
            billsCardModel(BillsView(occurrences = emptyList(), dueTotalDisplay = "$0.00", stale = false)),
        )
    }

    @Test
    fun `the screen carries the card for every fixture`() {
        for (state in listOf("ok", "over", "no_budget", "stale", "no_bills_today")) {
            val snapshot = AllowanceSnapshot(AuthState.SignedIn, contractAllowance(state), 1L, LastFetch.Succeeded(1L), contractBills(state))
            assertEquals(state, billsCardModel(contractBills(state)), allowanceScreenModel(snapshot).bills)
        }
    }

    @Test
    fun `a response without bills shows no card`() {
        val snapshot = AllowanceSnapshot(AuthState.SignedIn, contractAllowance("ok"), 1L, LastFetch.Succeeded(1L), bills = null)

        assertNull(allowanceScreenModel(snapshot).bills)
    }
}
