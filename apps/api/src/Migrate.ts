import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { databaseEnvironmentSchema } from "./Configuration/Environment.js";
import { createPostgresClient } from "./Infrastructure/Database/Database.js";

const migrationLockKey = 7_231_004_118;

async function runMigrations(): Promise<void> {
    const parsed = databaseEnvironmentSchema.safeParse(process.env);
    if (!parsed.success) {
        throw new Error(
            `Invalid database configuration: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`
        );
    }
    const environment = parsed.data;
    const client = createPostgresClient(
        {
            host: environment.DB_HOST,
            port: environment.DB_PORT,
            user: environment.DB_USER,
            password: environment.DB_PASSWORD,
            database: environment.DB_DATABASE,
            ssl: environment.DB_SSL,
            poolMax: 1
        },
        1
    );

    try {
        await client`SELECT pg_advisory_lock(${migrationLockKey})`;
        await migrate(drizzle(client), { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
        await client`SELECT pg_advisory_unlock(${migrationLockKey})`;
        process.stdout.write("Database migrations applied.\n");
    } finally {
        await client.end({ timeout: 5 });
    }
}

runMigrations().catch((error: unknown) => {
    process.stderr.write(`Migration failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
});
