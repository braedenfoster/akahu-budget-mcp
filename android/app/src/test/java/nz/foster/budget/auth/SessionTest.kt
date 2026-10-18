package nz.foster.budget.auth

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class SessionTest {
    @Test
    fun `round-trips through JSON`() {
        val original = session()
        val decoded = Json.decodeFromString(Session.serializer(), Json.encodeToString(Session.serializer(), original))
        assertEquals(original, decoded)
    }

    @Test
    fun `toString never contains a token`() {
        val text = session(refreshToken = "secret-refresh", accessToken = "secret-access").toString()
        assertFalse(text.contains("secret"))
    }
}
