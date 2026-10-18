package nz.foster.budget.auth

sealed interface RefreshResult {
    data class Refreshed(val tokens: IssuedTokens) : RefreshResult

    /** The authorization server refused the refresh token (expired, revoked, or invalid). */
    data object Rejected : RefreshResult

    /** The phone could not get an answer from the authorization server. The session may still be good. */
    data object Unreachable : RefreshResult
}

fun interface TokenRefresher {
    suspend fun refresh(session: Session): RefreshResult
}
