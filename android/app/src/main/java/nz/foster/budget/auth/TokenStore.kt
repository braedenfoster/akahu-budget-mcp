package nz.foster.budget.auth

interface TokenStore {
    fun load(): Session?
    fun save(session: Session)
    fun clear()
}
