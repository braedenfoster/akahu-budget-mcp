package nz.foster.budget.api

import java.time.Instant
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

// Every field is required with no default, so a renamed or removed field fails the contract test.
// Unknown keys are ignored: the server still sends display strings the app must not use.
@Serializable
data class SpendingAllowanceResponse(
    @SerialName("spending_allowance") val spendingAllowance: SpendingAllowance,
)

@Serializable
enum class AllowanceStatus {
    @SerialName("ok") Ok,
    @SerialName("over") Over,
    @SerialName("no_budget") NoBudget,
}

@Serializable
data class SpendingAllowance(
    @Serializable(with = YearMonthSerializer::class) val period: YearMonth,
    val status: AllowanceStatus,
    /** Null when there is no Budget. */
    @SerialName("amount_cents") val amountCents: Long?,
    /** Null when there is no Budget or the amount is negative. */
    @SerialName("per_week_cents") val perWeekCents: Long?,
    @SerialName("days_left") val daysLeft: Int,
    @SerialName("flexible_remaining_cents") val flexibleRemainingCents: Long?,
    @SerialName("committed_overspend_cents") val committedOverspendCents: Long?,
    @SerialName("uncategorized_spent_cents") val uncategorizedSpentCents: Long?,
    @SerialName("uncategorized_count") val uncategorizedCount: Int,
    /** The last Akahu sync. */
    @Serializable(with = InstantSerializer::class) @SerialName("data_as_of") val dataAsOf: Instant?,
    val stale: Boolean,
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

private val json = Json { ignoreUnknownKeys = true }

/** Throws [kotlinx.serialization.SerializationException] when the body does not match the contract. */
fun parseSpendingAllowance(body: String): SpendingAllowance =
    json.decodeFromString<SpendingAllowanceResponse>(body).spendingAllowance
