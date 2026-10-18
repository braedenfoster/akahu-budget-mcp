package nz.foster.budget.auth

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import nz.foster.budget.cache.FigureCache

enum class AuthState { SignedOut, SignedIn }

sealed interface AccessTokenResult {
    data class Token(val value: String) : AccessTokenResult {
        override fun toString() = "Token(<redacted>)"
    }

    data object SignedOut : AccessTokenResult

    /** The refresh could not reach the server. Keep the session and show the last good figure. */
    data object Offline : AccessTokenResult
}

class AuthManager(
    private val store: TokenStore,
    private val refresher: TokenRefresher,
    private val figureCache: FigureCache,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    private val mutex = Mutex()
    private val _state = MutableStateFlow(if (store.load() != null) AuthState.SignedIn else AuthState.SignedOut)
    val state: StateFlow<AuthState> = _state.asStateFlow()

    suspend fun completeSignIn(session: Session) = mutex.withLock {
        store.save(session)
        _state.value = AuthState.SignedIn
    }

    suspend fun accessToken(): AccessTokenResult = mutex.withLock {
        val session = store.load()
        if (session == null) {
            clearLocked()
            return@withLock AccessTokenResult.SignedOut
        }
        session.usableAccessToken(clock())?.let { return@withLock AccessTokenResult.Token(it) }

        when (val result = refresher.refresh(session)) {
            is RefreshResult.Refreshed -> {
                store.save(session.withTokens(result.tokens))
                AccessTokenResult.Token(result.tokens.accessToken)
            }
            RefreshResult.Rejected -> {
                clearLocked()
                AccessTokenResult.SignedOut
            }
            RefreshResult.Unreachable -> AccessTokenResult.Offline
        }
    }

    /** Forces the next [accessToken] call to refresh, for example after the API answers 401. */
    suspend fun invalidateAccessToken() = mutex.withLock {
        store.load()?.let { store.save(it.withoutAccessToken()) }
    }

    suspend fun signOut() = mutex.withLock { clearLocked() }

    private fun clearLocked() {
        store.clear()
        figureCache.clear()
        _state.value = AuthState.SignedOut
    }
}
