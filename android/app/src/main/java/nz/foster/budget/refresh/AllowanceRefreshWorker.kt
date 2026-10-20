package nz.foster.budget.refresh

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import nz.foster.budget.allowance.FetchOutcome
import nz.foster.budget.appGraph
import nz.foster.budget.widget.updateAllWidgets

class AllowanceRefreshWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val outcome = applicationContext.appGraph.allowance.refresh()
        updateAllWidgets(applicationContext)
        RefreshScheduler.scheduleMidnight(applicationContext)
        return if (outcome is FetchOutcome.Failed) Result.retry() else Result.success()
    }
}
