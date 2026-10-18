package nz.foster.budget.api

import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

data class ApiResponse(val code: Int, val body: String)

fun interface SpendingAllowanceApi {
    /** Throws [IOException] when the server cannot be reached. */
    suspend fun fetch(accessToken: String): ApiResponse
}

/** Reads the route only. The app never asks the server to sync (ADR-0005). */
class HttpSpendingAllowanceApi(private val apiBaseUrl: String) : SpendingAllowanceApi {
    override suspend fun fetch(accessToken: String): ApiResponse = withContext(Dispatchers.IO) {
        val connection = URL(spendingAllowanceUrl(apiBaseUrl)).openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = TIMEOUT_MILLIS
            connection.readTimeout = TIMEOUT_MILLIS
            connection.setRequestProperty("Authorization", "Bearer $accessToken")
            connection.setRequestProperty("Accept", "application/json")
            val code = connection.responseCode
            val stream = if (code in 200..299) connection.inputStream else connection.errorStream
            ApiResponse(code, stream?.bufferedReader()?.use { it.readText() }.orEmpty())
        } finally {
            connection.disconnect()
        }
    }

    private companion object {
        const val TIMEOUT_MILLIS = 15_000
    }
}

fun spendingAllowanceUrl(apiBaseUrl: String) = "${apiBaseUrl.trimEnd('/')}/api/spending-allowance"
