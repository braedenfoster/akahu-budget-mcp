package nz.foster.budget.cache

import android.content.Context

/** The raw body of the last good `GET /api/spending-allowance` response. */
data class CachedAllowance(val json: String, val fetchedAtMillis: Long)

enum class FetchFailure {
    /** The phone could not reach the server or the token endpoint. */
    Offline,

    /** The server answered with an error status or a body the app cannot read. */
    ServerError,
}

sealed interface LastFetch {
    val atMillis: Long

    data class Succeeded(override val atMillis: Long) : LastFetch
    data class Failed(override val atMillis: Long, val failure: FetchFailure) : LastFetch
}

/** The last good API response and the result of the latest fetch. Auth clears both whenever the Member is signed out. */
interface AllowanceCache {
    fun read(): CachedAllowance?
    fun lastFetch(): LastFetch?
    fun recordSuccess(allowance: CachedAllowance)

    /** Keeps the cached Spending allowance. */
    fun recordFailure(failure: FetchFailure, atMillis: Long)
    fun clear()
}

class PrefsAllowanceCache(context: Context) : AllowanceCache {
    // Renaming the file would orphan cached bank figures that sign-out no longer clears.
    private val prefs = context.getSharedPreferences("figure_cache", Context.MODE_PRIVATE)

    override fun read(): CachedAllowance? {
        val json = prefs.getString(KEY_JSON, null) ?: return null
        return CachedAllowance(json, prefs.getLong(KEY_FETCHED_AT, 0L))
    }

    override fun lastFetch(): LastFetch? {
        val failure = prefs.getString(KEY_FAILURE, null)?.let { name -> FetchFailure.entries.find { it.name == name } }
        if (failure != null) return LastFetch.Failed(prefs.getLong(KEY_FAILED_AT, 0L), failure)
        return read()?.let { LastFetch.Succeeded(it.fetchedAtMillis) }
    }

    override fun recordSuccess(allowance: CachedAllowance) {
        prefs.edit()
            .putString(KEY_JSON, allowance.json)
            .putLong(KEY_FETCHED_AT, allowance.fetchedAtMillis)
            .remove(KEY_FAILURE)
            .remove(KEY_FAILED_AT)
            .commit()
    }

    override fun recordFailure(failure: FetchFailure, atMillis: Long) {
        prefs.edit()
            .putString(KEY_FAILURE, failure.name)
            .putLong(KEY_FAILED_AT, atMillis)
            .commit()
    }

    override fun clear() {
        prefs.edit().clear().commit()
    }

    private companion object {
        const val KEY_JSON = "json"
        const val KEY_FETCHED_AT = "fetched_at"
        const val KEY_FAILURE = "failure"
        const val KEY_FAILED_AT = "failed_at"
    }
}
