package nz.foster.budget.cache

class InMemoryAllowanceCache(var cached: CachedAllowance? = null) : AllowanceCache {
    private var failure: LastFetch.Failed? = null

    override fun read() = cached
    override fun lastFetch(): LastFetch? = failure ?: cached?.let { LastFetch.Succeeded(it.fetchedAtMillis) }
    override fun recordSuccess(allowance: CachedAllowance) {
        cached = allowance
        failure = null
    }
    override fun recordFailure(failure: FetchFailure, atMillis: Long) {
        this.failure = LastFetch.Failed(atMillis, failure)
    }
    override fun clear() {
        cached = null
        failure = null
    }
}
