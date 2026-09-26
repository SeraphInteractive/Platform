import { defineConfig } from "drizzle-kit";

export default defineConfig({
    dialect: "postgresql",
    schema: "./src/Infrastructure/Database/Schema.ts",
    out: "./drizzle",
    strict: true,
    verbose: true
});
