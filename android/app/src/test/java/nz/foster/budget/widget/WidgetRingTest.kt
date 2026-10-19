package nz.foster.budget.widget

import androidx.compose.ui.unit.dp
import nz.foster.budget.allowance.AmountTone
import nz.foster.budget.allowance.SpendingRing
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class WidgetRingTest {
    private val ring = SpendingRing(fill = 0.27f, pace = 0.45f, tone = AmountTone.Normal)

    @Test
    fun `a 3-cell widget shows the ring`() {
        assertEquals(ring, ringAtWidth(ring, 302.dp))
    }

    @Test
    fun `a 2-cell widget hides the ring so the amount does not wrap`() {
        assertNull(ringAtWidth(ring, 196.dp))
    }

    @Test
    fun `the ring shows from 240dp`() {
        assertNull(ringAtWidth(ring, 239.dp))
        assertEquals(ring, ringAtWidth(ring, 240.dp))
    }

    @Test
    fun `no ring stays no ring at any width`() {
        assertNull(ringAtWidth(null, 400.dp))
    }
}
