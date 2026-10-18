package nz.foster.budget.auth

import android.net.Uri
import kotlin.coroutines.resume
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import net.openid.appauth.AuthorizationException
import net.openid.appauth.AuthorizationService
import net.openid.appauth.AuthorizationServiceConfiguration
import net.openid.appauth.GrantTypeValues
import net.openid.appauth.TokenRequest

class AppAuthTokenRefresher(
    private val service: AuthorizationService,
    private val clientId: String,
) : TokenRefresher {
    override suspend fun refresh(session: Session): RefreshResult {
        val request = TokenRequest.Builder(session.serviceConfiguration(), clientId)
            .setGrantType(GrantTypeValues.REFRESH_TOKEN)
            .setRefreshToken(session.refreshToken)
            .build()
        // AppAuth starts an AsyncTask, which must be created on the main thread.
        return withContext(Dispatchers.Main) {
            suspendCancellableCoroutine { cont ->
                service.performTokenRequest(request) { response, error ->
                    val accessToken = response?.accessToken
                    val result = when {
                        accessToken != null -> RefreshResult.Refreshed(
                            IssuedTokens(accessToken, response.accessTokenExpirationTime, response.refreshToken),
                        )
                        error != null -> classifyRefreshFailure(error.type, error.error)
                        else -> RefreshResult.Rejected
                    }
                    cont.resume(result)
                }
            }
        }
    }
}

private val RETRYABLE_OAUTH_ERRORS = setOf("server_error", "temporarily_unavailable")

/** Only an OAuth error from the token endpoint signs the Member out. Network and parse failures keep the session. */
fun classifyRefreshFailure(errorType: Int, oauthError: String?): RefreshResult =
    if (errorType == AuthorizationException.TYPE_OAUTH_TOKEN_ERROR && oauthError !in RETRYABLE_OAUTH_ERRORS) {
        RefreshResult.Rejected
    } else {
        RefreshResult.Unreachable
    }

internal fun Session.serviceConfiguration() =
    AuthorizationServiceConfiguration(Uri.parse(authorizationEndpoint), Uri.parse(tokenEndpoint))
