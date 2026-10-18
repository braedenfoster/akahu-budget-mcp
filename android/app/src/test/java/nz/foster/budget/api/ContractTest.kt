package nz.foster.budget.api

import java.io.File
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class ContractTest {
    private val contractsDir = File(
        System.getProperty("budget.contractsDir") ?: error("budget.contractsDir is not set; run through Gradle"),
    )

    private fun contract(state: String) = File(contractsDir, "spending-allowance.$state.json").readText()

    @Test
    fun `every contract file parses`() {
        val files = contractsDir.listFiles { f -> f.name.startsWith("spending-allowance.") && f.name.endsWith(".json") }
            .orEmpty()
        assertEquals(setOf("ok", "over", "no_budget", "stale"), files.map { it.name.split('.')[1] }.toSet())

        files.forEach { parseSpendingAllowance(it.readText()) }
    }

    @Test
    fun `ok parses every field the app reads`() {
        val a = parseSpendingAllowance(contract("ok"))

        assertEquals(AllowanceStatus.Ok, a.status)
        assertEquals("2026-10", a.period)
        assertEquals(36500L, a.amountCents)
        assertEquals(15029L, a.perWeekCents)
        assertEquals(17, a.daysLeft)
        assertEquals(38000L, a.flexibleRemainingCents)
        assertEquals(0L, a.committedOverspendCents)
        assertEquals(1500L, a.uncategorizedSpentCents)
        assertEquals(1, a.uncategorizedCount)
        assertEquals("2026-10-15T08:00:00.000Z", a.dataAsOf)
        assertFalse(a.stale)
    }

    @Test
    fun `over has a negative amount and no per-week figure`() {
        val a = parseSpendingAllowance(contract("over"))

        assertEquals(AllowanceStatus.Over, a.status)
        assertEquals(-11500L, a.amountCents)
        assertNull(a.perWeekCents)
    }

    @Test
    fun `no_budget has no amounts`() {
        val a = parseSpendingAllowance(contract("no_budget"))

        assertEquals(AllowanceStatus.NoBudget, a.status)
        assertNull(a.amountCents)
        assertNull(a.flexibleRemainingCents)
        assertNull(a.committedOverspendCents)
        assertNull(a.uncategorizedSpentCents)
        assertEquals(1, a.uncategorizedCount)
    }

    @Test
    fun `stale is flagged`() {
        assertTrue(parseSpendingAllowance(contract("stale")).stale)
    }

    @Test
    fun `removing any field the app reads fails the parse`() {
        val root = Json.parseToJsonElement(contract("ok")).jsonObject
        val block = root.getValue("spending_allowance").jsonObject
        val readFields = listOf(
            "period", "status", "amount_cents", "per_week_cents", "days_left",
            "flexible_remaining_cents", "committed_overspend_cents", "uncategorized_spent_cents",
            "uncategorized_count", "data_as_of", "stale",
        )

        for (field in readFields) {
            val trimmed = JsonObject(mapOf("spending_allowance" to JsonObject(block - field)))
            try {
                parseSpendingAllowance(trimmed.toString())
                fail("parse succeeded without $field")
            } catch (_: SerializationException) {
            }
        }
    }

    @Test
    fun `unknown keys are ignored`() {
        val json = contract("ok").replace("\"stale\"", "\"something_new\": 1, \"stale\"")

        assertEquals(36500L, parseSpendingAllowance(json).amountCents)
    }
}
