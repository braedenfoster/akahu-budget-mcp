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
    private const val MIDNIGHT = "allowance-refresh-midnight"
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

    // KEEP is a no-op while the midnight run itself is running, so the next
    // midnight run is queued by the following 3-hourly run or app start.
    fun scheduleMidnight(context: Context, now: Instant = Instant.now()) {
        WorkManager.getInstance(context).enqueueUniqueWork(
            MIDNIGHT,
            ExistingWorkPolicy.KEEP,
            OneTimeWorkRequestBuilder<AllowanceRefreshWorker>()
                .setInitialDelay(delayUntilAfterMidnight(now, HOUSEHOLD_ZONE))
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
