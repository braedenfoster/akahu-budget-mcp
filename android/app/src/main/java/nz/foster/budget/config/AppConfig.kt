package nz.foster.budget.config

import nz.foster.budget.BuildConfig

data class AppConfig(
    val stytchClientId: String,
    val authIssuer: String,
    val apiBaseUrl: String,
) {
    val missingKeys: List<String>
        get() = listOfNotNull(
            "STYTCH_ANDROID_CLIENT_ID".takeIf { stytchClientId.isBlank() },
            "AUTH_ISSUER".takeIf { authIssuer.isBlank() },
            "PUBLIC_URL".takeIf { apiBaseUrl.isBlank() },
        )

    // Stytch accepts only http(s) redirects. The auth-page relay forwards the code to the
    // app's custom scheme (appAuthRedirectScheme in build.gradle.kts).
    val redirectUri: String
        get() = "$apiBaseUrl/oauth/android-callback"

    companion object {
        val SCOPES = listOf("openid", "email", "profile", "offline_access")

        fun fromBuildConfig() = AppConfig(
            stytchClientId = BuildConfig.STYTCH_CLIENT_ID,
            authIssuer = BuildConfig.AUTH_ISSUER,
            apiBaseUrl = BuildConfig.API_BASE_URL.trimEnd('/'),
        )
    }
}
