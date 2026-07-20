import type { AppConfig } from "./config.js";
import type { AppContext } from "./context.js";
import {
  SETTING_BUDGET_MONTH_START_DAY,
  SETTING_HOME_CURRENCY,
  SETTING_READ_ONLY,
  getSetting,
  putSetting,
} from "./context.js";

/**
 * Seed the settings that config controls. Runs at startup outside the write
 * wrapper (this is system initialisation, not a user mutation). Config is the
 * source of truth for these, so we overwrite on each boot.
 */
export function seedSettingsFromConfig(ctx: AppContext, config: AppConfig): void {
  putSetting(ctx, SETTING_READ_ONLY, config.readOnly ? "true" : "false");
  putSetting(ctx, SETTING_HOME_CURRENCY, config.homeCurrency);
  if (config.budgetMonthStartDay !== undefined) {
    putSetting(
      ctx,
      SETTING_BUDGET_MONTH_START_DAY,
      String(config.budgetMonthStartDay),
    );
  } else if (getSetting(ctx, SETTING_BUDGET_MONTH_START_DAY) === undefined) {
    putSetting(ctx, SETTING_BUDGET_MONTH_START_DAY, "1");
  }
}
