package nz.foster.budget.api

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
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
    /** `YYYY-MM`. */
    val period: String,
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
    /** ISO-8601 instant of the last Akahu sync. */
    @SerialName("data_as_of") val dataAsOf: String?,
    val stale: Boolean,
)

private val json = Json { ignoreUnknownKeys = true }

/** Throws [kotlinx.serialization.SerializationException] when the body does not match the contract. */
fun parseSpendingAllowance(body: String): SpendingAllowance =
    json.decodeFromString<SpendingAllowanceResponse>(body).spendingAllowance
