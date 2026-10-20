package nz.foster.budget

import android.app.Application
import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.launch
import net.openid.appauth.AuthorizationService
import nz.foster.budget.allowance.AllowanceRepository
import nz.foster.budget.api.HttpSpendingAllowanceApi
import nz.foster.budget.auth.AppAuthTokenRefresher
import nz.foster.budget.auth.AuthManager
import nz.foster.budget.auth.KeystoreTokenStore
import nz.foster.budget.cache.AllowanceCache
import nz.foster.budget.cache.PrefsAllowanceCache
import nz.foster.budget.config.AppConfig
import nz.foster.budget.refresh.RefreshScheduler
import nz.foster.budget.widget.updateAllWidgets

class BudgetApp : Application() {
    lateinit var graph: AppGraph
        private set

    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    override fun onCreate() {
        super.onCreate()
        graph = AppGraph(this)
        RefreshScheduler.schedule(this)
        keepWidgetsCurrent()
    }

    private fun keepWidgetsCurrent() {
        appScope.launch { graph.auth.state.drop(1).collect { graph.allowance.reload() } }
        appScope.launch { graph.allowance.snapshot.drop(1).collect { updateAllWidgets(this@BudgetApp) } }
    }
}

/** Process-wide singletons. Activities, widgets, and workers reach them through [Context.appGraph]. */
class AppGraph(context: Context) {
    val config: AppConfig = AppConfig.fromBuildConfig()
    val allowanceCache: AllowanceCache = PrefsAllowanceCache(context)
    private val authService = AuthorizationService(context)
    val auth = AuthManager(
        store = KeystoreTokenStore(context),
        refresher = AppAuthTokenRefresher(authService, config.stytchClientId),
        allowanceCache = allowanceCache,
    )
    val allowance = AllowanceRepository(auth, HttpSpendingAllowanceApi(config.apiBaseUrl), allowanceCache)
}

val Context.appGraph: AppGraph get() = (applicationContext as BudgetApp).graph
