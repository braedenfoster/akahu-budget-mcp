package nz.foster.budget.api

import org.junit.Assert.assertEquals
import org.junit.Test

class SpendingAllowanceApiTest {
    @Test
    fun `reads the plain route with no sync or force parameter`() {
        val expected = "https://budget.example.ts.net/api/spending-allowance"
        assertEquals(expected, spendingAllowanceUrl("https://budget.example.ts.net"))
        assertEquals(expected, spendingAllowanceUrl("https://budget.example.ts.net/"))
    }
}
