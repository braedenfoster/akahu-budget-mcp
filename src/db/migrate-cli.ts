import "dotenv/config";
import { loadConfig } from "../config.js";
import { openAndMigrate } from "./index.js";

// Standalone migration runner (`pnpm db:migrate`). Startup also migrates, so
// this is mostly for ops verification on the Pi.
const config = loadConfig();
const db = openAndMigrate(config.databasePath);
db.$client.close();
console.log(`Migrations applied to ${config.databasePath}`);
