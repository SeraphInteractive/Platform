import { fileURLToPath } from "node:url";
import { readMigrationFiles } from "drizzle-orm/migrator";
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
        await client`CREATE SCHEMA IF NOT EXISTS "drizzle"`;
        await client`
            CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
                id SERIAL PRIMARY KEY,
                hash text NOT NULL,
                created_at bigint
            )
        `;

        const dbMigrations = await client<{ id: number; hash: string; created_at: string }[]>`
            SELECT id, hash, created_at FROM "drizzle"."__drizzle_migrations" ORDER BY created_at DESC LIMIT 1
        `;
        const lastDbMigration = dbMigrations[0];
        const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));
        const migrations = readMigrationFiles({ migrationsFolder });

        for (const migration of migrations) {
            if (!lastDbMigration || Number(lastDbMigration.created_at) < migration.folderMillis) {
                await client.begin(async (tx) => {
                    for (const stmt of migration.sql) {
                        const trimmed = stmt.trim();
                        if (trimmed.length > 0) {
                            await tx.unsafe(trimmed);
                        }
                    }
                    await tx`
                        INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
                        VALUES (${migration.hash}, ${migration.folderMillis})
                    `;
                });
            }
        }

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
