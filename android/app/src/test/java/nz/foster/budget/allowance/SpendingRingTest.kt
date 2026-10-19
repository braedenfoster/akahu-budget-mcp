package nz.foster.budget.allowance

import nz.foster.budget.api.contractAllowance
import nz.foster.budget.api.contractPace
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SpendingRingTest {
    @Test
    fun `ok fills with the spent share of the Flexible allocation`() {
        val ring = spendingRing(contractAllowance("ok"))!!

        assertEquals(0.27f, ring.fill, 0.0001f)
        assertEquals(contractPace, ring.pace)
        assertEquals(AmountTone.Normal, ring.tone)
    }

    @Test
    fun `over is a full ring in the warning tone`() {
        assertEquals(SpendingRing(fill = 1f, pace = contractPace, tone = AmountTone.Over), spendingRing(contractAllowance("over")))
    }

    @Test
    fun `a zero Flexible allocation has no ring`() {
        assertNull(spendingRing(contractAllowance("ok").copy(flexibleAllocatedCents = 0)))
        assertNull(spendingRing(contractAllowance("over").copy(flexibleAllocatedCents = 0)))
    }

    @Test
    fun `stale fills with the spent share in the grey tone`() {
        assertEquals(SpendingRing(fill = 0.27f, pace = contractPace, tone = AmountTone.Stale), spendingRing(contractAllowance("stale")))
    }

    @Test
    fun `stale and over keeps the full warning ring`() {
        assertEquals(
            SpendingRing(fill = 1f, pace = contractPace, tone = AmountTone.Over),
            spendingRing(contractAllowance("over").copy(stale = true)),
        )
    }

    @Test
    fun `no budget has no ring`() {
        assertNull(spendingRing(contractAllowance("no_budget")))
    }

    @Test
    fun `a null Flexible allocation has no ring`() {
        assertNull(spendingRing(contractAllowance("ok").copy(flexibleAllocatedCents = null)))
    }

    @Test
    fun `more left than allocated clamps to an empty ring`() {
        // A Refund can leave the Spending allowance above the Flexible allocation.
        val ring = spendingRing(contractAllowance("ok").copy(amountCents = 52000))!!

        assertEquals(0f, ring.fill)
    }

    @Test
    fun `nothing left is a full ring`() {
        assertEquals(1f, spendingRing(contractAllowance("ok").copy(amountCents = 0))!!.fill)
    }

    private fun paceWith(daysLeft: Int, periodDays: Int = 31): Float =
        spendingRing(contractAllowance("ok").copy(daysLeft = daysLeft, periodDays = periodDays))!!.pace

    @Test
    fun `the pace tick is at the start on the Period's first day`() {
        assertEquals(0f, paceWith(daysLeft = 31))
    }

    @Test
    fun `the pace tick is one day short of the end on the Period's last day`() {
        assertEquals(30f / 31, paceWith(daysLeft = 1), 0.0001f)
    }

    @Test
    fun `the pace tick is at the end once the Period is over`() {
        assertEquals(1f, paceWith(daysLeft = 0))
    }

    @Test
    fun `the pace tick follows a pay-cycle Period's length`() {
        assertEquals(25f / 30, paceWith(daysLeft = 5, periodDays = 30), 0.0001f)
    }

    @Test
    fun `the pace clamps to 0 to 1`() {
        assertEquals(0f, paceWith(daysLeft = 40))
        assertEquals(1f, paceWith(daysLeft = -1))
    }

    @Test
    fun `a zero-day Period puts the pace tick at the start`() {
        assertEquals(0f, paceWith(daysLeft = 0, periodDays = 0))
    }
}
