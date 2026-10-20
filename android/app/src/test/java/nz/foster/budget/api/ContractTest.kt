package nz.foster.budget.api

import java.time.Instant
import java.time.LocalDate
import java.time.YearMonth
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class ContractTest {
    @Test
    fun `every contract file parses`() {
        val files = contractsDir.listFiles { f -> f.name.startsWith("spending-allowance.") && f.name.endsWith(".json") }
            .orEmpty()
        assertEquals(
            setOf("ok", "over", "no_budget", "stale", "no_bills_today"),
            files.map { it.name.split('.')[1] }.toSet(),
        )

        files.forEach { assertNotNull(it.name, parseAllowanceResponse(it.readText()).bills) }
    }

    @Test
    fun `ok parses every Bills field the app reads`() {
        val bills = contractBills("ok")

        assertEquals(
            listOf(
                BillOccurrence("Power", LocalDate.of(2026, 10, 12), BillOccurrenceState.Overdue, 21200L, estimated = false),
                BillOccurrence("Spotify", LocalDate.of(2026, 10, 13), BillOccurrenceState.Paid, 2649L, estimated = false),
                BillOccurrence("Internet", LocalDate.of(2026, 10, 14), BillOccurrenceState.Due, 8999L, estimated = false),
                BillOccurrence("Water", LocalDate.of(2026, 10, 20), BillOccurrenceState.Upcoming, 8000L, estimated = true),
            ),
            bills.occurrences,
        )
        assertEquals(38199L, bills.dueTotalCents)
        assertFalse(bills.stale)
    }

    @Test
    fun `the Bills view is present without a Budget and flags staleness`() {
        assertEquals(4, contractBills("no_budget").occurrences.size)
        assertTrue(contractBills("stale").stale)
    }

    @Test
    fun `a response without bills still parses`() {
        val root = Json.parseToJsonElement(contractJson("ok")).jsonObject
        val response = parseAllowanceResponse(JsonObject(root - "bills").toString())

        assertNull(response.bills)
        assertEquals(36500L, response.spendingAllowance.amountCents)
    }

    @Test
    fun `an unreadable Bills block leaves no Bills view but keeps the Spending allowance`() {
        val root = Json.parseToJsonElement(contractJson("ok")).jsonObject
        val bills = root.getValue("bills").jsonObject
        val row = bills.getValue("occurrences").jsonArray.first().jsonObject
        val withRow = { r: JsonObject -> JsonObject(bills + ("occurrences" to JsonArray(listOf(r)))) }
        val unreadable = listOf("occurrences", "due_total_cents", "stale").associateWith { JsonObject(bills - it) } +
            listOf("name", "due_date", "state", "amount_cents", "estimated").associateWith { withRow(JsonObject(row - it)) } +
            mapOf(
                "unknown state" to withRow(JsonObject(row + ("state" to JsonPrimitive("skipped")))),
                "malformed due_date" to withRow(JsonObject(row + ("due_date" to JsonPrimitive("12 Oct")))),
                "null" to JsonNull,
            )

        for ((case, block) in unreadable) {
            val response = parseAllowanceResponse(JsonObject(root + ("bills" to block)).toString())
            assertNull(case, response.bills)
            assertEquals(case, 36500L, response.spendingAllowance.amountCents)
        }
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
