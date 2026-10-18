package nz.foster.budget.auth

import android.content.Intent
import android.net.Uri
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import net.openid.appauth.AuthorizationException
import net.openid.appauth.AuthorizationRequest
import net.openid.appauth.AuthorizationResponse
import net.openid.appauth.AuthorizationService
import net.openid.appauth.AuthorizationServiceConfiguration
import net.openid.appauth.ResponseTypeValues
import net.openid.appauth.TokenResponse
import nz.foster.budget.config.AppConfig

class SignInException(message: String) : Exception(message)

/** PKCE authorization-code sign-in in a Custom Tab. The Stytch auth page runs the email OTP step. */
class AppAuthSignIn(
    private val config: AppConfig,
    private val service: AuthorizationService,
) {
    suspend fun authorizationIntent(): Intent {
        val serviceConfig = discover()
        val request = AuthorizationRequest.Builder(
            serviceConfig,
            config.stytchClientId,
            ResponseTypeValues.CODE,
            Uri.parse(AppConfig.REDIRECT_URI),
        )
            .setScopes(AppConfig.SCOPES)
            .build()
        return service.getAuthorizationRequestIntent(request)
    }

    suspend fun session(result: Intent?): Session {
        val response = result?.let(AuthorizationResponse::fromIntent)
        if (response == null) {
            val error = result?.let(AuthorizationException::fromIntent)
            throw SignInException(error?.errorDescription ?: error?.error ?: "cancelled")
        }
        val tokens = exchange(response)
        val refreshToken = tokens.refreshToken
            ?: throw SignInException("no refresh token; allow offline_access on the Stytch client")
        val accessToken = tokens.accessToken ?: throw SignInException("no access token")
        val serviceConfig = response.request.configuration
        return Session(
            refreshToken = refreshToken,
            accessToken = accessToken,
            accessTokenExpiresAtMillis = tokens.accessTokenExpirationTime,
            authorizationEndpoint = serviceConfig.authorizationEndpoint.toString(),
            tokenEndpoint = serviceConfig.tokenEndpoint.toString(),
        )
    }

    private suspend fun discover(): AuthorizationServiceConfiguration = awaitAppAuth { cont ->
        AuthorizationServiceConfiguration.fetchFromIssuer(Uri.parse(config.authIssuer)) { serviceConfig, error ->
            if (serviceConfig != null) {
                cont.resume(serviceConfig)
            } else {
                cont.resumeWithException(SignInException("discovery failed: ${error?.errorDescription ?: error?.error}"))
            }
        }
    }

    private suspend fun exchange(response: AuthorizationResponse): TokenResponse = awaitAppAuth { cont ->
        service.performTokenRequest(response.createTokenExchangeRequest()) { tokens, error ->
            if (tokens != null) {
                cont.resume(tokens)
            } else {
                cont.resumeWithException(SignInException("token exchange failed: ${error?.errorDescription ?: error?.error}"))
            }
        }
    }
}
