package nz.foster.budget.allowance

import java.math.BigDecimal
import java.text.NumberFormat
import java.util.Currency
import java.util.Locale

private val NZ = Locale("en", "NZ")

/** Formats server cents for display. The app does no other money math (ADR-0003). */
fun formatNzd(cents: Long): String {
    val format = NumberFormat.getCurrencyInstance(NZ).apply { currency = Currency.getInstance("NZD") }
    return format.format(BigDecimal.valueOf(cents, 2))
}
