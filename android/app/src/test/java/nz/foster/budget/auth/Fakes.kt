package nz.foster.budget.auth

class InMemoryTokenStore(var session: Session? = null) : TokenStore {
    override fun load() = session
    override fun save(session: Session) {
        this.session = session
    }
    override fun clear() {
        session = null
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
