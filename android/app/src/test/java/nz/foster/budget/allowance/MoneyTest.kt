package nz.foster.budget.allowance

import org.junit.Assert.assertEquals
import org.junit.Test

class MoneyTest {
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
}
