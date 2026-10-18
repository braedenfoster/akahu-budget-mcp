package nz.foster.budget.allowance

import java.io.IOException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.SerializationException
import nz.foster.budget.api.ApiResponse
import nz.foster.budget.api.SpendingAllowance
import nz.foster.budget.api.SpendingAllowanceApi
import nz.foster.budget.api.parseSpendingAllowance
import nz.foster.budget.auth.AccessTokenResult
import nz.foster.budget.auth.AuthManager
import nz.foster.budget.auth.AuthState
import nz.foster.budget.cache.CachedFigure
import nz.foster.budget.cache.FetchFailure
import nz.foster.budget.cache.FigureCache
import nz.foster.budget.cache.LastFetch

/** Everything the screen and the widget read. */
data class AllowanceSnapshot(
    val auth: AuthState,
    /** The last good response, or null when nothing is cached. */
    val allowance: SpendingAllowance?,
    val lastSuccessAtMillis: Long?,
    val lastFetch: LastFetch?,
)

sealed interface FetchOutcome {
    data class Fetched(val allowance: SpendingAllowance) : FetchOutcome
    data object SignedOut : FetchOutcome
    data class Failed(val failure: FetchFailure) : FetchOutcome
}

class AllowanceRepository(
    private val auth: AuthManager,
    private val api: SpendingAllowanceApi,
    private val cache: FigureCache,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    private val fetchMutex = Mutex()
    private val _snapshot = MutableStateFlow(readSnapshot())
    val snapshot: StateFlow<AllowanceSnapshot> = _snapshot.asStateFlow()

    /** Re-reads the cache, for example after a sign-in or sign-out outside [refresh]. */
    fun reload() {
        _snapshot.value = readSnapshot()
    }

    suspend fun refresh(): FetchOutcome = fetchMutex.withLock {
        val outcome = fetchOnce()
        if (outcome is FetchOutcome.Failed) cache.recordFailure(outcome.failure, clock())
        reload()
        outcome
    }

    private suspend fun fetchOnce(): FetchOutcome {
        var response = when (val first = attempt()) {
            is Attempt.Stopped -> return first.outcome
            is Attempt.Answered -> first.response
        }
        if (response.code == 401) {
            auth.invalidateAccessToken()
            response = when (val retry = attempt()) {
                is Attempt.Stopped -> return retry.outcome
                is Attempt.Answered -> retry.response
            }
            if (response.code == 401) return signOut()
        }
        if (response.code == 403) return signOut()
        if (response.code !in 200..299) return FetchOutcome.Failed(FetchFailure.ServerError)

        val allowance = try {
            parseSpendingAllowance(response.body)
        } catch (_: SerializationException) {
            return FetchOutcome.Failed(FetchFailure.ServerError)
        }
        cache.recordSuccess(CachedFigure(response.body, clock()))
        return FetchOutcome.Fetched(allowance)
    }

    private sealed interface Attempt {
        data class Answered(val response: ApiResponse) : Attempt
        data class Stopped(val outcome: FetchOutcome) : Attempt
    }

    private suspend fun attempt(): Attempt {
        val token = when (val result = auth.accessToken()) {
            is AccessTokenResult.Token -> result.value
            AccessTokenResult.SignedOut -> return Attempt.Stopped(FetchOutcome.SignedOut)
            AccessTokenResult.Offline -> return Attempt.Stopped(FetchOutcome.Failed(FetchFailure.Offline))
        }
        return try {
            Attempt.Answered(api.fetch(token))
        } catch (_: IOException) {
            Attempt.Stopped(FetchOutcome.Failed(FetchFailure.Offline))
        }
    }

    private suspend fun signOut(): FetchOutcome {
        auth.signOut()
        return FetchOutcome.SignedOut
    }

    private fun readSnapshot(): AllowanceSnapshot {
        val cached = cache.read()
        return AllowanceSnapshot(
            auth = auth.state.value,
            allowance = cached?.let { readCached(it.json) },
            lastSuccessAtMillis = cached?.fetchedAtMillis,
            lastFetch = cache.lastFetch(),
        )
    }

    private fun readCached(json: String): SpendingAllowance? = try {
        parseSpendingAllowance(json)
    } catch (_: SerializationException) {
        null
    }
}
