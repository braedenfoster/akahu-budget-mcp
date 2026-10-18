package nz.foster.budget.api

import java.io.File

val contractsDir = File(
    System.getProperty("budget.contractsDir") ?: error("budget.contractsDir is not set; run through Gradle"),
)

fun contractJson(state: String): String = File(contractsDir, "spending-allowance.$state.json").readText()

fun contractAllowance(state: String): SpendingAllowance = parseSpendingAllowance(contractJson(state))
