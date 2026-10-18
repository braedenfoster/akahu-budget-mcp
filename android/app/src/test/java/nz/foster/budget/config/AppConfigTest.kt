package nz.foster.budget.config

import org.junit.Assert.assertEquals
import org.junit.Test

class AppConfigTest {
    @Test
    fun `lists every blank value by its config key`() {
        assertEquals(
            listOf("STYTCH_ANDROID_CLIENT_ID", "AUTH_ISSUER", "PUBLIC_URL"),
            AppConfig("", " ", "").missingKeys,
        )
    }

    @Test
    fun `lists nothing when every value is set`() {
        assertEquals(emptyList<String>(), AppConfig("connected-app-test", "https://x.customers.stytch.dev", "https://host.ts.net").missingKeys)
    }
}
