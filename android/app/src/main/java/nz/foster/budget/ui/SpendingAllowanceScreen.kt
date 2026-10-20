package nz.foster.budget.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlin.math.cos
import kotlin.math.sin
import nz.foster.budget.R
import nz.foster.budget.allowance.AmountTone
import nz.foster.budget.allowance.SpendingRing
import nz.foster.budget.cache.FetchFailure

@Composable
fun SpendingAllowanceScreen(
    model: AllowanceScreenModel,
    refreshing: Boolean,
    onRefresh: () -> Unit,
    onSignOut: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(stringResource(R.string.app_name), style = MaterialTheme.typography.titleMedium)

        model.lastFailure?.let { failure ->
            val text = when (failure) {
                FetchFailure.Offline -> R.string.failure_offline
                FetchFailure.ServerError -> R.string.failure_server
            }
            Text(stringResource(text), color = MaterialTheme.colorScheme.error)
        }

        val allowance = model.allowance
        if (allowance == null) {
            Text(stringResource(R.string.no_allowance_yet))
        } else {
            Headline(allowance)
            Breakdown(allowance)
            model.bills?.let { BillsCard(it) }
            Text(
                allowance.dataAsOf?.let { stringResource(R.string.data_as_of, it) }
                    ?: stringResource(R.string.data_as_of_unknown),
                style = MaterialTheme.typography.bodySmall,
            )
            if (allowance.stale) {
                Text(stringResource(R.string.stale_warning), color = MaterialTheme.colorScheme.error)
            }
        }
        Text(
            model.lastChecked?.let { stringResource(R.string.last_checked, it) } ?: stringResource(R.string.never_checked),
            style = MaterialTheme.typography.bodySmall,
        )

        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Button(onClick = onRefresh, enabled = !refreshing) { Text(stringResource(R.string.refresh)) }
            OutlinedButton(onClick = onSignOut) { Text(stringResource(R.string.sign_out)) }
        }
    }
}

@Composable
private fun Headline(allowance: AllowanceModel) {
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // The weight keeps the ring from pushing the amount off a narrow screen.
        HeadlineText(allowance, Modifier.weight(1f))
        allowance.ring?.let { Ring(it) }
    }
}

@Composable
private fun HeadlineText(allowance: AllowanceModel, modifier: Modifier) {
    val amountColor = toneColor(allowance.tone, normal = Color.Unspecified)
    Column(modifier, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        if (allowance.amount != null) {
            Text(allowance.amount, style = MaterialTheme.typography.displayMedium, color = amountColor)
        } else {
            Text(
                stringResource(R.string.no_budget_for, allowance.noBudgetMonth.orEmpty()),
                style = MaterialTheme.typography.headlineSmall,
            )
        }
        val daysLeft = pluralStringResource(R.plurals.days_left, allowance.daysLeft, allowance.daysLeft)
        val perWeek = allowance.perWeek?.let { stringResource(R.string.per_week, it) }
        Text(listOfNotNull(perWeek, daysLeft).joinToString(" · "), style = MaterialTheme.typography.titleMedium)
    }
}

private val RING_SIZE = 56.dp
private val RING_STROKE = 6.dp
private const val TRACK_ALPHA = 0.25f

@Composable
private fun Ring(ring: SpendingRing) {
    val color = toneColor(ring.tone, normal = MaterialTheme.colorScheme.primary)
    Canvas(Modifier.size(RING_SIZE)) {
        val strokePx = RING_STROKE.toPx()
        val inset = strokePx / 2
        val arcSize = size.copy(width = size.width - strokePx, height = size.height - strokePx)
        val topLeft = Offset(inset, inset)
        drawArc(color.copy(alpha = TRACK_ALPHA), 0f, 360f, false, topLeft, arcSize, style = Stroke(strokePx))
        if (ring.fill > 0f) {
            drawArc(color, -90f, ring.fill * 360f, false, topLeft, arcSize, style = Stroke(strokePx, cap = StrokeCap.Round))
        }
        // Same tick as the widget: it reaches inside the ring to stay visible once the fill passes it.
        val angle = Math.toRadians(-90.0 + ring.pace * 360.0)
        val direction = Offset(cos(angle).toFloat(), sin(angle).toFloat())
        val radius = size.minDimension / 2
        drawLine(color, center + direction * radius, center + direction * (radius - 2 * strokePx), strokeWidth = strokePx / 2)
    }
}

@Composable
private fun toneColor(tone: AmountTone, normal: Color): Color = when (tone) {
    AmountTone.Over -> MaterialTheme.colorScheme.error
    AmountTone.Stale -> MaterialTheme.colorScheme.onSurfaceVariant
    AmountTone.Normal -> normal
}

@Composable
private fun Breakdown(allowance: AllowanceModel) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            allowance.flexibleRemaining?.let { BreakdownRow(stringResource(R.string.flexible_remaining), it) }
            allowance.committedOverspend?.let { BreakdownRow(stringResource(R.string.committed_overspend), it) }
            if (allowance.flexibleRemaining != null || allowance.committedOverspend != null) HorizontalDivider()
            BreakdownRow(
                stringResource(R.string.uncategorized_spend),
                allowance.uncategorizedSpent,
                stringResource(R.string.uncategorized_count, allowance.uncategorizedCount)
                    .takeIf { allowance.uncategorizedCount > 0 },
            )
        }
    }
}

@Composable
private fun BreakdownRow(label: String, value: String?, note: String? = null) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Column {
            Text(label)
            note?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error) }
        }
        value?.let { Text(it) }
    }
}

private val WEEKDAY_WIDTH = 40.dp

@Composable
private fun BillsCard(card: BillsCardModel) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(stringResource(R.string.bills_this_week), style = MaterialTheme.typography.titleMedium)
                Text(
                    card.total,
                    style = MaterialTheme.typography.titleMedium,
                    color = toneColor(card.totalTone, normal = Color.Unspecified),
                )
            }
            if (card.rows.isEmpty()) {
                Text(stringResource(R.string.no_bills_this_week))
            } else {
                HorizontalDivider()
                card.rows.forEach { OccurrenceRowView(it) }
            }
        }
    }
}

@Composable
private fun OccurrenceRowView(row: OccurrenceRow) {
    val color = toneColor(row.tone, normal = Color.Unspecified)
    val paid = stringResource(R.string.bill_paid)
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(row.weekday, Modifier.width(WEEKDAY_WIDTH), color = color)
        Text(row.name, Modifier.weight(1f), color = color, maxLines = 1, overflow = TextOverflow.Ellipsis)
        if (row.paid) Text(stringResource(R.string.bill_paid_tick), Modifier.semantics { contentDescription = paid }, color = color)
        Text(row.amount, color = color)
    }
}
