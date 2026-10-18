package nz.foster.budget.cache

import android.content.Context

data class CachedFigure(val json: String, val fetchedAtMillis: Long)

/** The last good API response. Auth clears it whenever the Member is signed out. */
interface FigureCache {
    fun read(): CachedFigure?
    fun write(figure: CachedFigure)
    fun clear()
}

class PrefsFigureCache(context: Context) : FigureCache {
    private val prefs = context.getSharedPreferences("figure_cache", Context.MODE_PRIVATE)

    override fun read(): CachedFigure? {
        val json = prefs.getString(KEY_JSON, null) ?: return null
        return CachedFigure(json, prefs.getLong(KEY_FETCHED_AT, 0L))
    }

    override fun write(figure: CachedFigure) {
        prefs.edit()
            .putString(KEY_JSON, figure.json)
            .putLong(KEY_FETCHED_AT, figure.fetchedAtMillis)
            .commit()
    }

    override fun clear() {
        prefs.edit().clear().commit()
    }

    private companion object {
        const val KEY_JSON = "json"
        const val KEY_FETCHED_AT = "fetched_at"
    }
}
