package nz.foster.budget.refresh

import java.time.Duration
import java.time.ZoneId
import java.time.ZonedDateTime
import org.junit.Assert.assertEquals
import org.junit.Test

class MidnightScheduleTest {
    private val auckland = ZoneId.of("Pacific/Auckland")

    private fun delayFrom(local: String) =
        delayUntilAfterMidnight(ZonedDateTime.parse("$local[Pacific/Auckland]").toInstant(), auckland)

    @Test
    fun `the fetch runs five minutes after the next local midnight`() {
        assertEquals(Duration.ofMinutes(65), delayFrom("2026-10-18T23:00:00+13:00"))
        assertEquals(Duration.ofHours(12).plusMinutes(5), delayFrom("2026-10-18T12:00:00+13:00"))
    }

    @Test
    fun `just after midnight the fetch runs tonight's slot`() {
        assertEquals(Duration.ofMinutes(3), delayFrom("2026-10-19T00:02:00+13:00"))
    }

    @Test
    fun `at or past tonight's slot the fetch waits for the next midnight`() {
        assertEquals(Duration.ofHours(24), delayFrom("2026-10-19T00:05:00+13:00"))
        assertEquals(Duration.ofHours(24).minusMinutes(1), delayFrom("2026-10-19T00:06:00+13:00"))
    }

    @Test
    fun `the day the clocks go forward is an hour shorter`() {
        // 27 Sep 2026: 2:00 am NZST becomes 3:00 am NZDT.
        assertEquals(Duration.ofHours(22).plusMinutes(35), delayFrom("2026-09-27T00:30:00+12:00"))
    }

    @Test
    fun `the day the clocks go back is an hour longer`() {
        // 4 Apr 2027: 3:00 am NZDT becomes 2:00 am NZST.
        assertEquals(Duration.ofHours(24).plusMinutes(35), delayFrom("2027-04-04T00:30:00+13:00"))
    }

    @Test
    fun `the delay uses the Household zone, not UTC`() {
        val midnightUtc = ZonedDateTime.parse("2026-10-18T00:00:00Z").toInstant()

        assertEquals(Duration.ofHours(11).plusMinutes(5), delayUntilAfterMidnight(midnightUtc, auckland))
    }
}
