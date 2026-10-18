package nz.foster.budget.auth

import kotlinx.serialization.Serializable

/** Expiry margin, so a token does not expire between the check and the API call. */
const val ACCESS_TOKEN_SKEW_MILLIS = 60_000L

@Serializable
data class Session(
    val refreshToken: String,
    val accessToken: String? = null,
    val accessTokenExpiresAtMillis: Long? = null,
    val authorizationEndpoint: String,
    val tokenEndpoint: String,
) {
    fun usableAccessToken(nowMillis: Long): String? {
        val token = accessToken ?: return null
        val expiresAt = accessTokenExpiresAtMillis ?: return token
        return token.takeIf { nowMillis + ACCESS_TOKEN_SKEW_MILLIS < expiresAt }
    }

    fun withTokens(tokens: IssuedTokens) = copy(
        accessToken = tokens.accessToken,
        accessTokenExpiresAtMillis = tokens.expiresAtMillis,
        refreshToken = tokens.refreshToken ?: refreshToken,
    )

    fun withoutAccessToken() = copy(accessToken = null, accessTokenExpiresAtMillis = null)

    override fun toString() = "Session(tokenEndpoint=$tokenEndpoint, accessTokenExpiresAtMillis=$accessTokenExpiresAtMillis)"
}

/** Tokens from a token-endpoint response. A null [refreshToken] means the server did not rotate it. */
data class IssuedTokens(
    val accessToken: String,
    val expiresAtMillis: Long?,
    val refreshToken: String?,
) {
    override fun toString() = "IssuedTokens(expiresAtMillis=$expiresAtMillis)"
}
