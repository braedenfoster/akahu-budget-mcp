package nz.foster.budget.api

import java.io.File

val contractsDir = File(
    System.getProperty("budget.contractsDir") ?: error("budget.contractsDir is not set; run through Gradle"),
)

fun contractJson(state: String): String = File(contractsDir, "spending-allowance.$state.json").readText()

fun contractAllowance(state: String): SpendingAllowance = parseSpendingAllowance(contractJson(state))

/** Every fixture carries a Bills view. */
fun contractBills(state: String): BillsView = parseAllowanceResponse(contractJson(state)).bills!!

/** Every fixture is 15 Oct, with 17 of the Period's 31 days left. */
val contractPace = (14.0 / 31).toFloat()
