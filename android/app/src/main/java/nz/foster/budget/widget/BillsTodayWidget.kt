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
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.provideContent
import androidx.glance.layout.Alignment
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.semantics.contentDescription
import androidx.glance.semantics.semantics
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import nz.foster.budget.R
import nz.foster.budget.allowance.OccurrenceRow
import nz.foster.budget.appGraph
import nz.foster.budget.refresh.RefreshScheduler

class BillsTodayWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val allowance = context.appGraph.allowance
        allowance.reload()
        provideContent {
            val snapshot by allowance.snapshot.collectAsState()
            GlanceTheme { BillsTodayContent(billsTodayState(snapshot)) }
        }
    }
}

class BillsTodayWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = BillsTodayWidget()

    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        RefreshScheduler.refreshNow(context)
    }
}

@Composable
private fun BillsTodayContent(state: BillsTodayState) {
    val context = LocalContext.current
    // Rows start under the title; centring would float them in a tall widget.
    WidgetFrame(verticalAlignment = Alignment.Top) {
        Title()
        when (state) {
            BillsTodayState.SignedOut -> Headline(context.getString(R.string.sign_in))
            is BillsTodayState.NothingCached -> {
                Headline(context.getString(R.string.widget_no_allowance_yet))
                Details(showsOfflineMark = state.showsOfflineMark)
            }
            is BillsTodayState.BillsUnavailable -> {
                Headline(context.getString(R.string.widget_bills_unavailable))
                Details(showsOfflineMark = state.showsOfflineMark)
            }
            is BillsTodayState.NoneToday -> {
                Headline(context.getString(R.string.widget_no_bills_today))
                state.next?.let { NextBill(it) }
                Details(parts = asOfParts(state.asOf), showsOfflineMark = state.showsOfflineMark)
            }
            is BillsTodayState.Today -> {
                state.rows.forEach { BillRow(it) }
                Details(
                    parts = listOfNotNull(state.moreCount.takeIf { it > 0 }?.let { context.getString(R.string.widget_more_bills, it) }) +
                        asOfParts(state.asOf),
                    showsOfflineMark = state.showsOfflineMark,
                )
            }
        }
    }
}

@Composable
private fun Title() {
    Text(
        LocalContext.current.getString(R.string.bills_widget_label),
        modifier = GlanceModifier.padding(bottom = 4.dp),
        maxLines = 1,
        style = TextStyle(fontSize = 13.sp, fontWeight = FontWeight.Medium, color = GlanceTheme.colors.onSurfaceVariant),
    )
}

@Composable
private fun asOfParts(asOf: String?): List<String> =
    listOfNotNull(asOf?.let { LocalContext.current.getString(R.string.widget_as_of, it) })

@Composable
private fun NextBill(next: OccurrenceRow) {
    Text(
        LocalContext.current.getString(R.string.widget_next_bill, next.name, next.weekday, next.amount),
        maxLines = 1,
        style = TextStyle(fontSize = 14.sp, color = toneColor(next.tone, normal = GlanceTheme.colors.onSurface)),
    )
}

@Composable
private fun BillRow(row: OccurrenceRow) {
    val context = LocalContext.current
    val paid = context.getString(R.string.bill_paid)
    val style = TextStyle(fontSize = 14.sp, color = toneColor(row.tone, normal = GlanceTheme.colors.onSurface))
    Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(row.weekday, modifier = GlanceModifier.width(36.dp), maxLines = 1, style = style)
        Text(row.name, modifier = GlanceModifier.defaultWeight(), maxLines = 1, style = style)
        if (row.paid) {
            Text(context.getString(R.string.bill_paid_tick), modifier = GlanceModifier.semantics { contentDescription = paid }, style = style)
            Spacer(GlanceModifier.width(6.dp))
        }
        Text(row.amount, maxLines = 1, style = style.copy(fontWeight = FontWeight.Medium))
    }
}
