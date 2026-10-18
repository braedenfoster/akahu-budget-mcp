package nz.foster.budget.ui

import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import net.openid.appauth.AuthorizationService
import nz.foster.budget.R
import nz.foster.budget.appGraph
import nz.foster.budget.auth.AppAuthSignIn
import nz.foster.budget.auth.AuthState

class MainActivity : ComponentActivity() {
    private lateinit var authService: AuthorizationService
    private lateinit var signIn: AppAuthSignIn
    private var signInError by mutableStateOf<String?>(null)
    private var refreshing by mutableStateOf(false)

    private val signInLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        lifecycleScope.launch {
            runCatching { signIn.session(result.data) }
                .onSuccess {
                    appGraph.auth.completeSignIn(it)
                    refresh()
                }
                .onFailure { signInError = it.message }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // The app has only a light colour scheme, so the system bars always need dark icons.
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
        )
        authService = AuthorizationService(this)
        signIn = AppAuthSignIn(appGraph.config, authService)

        setContent {
            MaterialTheme {
                Surface(Modifier.fillMaxSize()) {
                    Box(Modifier.fillMaxSize().safeDrawingPadding()) {
                        val authState by appGraph.auth.state.collectAsStateWithLifecycle()
                        LaunchedEffect(authState) { appGraph.allowance.reload() }
                        when (authState) {
                            AuthState.SignedOut -> SignedOutScreen(
                                missingConfig = appGraph.config.missingKeys,
                                error = signInError,
                                onSignIn = ::startSignIn,
                            )
                            AuthState.SignedIn -> {
                                val snapshot by appGraph.allowance.snapshot.collectAsStateWithLifecycle()
                                SpendingAllowanceScreen(
                                    model = allowanceScreenModel(snapshot),
                                    refreshing = refreshing,
                                    onRefresh = ::refresh,
                                    onSignOut = { lifecycleScope.launch { appGraph.auth.signOut() } },
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    override fun onStart() {
        super.onStart()
        if (appGraph.auth.state.value == AuthState.SignedIn) refresh()
    }

    override fun onDestroy() {
        authService.dispose()
        super.onDestroy()
    }

    private fun refresh() {
        if (refreshing) return
        refreshing = true
        lifecycleScope.launch {
            try {
                appGraph.allowance.refresh()
            } finally {
                refreshing = false
            }
        }
    }

    private fun startSignIn() {
        signInError = null
        lifecycleScope.launch {
            runCatching { signIn.authorizationIntent() }
                .onSuccess { signInLauncher.launch(it) }
                .onFailure { signInError = it.message }
        }
    }
}

@Composable
private fun SignedOutScreen(missingConfig: List<String>, error: String?, onSignIn: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(stringResource(R.string.app_name), style = MaterialTheme.typography.headlineMedium)
        if (missingConfig.isNotEmpty()) {
            Text(stringResource(R.string.config_missing, missingConfig.joinToString()), color = MaterialTheme.colorScheme.error)
            return@Column
        }
        Text(stringResource(R.string.signed_out_message))
        Button(onClick = onSignIn) { Text(stringResource(R.string.sign_in)) }
        error?.let { Text(stringResource(R.string.sign_in_failed, it), color = MaterialTheme.colorScheme.error) }
    }
}
