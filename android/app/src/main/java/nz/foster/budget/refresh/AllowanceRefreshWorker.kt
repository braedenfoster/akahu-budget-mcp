package nz.foster.budget.refresh

import android.content.Context
import androidx.glance.appwidget.updateAll
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import nz.foster.budget.allowance.FetchOutcome
import nz.foster.budget.appGraph
import nz.foster.budget.widget.BudgetWidget

class AllowanceRefreshWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val outcome = applicationContext.appGraph.allowance.refresh()
        BudgetWidget().updateAll(applicationContext)
        RefreshScheduler.scheduleMidnight(applicationContext)
        return if (outcome is FetchOutcome.Failed) Result.retry() else Result.success()
    }
}
