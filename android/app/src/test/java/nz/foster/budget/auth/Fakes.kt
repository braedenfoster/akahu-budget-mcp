package nz.foster.budget.auth

import nz.foster.budget.cache.CachedFigure
import nz.foster.budget.cache.FetchFailure
import nz.foster.budget.cache.FigureCache
import nz.foster.budget.cache.LastFetch

class InMemoryTokenStore(var session: Session? = null) : TokenStore {
    override fun load() = session
    override fun save(session: Session) {
        this.session = session
    }
    override fun clear() {
        session = null
    }
}

class InMemoryFigureCache(var figure: CachedFigure? = null) : FigureCache {
    private var failure: LastFetch.Failed? = null

    override fun read() = figure
    override fun lastFetch(): LastFetch? = failure ?: figure?.let { LastFetch.Succeeded(it.fetchedAtMillis) }
    override fun recordSuccess(figure: CachedFigure) {
        this.figure = figure
        failure = null
    }
    override fun recordFailure(failure: FetchFailure, atMillis: Long) {
        this.failure = LastFetch.Failed(atMillis, failure)
    }
    override fun clear() {
        figure = null
        failure = null
    }
}

class ScriptedRefresher(vararg results: RefreshResult) : TokenRefresher {
    private val queue = ArrayDeque(results.toList())
    val calls = mutableListOf<Session>()

    override suspend fun refresh(session: Session): RefreshResult {
        calls += session
        return queue.removeFirstOrNull() ?: error("unexpected refresh call")
    }
}

fun session(
    refreshToken: String = "refresh-1",
    accessToken: String? = "access-1",
    expiresAt: Long? = 10_000_000L,
) = Session(
    refreshToken = refreshToken,
    accessToken = accessToken,
    accessTokenExpiresAtMillis = expiresAt,
    authorizationEndpoint = "https://example.ts.net/oauth/authorize",
    tokenEndpoint = "https://example.customers.stytch.dev/v1/oauth2/token",
)
