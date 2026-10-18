package nz.foster.budget.allowance

import java.math.BigDecimal
import java.text.NumberFormat
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.util.Currency
import nz.foster.budget.api.AllowanceStatus
import nz.foster.budget.api.SpendingAllowance

/** Formats server cents for display. The app does no other money math (ADR-0003). */
fun formatNzd(cents: Long): String {
    val format = NumberFormat.getCurrencyInstance(HOUSEHOLD_LOCALE).apply { currency = Currency.getInstance("NZD") }
    return format.format(BigDecimal.valueOf(cents, 2))
}

fun householdDateFormat(pattern: String): DateTimeFormatter =
    DateTimeFormatter.ofPattern(pattern, HOUSEHOLD_LOCALE).withZone(HOUSEHOLD_ZONE)

private val monthFormat = DateTimeFormatter.ofPattern("MMMM yyyy", HOUSEHOLD_LOCALE)

fun formatMonth(period: YearMonth): String = monthFormat.format(period)

enum class AmountTone { Normal, Over, Stale }

/** An overspend keeps the warning colour when stale; the as-of date still marks the staleness. */
val SpendingAllowance.amountTone: AmountTone
    get() = when {
        status == AllowanceStatus.Over -> AmountTone.Over
        stale -> AmountTone.Stale
        else -> AmountTone.Normal
    }
