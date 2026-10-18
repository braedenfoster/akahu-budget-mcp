package nz.foster.budget.refresh

import java.time.Duration
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import org.junit.Assert.assertEquals
import org.junit.Test

class MidnightScheduleTest {
    private val auckland = ZoneId.of("Pacific/Auckland")

    private fun runFrom(local: String) =
        nextMidnightRun(ZonedDateTime.parse("$local[Pacific/Auckland]").toInstant(), auckland)

    @Test
    fun `the fetch runs five minutes after the next local midnight`() {
        assertEquals(MidnightRun(LocalDate.of(2026, 10, 19), Duration.ofMinutes(65)), runFrom("2026-10-18T23:00:00+13:00"))
        assertEquals(
            MidnightRun(LocalDate.of(2026, 10, 19), Duration.ofHours(12).plusMinutes(5)),
            runFrom("2026-10-18T12:00:00+13:00"),
        )
    }

    @Test
    fun `just after midnight the fetch runs tonight's slot`() {
        assertEquals(MidnightRun(LocalDate.of(2026, 10, 19), Duration.ofMinutes(3)), runFrom("2026-10-19T00:02:00+13:00"))
    }

    @Test
    fun `a midnight run that schedules the next one targets the following day`() {
        assertEquals(MidnightRun(LocalDate.of(2026, 10, 20), Duration.ofHours(24)), runFrom("2026-10-19T00:05:00+13:00"))
        assertEquals(
            MidnightRun(LocalDate.of(2026, 10, 20), Duration.ofHours(24).minusMinutes(1)),
            runFrom("2026-10-19T00:06:00+13:00"),
        )
    }

    @Test
    fun `the day the clocks go forward is an hour shorter`() {
        // 27 Sep 2026: 2:00 am NZST becomes 3:00 am NZDT.
        assertEquals(Duration.ofHours(22).plusMinutes(35), runFrom("2026-09-27T00:30:00+12:00").delay)
    }

    @Test
    fun `the day the clocks go back is an hour longer`() {
        // 4 Apr 2027: 3:00 am NZDT becomes 2:00 am NZST.
        assertEquals(Duration.ofHours(24).plusMinutes(35), runFrom("2027-04-04T00:30:00+13:00").delay)
    }

    @Test
    fun `the date and delay use the Household zone, not UTC`() {
        val midnightUtc = ZonedDateTime.parse("2026-10-18T00:00:00Z").toInstant()

        assertEquals(
            MidnightRun(LocalDate.of(2026, 10, 19), Duration.ofHours(11).plusMinutes(5)),
            nextMidnightRun(midnightUtc, auckland),
        )
    }
}
