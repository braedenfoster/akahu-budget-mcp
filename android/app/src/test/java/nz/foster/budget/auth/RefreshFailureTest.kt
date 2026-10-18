package nz.foster.budget.auth

import net.openid.appauth.AuthorizationException
import org.junit.Assert.assertEquals
import org.junit.Test

class RefreshFailureTest {
    @Test
    fun `invalid_grant from the token endpoint is a rejection`() {
        assertEquals(
            RefreshResult.Rejected,
            classifyRefreshFailure(AuthorizationException.TYPE_OAUTH_TOKEN_ERROR, "invalid_grant"),
        )
    }

    @Test
    fun `a retryable OAuth error keeps the session`() {
        assertEquals(
            RefreshResult.Unreachable,
            classifyRefreshFailure(AuthorizationException.TYPE_OAUTH_TOKEN_ERROR, "temporarily_unavailable"),
        )
    }

    @Test
    fun `a network failure keeps the session`() {
        assertEquals(
            RefreshResult.Unreachable,
            classifyRefreshFailure(AuthorizationException.TYPE_GENERAL_ERROR, null),
        )
    }
}
