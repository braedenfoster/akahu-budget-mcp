package nz.foster.budget.api

import java.time.Instant
import java.time.YearMonth
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class ContractTest {
    @Test
    fun `every contract file parses`() {
        val files = contractsDir.listFiles { f -> f.name.startsWith("spending-allowance.") && f.name.endsWith(".json") }
            .orEmpty()
        assertEquals(setOf("ok", "over", "no_budget", "stale"), files.map { it.name.split('.')[1] }.toSet())

        files.forEach { parseSpendingAllowance(it.readText()) }
    }

    @Test
    fun `ok parses every field the app reads`() {
        val a = contractAllowance("ok")

        assertEquals(AllowanceStatus.Ok, a.status)
        assertEquals(YearMonth.of(2026, 10), a.period)
        assertEquals(36500L, a.amountCents)
        assertEquals(15029L, a.perWeekCents)
        assertEquals(17, a.daysLeft)
        assertEquals(31, a.periodDays)
        assertEquals(38000L, a.flexibleRemainingCents)
        assertEquals(50000L, a.flexibleAllocatedCents)
        assertEquals(0L, a.committedOverspendCents)
        assertEquals(1500L, a.uncategorizedSpentCents)
        assertEquals(1, a.uncategorizedCount)
        assertEquals(Instant.parse("2026-10-15T08:00:00Z"), a.dataAsOf)
        assertFalse(a.stale)
    }

    @Test
    fun `over has a negative amount and no per-week figure`() {
        val a = contractAllowance("over")

        assertEquals(AllowanceStatus.Over, a.status)
        assertEquals(-11500L, a.amountCents)
        assertNull(a.perWeekCents)
    }

    @Test
    fun `no_budget has no amounts`() {
        val a = contractAllowance("no_budget")

        assertEquals(AllowanceStatus.NoBudget, a.status)
        assertNull(a.amountCents)
        assertNull(a.flexibleRemainingCents)
        assertNull(a.flexibleAllocatedCents)
        assertNull(a.committedOverspendCents)
        assertNull(a.uncategorizedSpentCents)
        assertEquals(1, a.uncategorizedCount)
        assertEquals(31, a.periodDays)
    }

    @Test
    fun `stale is flagged`() {
        assertTrue(contractAllowance("stale").stale)
    }

    @Test
    fun `removing any field the app reads fails the parse`() {
        val root = Json.parseToJsonElement(contractJson("ok")).jsonObject
        val block = root.getValue("spending_allowance").jsonObject
        val readFields = listOf(
            "period", "status", "amount_cents", "per_week_cents", "days_left", "period_days",
            "flexible_remaining_cents", "flexible_allocated_cents", "committed_overspend_cents", "uncategorized_spent_cents",
            "uncategorized_count", "data_as_of", "stale",
        )

        for (field in readFields) {
            val trimmed = JsonObject(mapOf("spending_allowance" to JsonObject(block - field)))
            assertThrows(field, SerializationException::class.java) { parseSpendingAllowance(trimmed.toString()) }
        }
    }

    @Test
    fun `unknown keys are ignored`() {
        val json = contractJson("ok").replace("\"stale\"", "\"something_new\": 1, \"stale\"")

        assertEquals(36500L, parseSpendingAllowance(json).amountCents)
    }

    @Test
    fun `a malformed period fails the parse`() {
        val body = contractJson("ok").replace("\"2026-10\"", "\"October 2026\"")

        assertThrows(SerializationException::class.java) { parseSpendingAllowance(body) }
    }

    @Test
    fun `a malformed data_as_of fails the parse`() {
        val body = contractJson("ok").replace("\"2026-10-15T08:00:00.000Z\"", "\"15 Oct 2026\"")

        assertThrows(SerializationException::class.java) { parseSpendingAllowance(body) }
    }
}
