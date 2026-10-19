package nz.foster.budget.allowance

import java.io.IOException
import kotlinx.coroutines.test.runTest
import nz.foster.budget.api.ApiResponse
import nz.foster.budget.api.SpendingAllowanceApi
import nz.foster.budget.auth.AuthManager
import nz.foster.budget.auth.AuthState
import nz.foster.budget.auth.InMemoryTokenStore
import nz.foster.budget.auth.IssuedTokens
import nz.foster.budget.auth.RefreshResult
import nz.foster.budget.auth.ScriptedRefresher
import nz.foster.budget.auth.session
import nz.foster.budget.cache.CachedAllowance
import nz.foster.budget.cache.FetchFailure
import nz.foster.budget.cache.InMemoryAllowanceCache
import nz.foster.budget.cache.LastFetch
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

private const val OK_BODY =
    """{"spending_allowance":{"period":"2026-10","status":"ok","amount_cents":36500,"per_week_cents":15029,""" +
        """"days_left":17,"period_days":31,"flexible_remaining_cents":38000,"flexible_allocated_cents":50000,""" +
        """"committed_overspend_cents":0,""" +
        """"uncategorized_spent_cents":1500,"uncategorized_count":1,"data_as_of":"2026-10-15T08:00:00.000Z","stale":false}}"""

private val OLD_BODY = OK_BODY.replace("36500", "100")

class ScriptedApi(vararg responses: Any) : SpendingAllowanceApi {
    private val queue = ArrayDeque(responses.toList())
    val tokens = mutableListOf<String>()

    override suspend fun fetch(accessToken: String): ApiResponse {
        tokens += accessToken
        return when (val next = queue.removeFirstOrNull() ?: error("unexpected API call")) {
            is ApiResponse -> next
            is IOException -> throw next
            else -> error("bad script entry $next")
        }
    }
}

class AllowanceRepositoryTest {
    private val now = 5_000_000L
    private val store = InMemoryTokenStore(session(expiresAt = now + 3_600_000))
    private val cache = InMemoryAllowanceCache()

    private fun repository(api: SpendingAllowanceApi, refresher: ScriptedRefresher = ScriptedRefresher()) =
        AllowanceRepository(AuthManager(store, refresher, cache, clock = { now }), api, cache, clock = { now })

    @Test
    fun `a successful fetch caches the response and records the time`() = runTest {
        val api = ScriptedApi(ApiResponse(200, OK_BODY))
        val repo = repository(api)

        val outcome = repo.refresh()

        assertEquals(36500L, (outcome as FetchOutcome.Fetched).allowance.amountCents)
        assertEquals(listOf("access-1"), api.tokens)
        assertEquals(CachedAllowance(OK_BODY, now), cache.cached)
        assertEquals(LastFetch.Succeeded(now), cache.lastFetch())
        assertEquals(36500L, repo.snapshot.value.allowance?.amountCents)
        assertEquals(now, repo.snapshot.value.lastSuccessAtMillis)
    }

    @Test
    fun `a network failure keeps the cache and records offline`() = runTest {
        cache.recordSuccess(CachedAllowance(OLD_BODY, 1L))
        val repo = repository(ScriptedApi(IOException("no route")))

        val outcome = repo.refresh()

        assertEquals(FetchOutcome.Failed(FetchFailure.Offline), outcome)
        assertEquals(CachedAllowance(OLD_BODY, 1L), cache.cached)
        assertEquals(LastFetch.Failed(now, FetchFailure.Offline), cache.lastFetch())
        assertEquals(100L, repo.snapshot.value.allowance?.amountCents)
        assertEquals(1L, repo.snapshot.value.lastSuccessAtMillis)
    }

    @Test
    fun `a server error keeps the cache`() = runTest {
        cache.recordSuccess(CachedAllowance(OLD_BODY, 1L))
        val repo = repository(ScriptedApi(ApiResponse(502, "Bad Gateway")))

        assertEquals(FetchOutcome.Failed(FetchFailure.ServerError), repo.refresh())
        assertEquals(CachedAllowance(OLD_BODY, 1L), cache.cached)
        assertEquals(LastFetch.Failed(now, FetchFailure.ServerError), cache.lastFetch())
    }

