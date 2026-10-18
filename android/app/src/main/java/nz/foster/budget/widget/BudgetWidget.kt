package nz.foster.budget.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.ColorFilter
import androidx.glance.GlanceTheme
import androidx.glance.Image
import androidx.glance.ImageProvider
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
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import nz.foster.budget.R
import nz.foster.budget.allowance.AmountTone
import nz.foster.budget.allowance.SpendingRing
import nz.foster.budget.appGraph
import nz.foster.budget.refresh.RefreshScheduler
import nz.foster.budget.ui.MainActivity

class BudgetWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val allowance = context.appGraph.allowance
        allowance.reload()
        provideContent {
            val snapshot by allowance.snapshot.collectAsState()
            GlanceTheme { WidgetContent(widgetState(snapshot)) }
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
            is WidgetState.NoAllowanceYet -> {
                Headline(LocalContext.current.getString(R.string.widget_no_allowance_yet))
                Details(showsOfflineMark = state.showsOfflineMark)
            }
            is WidgetState.NoBudget -> {
                Headline(LocalContext.current.getString(R.string.no_budget_for, state.month))
                Details(showsOfflineMark = state.showsOfflineMark)
            }
            is WidgetState.Allowance -> AllowanceContent(state)
        }
    }
}

@Composable
private fun AllowanceContent(state: WidgetState.Allowance) {
    val context = LocalContext.current
    val amountColor = toneColor(state.tone, normal = GlanceTheme.colors.onSurface)
    Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(modifier = GlanceModifier.defaultWeight()) {
            Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(state.amount, style = TextStyle(fontSize = 26.sp, fontWeight = FontWeight.Bold, color = amountColor))
                Spacer(GlanceModifier.defaultWeight())
                state.uncategorizedBadgeCount?.let { Badge(context.getString(R.string.uncategorized_count, it)) }
            }
            Details(
                parts = listOfNotNull(
                    state.perWeek?.let { context.getString(R.string.per_week, it) },
                    context.resources.getQuantityString(R.plurals.days_left, state.daysLeft, state.daysLeft),
                    state.asOf?.let { context.getString(R.string.widget_as_of, it) },
                ),
                showsOfflineMark = state.showsOfflineMark,
            )
        }
        state.ring?.let {
            Spacer(GlanceModifier.width(12.dp))
            Ring(it)
        }
    }
}

private val RING_SIZE = 36.dp
private val RING_STROKE = 4.dp

@Composable
private fun Ring(ring: SpendingRing) {
    val density = LocalContext.current.resources.displayMetrics.density
    val color = toneColor(ring.tone, normal = GlanceTheme.colors.primary)
    // Decorative: the amount next to it already says how much is left.
    Image(
        provider = ImageProvider(ringBitmap(ring.fill, (RING_SIZE.value * density).toInt(), RING_STROKE.value * density)),
        contentDescription = null,
        modifier = GlanceModifier.size(RING_SIZE),
        colorFilter = ColorFilter.tint(color),
    )
}

@Composable
private fun toneColor(tone: AmountTone, normal: ColorProvider): ColorProvider = when (tone) {
    AmountTone.Over -> GlanceTheme.colors.error
    AmountTone.Stale -> GlanceTheme.colors.outline
    AmountTone.Normal -> normal
}

@Composable
private fun Headline(text: String) {
    Text(text, maxLines = 1, style = TextStyle(fontSize = 18.sp, fontWeight = FontWeight.Medium, color = GlanceTheme.colors.onSurface))
}

@Composable
private fun Details(parts: List<String> = emptyList(), showsOfflineMark: Boolean) {
    val context = LocalContext.current
    val all = parts + listOfNotNull(context.getString(R.string.widget_offline).takeIf { showsOfflineMark })
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
