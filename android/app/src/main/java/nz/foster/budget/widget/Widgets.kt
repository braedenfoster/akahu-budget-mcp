package nz.foster.budget.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.LocalContext
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.appWidgetBackground
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.updateAll
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.ColumnScope
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.padding
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import nz.foster.budget.R
import nz.foster.budget.allowance.AmountTone
import nz.foster.budget.ui.MainActivity

/** Both widgets read the same cached snapshot, so they update together. */
suspend fun updateAllWidgets(context: Context) {
    BudgetWidget().updateAll(context)
    BillsTodayWidget().updateAll(context)
}

/** The background and tap target both widgets share. A tap opens the app. */
@Composable
internal fun WidgetFrame(
    verticalAlignment: Alignment.Vertical = Alignment.CenterVertically,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .appWidgetBackground()
            .background(GlanceTheme.colors.widgetBackground)
            .cornerRadius(16.dp)
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .clickable(actionStartActivity<MainActivity>()),
        verticalAlignment = verticalAlignment,
        content = content,
    )
}

@Composable
internal fun toneColor(tone: AmountTone, normal: ColorProvider): ColorProvider = when (tone) {
    AmountTone.Over -> GlanceTheme.colors.error
    AmountTone.Stale -> GlanceTheme.colors.outline
    AmountTone.Normal -> normal
}

@Composable
internal fun Headline(text: String) {
    Text(text, maxLines = 1, style = TextStyle(fontSize = 18.sp, fontWeight = FontWeight.Medium, color = GlanceTheme.colors.onSurface))
}

@Composable
internal fun Details(parts: List<String> = emptyList(), showsOfflineMark: Boolean) {
    val context = LocalContext.current
    val all = parts + listOfNotNull(context.getString(R.string.widget_offline).takeIf { showsOfflineMark })
    if (all.isEmpty()) return
    Text(all.joinToString(" · "), maxLines = 1, style = TextStyle(fontSize = 13.sp, color = GlanceTheme.colors.onSurfaceVariant))
}
