import { defineConfig } from "drizzle-kit";

// Migrations are generated from the Drizzle schema and applied on startup
// (src/db/index.ts). The database file lives outside the repo (see .gitignore).
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_PATH ?? "./data/budget.sqlite",
  },
});
