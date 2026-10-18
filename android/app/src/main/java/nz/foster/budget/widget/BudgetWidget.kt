package nz.foster.budget.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.LocalContext
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.appWidgetBackground
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.padding
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import nz.foster.budget.R
import nz.foster.budget.appGraph
import nz.foster.budget.refresh.HOUSEHOLD_ZONE
import nz.foster.budget.refresh.RefreshScheduler
import nz.foster.budget.ui.MainActivity

class BudgetWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val allowance = context.appGraph.allowance
        allowance.reload()
        provideContent {
            val snapshot by allowance.snapshot.collectAsState()
            GlanceTheme { WidgetContent(widgetState(snapshot, HOUSEHOLD_ZONE)) }
        }
    }
}

class BudgetWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = BudgetWidget()

    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        RefreshScheduler.refreshNow(context)
    }
}

@Composable
private fun WidgetContent(state: WidgetState) {
    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .appWidgetBackground()
            .background(GlanceTheme.colors.widgetBackground)
            .cornerRadius(16.dp)
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .clickable(actionStartActivity<MainActivity>()),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        when (state) {
            WidgetState.SignedOut -> Headline(LocalContext.current.getString(R.string.sign_in))
            is WidgetState.NoFigure -> {
                Headline(LocalContext.current.getString(R.string.widget_no_figure))
                Details(offline = state.offline)
            }
            is WidgetState.NoBudget -> {
                Headline(LocalContext.current.getString(R.string.no_budget_for, state.month))
                Details(offline = state.offline)
            }
            is WidgetState.Figure -> FigureContent(state)
        }
    }
}

@Composable
private fun FigureContent(state: WidgetState.Figure) {
    val context = LocalContext.current
    val amountColor = when {
        state.stale -> GlanceTheme.colors.outline
        state.over -> GlanceTheme.colors.error
        else -> GlanceTheme.colors.onSurface
    }
    Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(state.amount, style = TextStyle(fontSize = 26.sp, fontWeight = FontWeight.Bold, color = amountColor))
        Spacer(GlanceModifier.defaultWeight())
        state.uncategorizedBadge?.let { Badge(context.getString(R.string.uncategorized_count, it)) }
    }
    Details(
        parts = listOfNotNull(
            state.perWeek?.let { context.getString(R.string.per_week, it) },
            context.resources.getQuantityString(R.plurals.days_left, state.daysLeft, state.daysLeft),
            state.asOf?.let { context.getString(R.string.widget_as_of, it) },
        ),
        offline = state.offline,
    )
}

@Composable
private fun Headline(text: String) {
    Text(text, maxLines = 1, style = TextStyle(fontSize = 18.sp, fontWeight = FontWeight.Medium, color = GlanceTheme.colors.onSurface))
}

@Composable
private fun Details(parts: List<String> = emptyList(), offline: Boolean) {
    val context = LocalContext.current
    val all = parts + listOfNotNull(context.getString(R.string.widget_offline).takeIf { offline })
    if (all.isEmpty()) return
    Text(all.joinToString(" · "), maxLines = 1, style = TextStyle(fontSize = 13.sp, color = GlanceTheme.colors.onSurfaceVariant))
}

@Composable
private fun Badge(text: String) {
    Box(
        modifier = GlanceModifier
            .background(GlanceTheme.colors.primaryContainer)
            .cornerRadius(10.dp)
            .padding(horizontal = 8.dp, vertical = 2.dp),
    ) {
        Text(text, maxLines = 1, style = TextStyle(fontSize = 12.sp, color = GlanceTheme.colors.onPrimaryContainer))
    }
}
