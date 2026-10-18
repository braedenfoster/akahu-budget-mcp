package nz.foster.budget.allowance

import java.time.ZoneId
import java.util.Locale

/** The server counts Periods and days left in this zone, so the phone shows dates in it too. */
val HOUSEHOLD_ZONE: ZoneId = ZoneId.of("Pacific/Auckland")

val HOUSEHOLD_LOCALE: Locale = Locale("en", "NZ")
