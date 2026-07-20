import type { AnyTool } from "./types.js";
import { getSettingsTool, setSettingTool } from "./settings.js";
import { listAccountsTool } from "./accounts.js";
import {
  listTransactionsTool,
  refreshTool,
  searchTransactionsTool,
} from "./transactions.js";
import {
  categorizeTransactionTool,
  listCategoriesTool,
  listUncategorizedTool,
  manageCategoriesTool,
  setCategoryRuleTool,
} from "./categories.js";
import {
  createBudgetForPeriodTool,
  getBudgetTool,
  reallocateTool,
  setAllocationTool,
  setExpectedIncomeTool,
} from "./budget.js";
import { evaluatePurchaseTool } from "./evaluate.js";
import {
  addPlannedPurchaseTool,
  dropPlannedPurchaseTool,
  listPlannedPurchasesTool,
  markPurchasedTool,
  planPeriodTool,
  updatePlannedPurchaseTool,
} from "./planned.js";
import {
  classifyIncomeTool,
  incomeCoverageTool,
  listIncomeStreamsTool,
  listUnclassifiedIncomeTool,
  manageIncomeStreamsTool,
  setIncomeRuleTool,
} from "./income.js";
import { getPeriodSummaryTool } from "./reports.js";
import { getWorkflowGuideTool } from "./guides.js";

/**
 * Every MCP tool the server exposes. Grows one ticket at a time; the server and
 * the Seam 1 tests both source their tools from here.
 */
export const allTools: AnyTool[] = [
  getSettingsTool,
  setSettingTool,
  listAccountsTool,
  listTransactionsTool,
  searchTransactionsTool,
  refreshTool,
  listCategoriesTool,
  listUncategorizedTool,
  manageCategoriesTool,
  categorizeTransactionTool,
  setCategoryRuleTool,
  getBudgetTool,
  createBudgetForPeriodTool,
  setAllocationTool,
  setExpectedIncomeTool,
  reallocateTool,
  evaluatePurchaseTool,
  addPlannedPurchaseTool,
  listPlannedPurchasesTool,
  updatePlannedPurchaseTool,
  markPurchasedTool,
  dropPlannedPurchaseTool,
  planPeriodTool,
  listIncomeStreamsTool,
  manageIncomeStreamsTool,
  setIncomeRuleTool,
  classifyIncomeTool,
  listUnclassifiedIncomeTool,
  incomeCoverageTool,
  getPeriodSummaryTool,
  getWorkflowGuideTool,
];

export function toolByName(name: string): AnyTool | undefined {
  return allTools.find((t) => t.name === name);
}
