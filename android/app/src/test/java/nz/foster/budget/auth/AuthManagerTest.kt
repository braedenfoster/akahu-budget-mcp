package nz.foster.budget.auth

import kotlinx.coroutines.test.runTest
import nz.foster.budget.cache.CachedAllowance
import nz.foster.budget.cache.InMemoryAllowanceCache
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AuthManagerTest {
    private val now = 1_000_000L
    private val store = InMemoryTokenStore()
    private val cache = InMemoryAllowanceCache(CachedAllowance("""{"spending_allowance":{}}""", now - 1))

    private fun manager(refresher: TokenRefresher = ScriptedRefresher()) =
        AuthManager(store, refresher, cache, clock = { now })

    @Test
    fun `starts signed out with no stored session`() {
        assertEquals(AuthState.SignedOut, manager().state.value)
    }

    @Test
    fun `starts signed in with a stored session`() {
        store.session = session()
        assertEquals(AuthState.SignedIn, manager().state.value)
    }

    @Test
    fun `completing sign in stores the session and signs in`() = runTest {
        val auth = manager()
        auth.completeSignIn(session())

        assertEquals(AuthState.SignedIn, auth.state.value)
        assertEquals(session(), store.session)
    }

    @Test
    fun `returns the stored access token while it is valid`() = runTest {
        store.session = session(expiresAt = now + 10 * 60_000)
        val refresher = ScriptedRefresher()

        val result = manager(refresher).accessToken()

        assertEquals(AccessTokenResult.Token("access-1"), result)
        assertTrue(refresher.calls.isEmpty())
    }

    @Test
    fun `refreshes an expired access token and stores the rotated tokens`() = runTest {
        store.session = session(expiresAt = now - 1)
        val refresher = ScriptedRefresher(RefreshResult.Refreshed(IssuedTokens("access-2", now + 3_600_000, "refresh-2")))
        val auth = manager(refresher)

        val result = auth.accessToken()

        assertEquals(AccessTokenResult.Token("access-2"), result)
        assertEquals("refresh-1", refresher.calls.single().refreshToken)
        assertEquals("refresh-2", store.session?.refreshToken)
        assertEquals("access-2", store.session?.accessToken)
        assertEquals(AuthState.SignedIn, auth.state.value)
    }

    @Test
    fun `refreshes a token that expires inside the skew window`() = runTest {
        store.session = session(expiresAt = now + ACCESS_TOKEN_SKEW_MILLIS - 1)
        val refresher = ScriptedRefresher(RefreshResult.Refreshed(IssuedTokens("access-2", null, null)))

        manager(refresher).accessToken()

        assertEquals(1, refresher.calls.size)
    }

    @Test
    fun `keeps the old refresh token when the server does not rotate it`() = runTest {
        store.session = session(expiresAt = now - 1)
        val refresher = ScriptedRefresher(RefreshResult.Refreshed(IssuedTokens("access-2", now + 3_600_000, null)))

        manager(refresher).accessToken()

        assertEquals("refresh-1", store.session?.refreshToken)
    }

    @Test
    fun `a rejected refresh clears the token and the cached Spending allowance and signs out`() = runTest {
        store.session = session(expiresAt = now - 1)
        val auth = manager(ScriptedRefresher(RefreshResult.Rejected))

        val result = auth.accessToken()

        assertEquals(AccessTokenResult.SignedOut, result)
        assertEquals(AuthState.SignedOut, auth.state.value)
        assertNull(store.session)
        assertNull(cache.cached)
    }

    @Test
    fun `an unreachable server keeps the session and the cached Spending allowance`() = runTest {
        store.session = session(expiresAt = now - 1)
        val auth = manager(ScriptedRefresher(RefreshResult.Unreachable))

        val result = auth.accessToken()

        assertEquals(AccessTokenResult.Offline, result)
        assertEquals(AuthState.SignedIn, auth.state.value)
        assertNotNull(store.session)
        assertNotNull(cache.cached)
    }

    @Test
    fun `asking for a token with no session reports signed out and clears the cache`() = runTest {
        val auth = manager()

        assertEquals(AccessTokenResult.SignedOut, auth.accessToken())
        assertNull(cache.cached)
    }

    @Test
    fun `sign out clears the token and the cached Spending allowance`() = runTest {
        store.session = session()
        val auth = manager()

        auth.signOut()

        assertEquals(AuthState.SignedOut, auth.state.value)
        assertNull(store.session)
        assertNull(cache.cached)
    }

    @Test
    fun `invalidating the access token forces the next call to refresh`() = runTest {
        store.session = session(expiresAt = now + 10 * 60_000)
        val refresher = ScriptedRefresher(RefreshResult.Refreshed(IssuedTokens("access-2", now + 3_600_000, null)))
        val auth = manager(refresher)

        auth.invalidateAccessToken()
        val result = auth.accessToken()

        assertEquals(AccessTokenResult.Token("access-2"), result)
        assertEquals(1, refresher.calls.size)
    }

    @Test
    fun `a token with no known expiry is used until the API rejects it`() = runTest {
        store.session = session(expiresAt = null)
        val refresher = ScriptedRefresher()

        assertEquals(AccessTokenResult.Token("access-1"), manager(refresher).accessToken())
        assertTrue(refresher.calls.isEmpty())
    }
}
