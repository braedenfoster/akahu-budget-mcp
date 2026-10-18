package nz.foster.budget.allowance

import java.time.YearMonth
import nz.foster.budget.api.contractAllowance
import org.junit.Assert.assertEquals
import org.junit.Test

class DisplayTest {
    @Test
    fun `formats positive cents as NZD`() {
        assertEquals("$365.00", formatNzd(36500))
        assertEquals("$150.29", formatNzd(15029))
        assertEquals("$1,234,567.89", formatNzd(123456789))
    }

    @Test
    fun `formats zero and small values`() {
        assertEquals("$0.00", formatNzd(0))
        assertEquals("$0.05", formatNzd(5))
    }

    @Test
    fun `formats negative cents with a leading minus`() {
        assertEquals("-$115.00", formatNzd(-11500))
        assertEquals("-$0.01", formatNzd(-1))
    }

    @Test
    fun `formats a Period as month and year`() {
        assertEquals("October 2026", formatMonth(YearMonth.of(2026, 10)))
    }

    @Test
    fun `the amount tone follows status and staleness`() {
        assertEquals(AmountTone.Normal, contractAllowance("ok").amountTone)
        assertEquals(AmountTone.Over, contractAllowance("over").amountTone)
        assertEquals(AmountTone.Stale, contractAllowance("stale").amountTone)
    }

    @Test
    fun `an overspend keeps the warning tone when stale`() {
        assertEquals(AmountTone.Over, contractAllowance("over").copy(stale = true).amountTone)
    }
}
