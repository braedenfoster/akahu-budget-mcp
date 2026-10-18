package nz.foster.budget.refresh

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.time.Instant
import java.time.ZoneId
import java.util.concurrent.TimeUnit

val HOUSEHOLD_ZONE: ZoneId = ZoneId.of("Pacific/Auckland")

object RefreshScheduler {
    private const val PERIODIC = "allowance-refresh-every-3h"
    private const val MIDNIGHT_PREFIX = "allowance-refresh-midnight-"
    private const val NOW = "allowance-refresh-now"

    private val network = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

    fun schedule(context: Context) {
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            PERIODIC,
            ExistingPeriodicWorkPolicy.UPDATE,
            PeriodicWorkRequestBuilder<AllowanceRefreshWorker>(3, TimeUnit.HOURS).setConstraints(network).build(),
        )
        scheduleMidnight(context)
    }

    // The date in the name lets a running midnight fetch queue the next one;
    // KEEP alone would skip it while the current one is still running.
    fun scheduleMidnight(context: Context) {
        val run = nextMidnightRun(Instant.now(), HOUSEHOLD_ZONE)
        WorkManager.getInstance(context).enqueueUniqueWork(
            "$MIDNIGHT_PREFIX${run.date}",
            ExistingWorkPolicy.KEEP,
            OneTimeWorkRequestBuilder<AllowanceRefreshWorker>()
                .setInitialDelay(run.delay)
                .setConstraints(network)
                .build(),
        )
    }

    fun refreshNow(context: Context) {
        WorkManager.getInstance(context).enqueueUniqueWork(
            NOW,
            ExistingWorkPolicy.KEEP,
            OneTimeWorkRequestBuilder<AllowanceRefreshWorker>().setConstraints(network).build(),
        )
    }
}
