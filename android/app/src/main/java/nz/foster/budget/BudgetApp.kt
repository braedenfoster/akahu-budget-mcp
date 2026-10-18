package nz.foster.budget

import android.app.Application
import android.content.Context
import net.openid.appauth.AuthorizationService
import nz.foster.budget.allowance.AllowanceRepository
import nz.foster.budget.api.HttpSpendingAllowanceApi
import nz.foster.budget.auth.AppAuthTokenRefresher
import nz.foster.budget.auth.AuthManager
import nz.foster.budget.auth.KeystoreTokenStore
import nz.foster.budget.cache.FigureCache
import nz.foster.budget.cache.PrefsFigureCache
import nz.foster.budget.config.AppConfig

class BudgetApp : Application() {
    lateinit var graph: AppGraph
        private set

    override fun onCreate() {
        super.onCreate()
        graph = AppGraph(this)
    }
}

/** Process-wide singletons. Activities, widgets, and workers reach them through [Context.appGraph]. */
class AppGraph(context: Context) {
    val config: AppConfig = AppConfig.fromBuildConfig()
    val figureCache: FigureCache = PrefsFigureCache(context)
    private val authService = AuthorizationService(context)
    val auth = AuthManager(
        store = KeystoreTokenStore(context),
        refresher = AppAuthTokenRefresher(authService, config.stytchClientId),
        figureCache = figureCache,
    )
    val allowance = AllowanceRepository(auth, HttpSpendingAllowanceApi(config.apiBaseUrl), figureCache)
}

val Context.appGraph: AppGraph get() = (applicationContext as BudgetApp).graph
