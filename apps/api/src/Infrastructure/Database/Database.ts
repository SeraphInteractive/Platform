import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import type { DatabaseConfiguration } from "../../Configuration/ApplicationConfiguration.js";
import * as schema from "./Schema.js";

export type DatabaseSchema = typeof schema;

export type Database = PgDatabase<PgQueryResultHKT, DatabaseSchema>;

export type Transaction = PgTransaction<PgQueryResultHKT, DatabaseSchema, ExtractTablesWithRelations<DatabaseSchema>>;

export type DatabaseExecutor = Database | Transaction;

export interface DatabaseConnection {
    readonly database: Database;
    ping(): Promise<void>;
    close(): Promise<void>;
}

export function createPostgresClient(configuration: DatabaseConfiguration, maxConnections: number = configuration.poolMax): Sql {
    return postgres({
        host: configuration.host,
        port: configuration.port,
        username: configuration.user,
        password: configuration.password,
        database: configuration.database,
        max: maxConnections,
        ssl: configuration.ssl === "disable" ? false : configuration.ssl === "require" ? "require" : "verify-full",
        idle_timeout: 30,
        connect_timeout: 10,
        max_lifetime: 60 * 30,
        prepare: true,
        onnotice: () => undefined,
        connection: {
            application_name: "platform-api",
            statement_timeout: 15_000,
            idle_in_transaction_session_timeout: 30_000
        }
    });
}

export function createPostgresConnection(configuration: DatabaseConfiguration): DatabaseConnection {
    const client = createPostgresClient(configuration);
    const database = drizzle(client, { schema });
    return {
        database,
        ping: async (): Promise<void> => {
            await client`SELECT 1`;
        },
        close: async (): Promise<void> => {
            await client.end({ timeout: 5 });
        }
    };
}

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
    return matchesDatabaseError(error, "23505", constraint);
}

export function isForeignKeyViolation(error: unknown, constraint?: string): boolean {
    return matchesDatabaseError(error, "23503", constraint);
}

function matchesDatabaseError(error: unknown, sqlState: string, constraint?: string): boolean {
    let current: unknown = error;
    for (let depth = 0; depth < 5 && current !== null && typeof current === "object"; depth++) {
        const candidate = current as { code?: unknown; constraint_name?: unknown; constraint?: unknown; cause?: unknown };
        if (candidate.code === sqlState) {
            const name = candidate.constraint_name ?? candidate.constraint;
            return constraint === undefined || name === constraint;
        }
        current = candidate.cause;
    }
    return false;
}
