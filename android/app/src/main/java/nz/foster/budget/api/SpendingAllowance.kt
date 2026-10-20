package nz.foster.budget.api

import java.time.Instant
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeParseException
import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.decodeFromJsonElement

data class SpendingAllowanceResponse(
    val spendingAllowance: SpendingAllowance,
    /** Null when the server is older than the Bills view or sends a block this APK cannot read. */
    val bills: BillsView?,
)

@Serializable
private data class RawResponse(
    @SerialName("spending_allowance") val spendingAllowance: SpendingAllowance,
    val bills: JsonElement? = null,
)

@Serializable
enum class AllowanceStatus {
    @SerialName("ok") Ok,
    @SerialName("over") Over,
    @SerialName("no_budget") NoBudget,
}

// Every field is required with no default, so a renamed or removed field fails the contract test.
// Unknown keys are ignored: the server still sends display strings the app must not use.
@Serializable
data class SpendingAllowance(
    @Serializable(with = YearMonthSerializer::class) val period: YearMonth,
    val status: AllowanceStatus,
    /** Null when there is no Budget. */
    @SerialName("amount_cents") val amountCents: Long?,
    /** Null when there is no Budget or the amount is negative. */
    @SerialName("per_week_cents") val perWeekCents: Long?,
    @SerialName("days_left") val daysLeft: Int,
    /** Calendar days in the Period, including a pay-cycle Period that spans two months. */
    @SerialName("period_days") val periodDays: Int,
    @SerialName("flexible_remaining_cents") val flexibleRemainingCents: Long?,
    /** The Flexible Envelopes' allocations, without Uncategorized. Null when there is no Budget. */
    @SerialName("flexible_allocated_cents") val flexibleAllocatedCents: Long?,
    @SerialName("committed_overspend_cents") val committedOverspendCents: Long?,
    @SerialName("uncategorized_spent_cents") val uncategorizedSpentCents: Long?,
    @SerialName("uncategorized_count") val uncategorizedCount: Int,
    /** The last Akahu sync. */
    @Serializable(with = InstantSerializer::class) @SerialName("data_as_of") val dataAsOf: Instant?,
    val stale: Boolean,
)

/** The server's week list of Bill occurrences, already filtered and sorted. */
@Serializable
data class BillsView(
    val occurrences: List<BillOccurrence>,
    /** The week list's occurrences due on or before today: today's, recent due and overdue ones, and recently paid ones. */
    val today: List<BillOccurrence>,
    /** The first occurrence after today, even beyond the week. Null when no active Bill has one. */
    @SerialName("next_upcoming") val nextUpcoming: BillOccurrence?,
    /** The occurrences that are not paid, summed by the server. */
    @SerialName("due_total_cents") val dueTotalCents: Long,
    /** The same last Akahu sync as the Spending allowance. */
    @Serializable(with = InstantSerializer::class) @SerialName("data_as_of") val dataAsOf: Instant?,
    val stale: Boolean,
)

@Serializable
enum class BillOccurrenceState {
    @SerialName("upcoming") Upcoming,
    @SerialName("due") Due,
    @SerialName("paid") Paid,
    @SerialName("overdue") Overdue,
}

@Serializable
data class BillOccurrence(
    val name: String,
    /** A Household calendar date. */
    @Serializable(with = LocalDateSerializer::class) @SerialName("due_date") val dueDate: LocalDate,
    val state: BillOccurrenceState,
    /** The actual debit when paid. */
    @SerialName("amount_cents") val amountCents: Long,
    /** The server's estimate for a Bill with a varying amount. */
    val estimated: Boolean,
)

private abstract class IsoStringSerializer<T : Any>(name: String, private val parse: (String) -> T) : KSerializer<T> {
    override val descriptor = PrimitiveSerialDescriptor(name, PrimitiveKind.STRING)

    override fun deserialize(decoder: Decoder): T {
        val text = decoder.decodeString()
        return try {
            parse(text)
        } catch (e: DateTimeParseException) {
            throw SerializationException("bad ${descriptor.serialName}: $text", e)
        }
    }

    override fun serialize(encoder: Encoder, value: T) = encoder.encodeString(value.toString())
}

private object YearMonthSerializer : IsoStringSerializer<YearMonth>("nz.foster.budget.YearMonth", YearMonth::parse)

private object InstantSerializer : IsoStringSerializer<Instant>("nz.foster.budget.Instant", Instant::parse)

private object LocalDateSerializer : IsoStringSerializer<LocalDate>("nz.foster.budget.LocalDate", LocalDate::parse)

private val json = Json { ignoreUnknownKeys = true }

/**
 * Throws [kotlinx.serialization.SerializationException] when the Spending allowance does not match the contract.
 * An unreadable Bills block gives null instead, so a later server change to Bills cannot hide the Spending allowance.
 */
fun parseAllowanceResponse(body: String): SpendingAllowanceResponse {
    val raw = json.decodeFromString<RawResponse>(body)
    return SpendingAllowanceResponse(raw.spendingAllowance, raw.bills?.let(::readBills))
}

private fun readBills(element: JsonElement): BillsView? = try {
    json.decodeFromJsonElement<BillsView>(element)
} catch (_: SerializationException) {
    null
}

/** Throws [kotlinx.serialization.SerializationException] when the body does not match the contract. */
fun parseSpendingAllowance(body: String): SpendingAllowance = parseAllowanceResponse(body).spendingAllowance