    @Test
    fun `an unreadable body keeps the cache`() = runTest {
        cache.recordSuccess(CachedAllowance(OLD_BODY, 1L))
        val repo = repository(ScriptedApi(ApiResponse(200, """{"spending_allowance":{}}""")))

        assertEquals(FetchOutcome.Failed(FetchFailure.ServerError), repo.refresh())
        assertEquals(CachedAllowance(OLD_BODY, 1L), cache.cached)
    }

    @Test
    fun `an unreachable token endpoint skips the API and records offline`() = runTest {
        store.session = session(expiresAt = now - 1)
        val api = ScriptedApi()
        val repo = repository(api, ScriptedRefresher(RefreshResult.Unreachable))

        assertEquals(FetchOutcome.Failed(FetchFailure.Offline), repo.refresh())
        assertTrue(api.tokens.isEmpty())
        assertEquals(LastFetch.Failed(now, FetchFailure.Offline), cache.lastFetch())
    }

    @Test
    fun `no session skips the API and reports signed out`() = runTest {
        store.session = null
        val api = ScriptedApi()
        val repo = repository(api)

        assertEquals(FetchOutcome.SignedOut, repo.refresh())
        assertTrue(api.tokens.isEmpty())
        assertEquals(AuthState.SignedOut, repo.snapshot.value.auth)
    }

    @Test
    fun `a 401 refreshes the token and retries once`() = runTest {
        val api = ScriptedApi(ApiResponse(401, ""), ApiResponse(200, OK_BODY))
        val refresher = ScriptedRefresher(RefreshResult.Refreshed(IssuedTokens("access-2", now + 3_600_000, null)))
        val repo = repository(api, refresher)

        assertTrue(repo.refresh() is FetchOutcome.Fetched)
        assertEquals(listOf("access-1", "access-2"), api.tokens)
        assertEquals(CachedAllowance(OK_BODY, now), cache.cached)
    }

    @Test
    fun `a 401 after a refresh signs out and clears the cache`() = runTest {
        cache.recordSuccess(CachedAllowance(OLD_BODY, 1L))
        val api = ScriptedApi(ApiResponse(401, ""), ApiResponse(401, ""))
        val refresher = ScriptedRefresher(RefreshResult.Refreshed(IssuedTokens("access-2", now + 3_600_000, null)))
        val repo = repository(api, refresher)

        assertEquals(FetchOutcome.SignedOut, repo.refresh())
        assertNull(store.session)
        assertNull(cache.cached)
        assertNull(cache.lastFetch())
        assertEquals(AllowanceSnapshot(AuthState.SignedOut, null, null, null), repo.snapshot.value)
    }

    @Test
    fun `a 403 signs out and clears the cache`() = runTest {
        cache.recordSuccess(CachedAllowance(OLD_BODY, 1L))
        val api = ScriptedApi(ApiResponse(403, ""))
        val repo = repository(api)

        assertEquals(FetchOutcome.SignedOut, repo.refresh())
        assertEquals(1, api.tokens.size)
        assertNull(store.session)
        assertNull(cache.cached)
    }

    @Test
    fun `a success after a failure replaces the failure`() = runTest {
        val repo = repository(ScriptedApi(IOException("down"), ApiResponse(200, OK_BODY)))

        repo.refresh()
        repo.refresh()

        assertEquals(LastFetch.Succeeded(now), cache.lastFetch())
    }

    @Test
    fun `the snapshot starts from the cache`() {
        cache.recordSuccess(CachedAllowance(OK_BODY, 42L))

        val snapshot = repository(ScriptedApi()).snapshot.value

        assertEquals(AuthState.SignedIn, snapshot.auth)
        assertEquals(36500L, snapshot.allowance?.amountCents)
        assertEquals(42L, snapshot.lastSuccessAtMillis)
        assertEquals(LastFetch.Succeeded(42L), snapshot.lastFetch)
    }

    @Test
    fun `an unreadable cache reads as empty`() {
        cache.recordSuccess(CachedAllowance("""{"old":true}""", 42L))

        assertNull(repository(ScriptedApi()).snapshot.value.allowance)
    }
}
