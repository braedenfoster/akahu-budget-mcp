package nz.foster.budget.refresh

import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

private val AFTER_MIDNIGHT: Duration = Duration.ofMinutes(5)

/** The fetch that rolls [date] over, and the elapsed time until it is due. */
data class MidnightRun(val date: LocalDate, val delay: Duration)

fun nextMidnightRun(now: Instant, zone: ZoneId): MidnightRun {
    val today = now.atZone(zone).toLocalDate()
    val date = if (slot(today, zone).isAfter(now)) today else today.plusDays(1)
    return MidnightRun(date, Duration.between(now, slot(date, zone)))
}

private fun slot(date: LocalDate, zone: ZoneId): Instant = date.atStartOfDay(zone).plus(AFTER_MIDNIGHT).toInstant()
