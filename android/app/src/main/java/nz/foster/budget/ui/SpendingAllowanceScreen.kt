package nz.foster.budget.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import nz.foster.budget.R
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

        val figure = model.figure
        if (figure == null) {
            Text(stringResource(R.string.no_figure_yet))
        } else {
            Headline(figure)
            Breakdown(figure)
            Text(
                figure.dataAsOf?.let { stringResource(R.string.data_as_of, it) }
                    ?: stringResource(R.string.data_as_of_unknown),
                style = MaterialTheme.typography.bodySmall,
            )
            if (figure.stale) {
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
private fun Headline(figure: FigureModel) {
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val amountColor = when {
        figure.stale -> muted
        figure.over -> MaterialTheme.colorScheme.error
        else -> Color.Unspecified
    }
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        if (figure.amount != null) {
            Text(figure.amount, style = MaterialTheme.typography.displayMedium, color = amountColor)
        } else {
            Text(
                stringResource(R.string.no_budget_for, figure.noBudgetMonth.orEmpty()),
                style = MaterialTheme.typography.headlineSmall,
            )
        }
        val daysLeft = pluralStringResource(R.plurals.days_left, figure.daysLeft, figure.daysLeft)
        val perWeek = figure.perWeek?.let { stringResource(R.string.per_week, it) }
        Text(listOfNotNull(perWeek, daysLeft).joinToString(" · "), style = MaterialTheme.typography.titleMedium)
    }
}

@Composable
private fun Breakdown(figure: FigureModel) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            figure.flexibleRemaining?.let { BreakdownRow(stringResource(R.string.flexible_remaining), it) }
            figure.committedOverspend?.let { BreakdownRow(stringResource(R.string.committed_overspend), it) }
            if (figure.flexibleRemaining != null || figure.committedOverspend != null) HorizontalDivider()
            BreakdownRow(
                stringResource(R.string.uncategorized_spend),
                figure.uncategorizedSpent,
                stringResource(R.string.uncategorized_count, figure.uncategorizedCount)
                    .takeIf { figure.uncategorizedCount > 0 },
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
