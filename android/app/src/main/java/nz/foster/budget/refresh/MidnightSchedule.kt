package nz.foster.budget.refresh

import java.time.Duration
import java.time.Instant
import java.time.ZoneId

/** Time from [now] to [after] past the next local midnight in [zone], measured in elapsed time. */
fun delayUntilAfterMidnight(now: Instant, zone: ZoneId, after: Duration = Duration.ofMinutes(5)): Duration {
    val today = now.atZone(zone).toLocalDate()
    val tonight = today.atStartOfDay(zone).plus(after).toInstant()
    val target = if (tonight.isAfter(now)) tonight else today.plusDays(1).atStartOfDay(zone).plus(after).toInstant()
    return Duration.between(now, target)
}
