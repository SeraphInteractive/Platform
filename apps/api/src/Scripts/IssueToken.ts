import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { createConfiguration } from "../Configuration/ApplicationConfiguration.js";
import { loadEnvironment } from "../Configuration/Environment.js";
import { createLogger } from "../Common/Logging/Logger.js";
import { createPostgresClient } from "../Infrastructure/Database/Database.js";
import * as schema from "../Infrastructure/Database/Schema.js";
import { TokenService } from "../Modules/Auth/TokenService.js";

async function issueToken(): Promise<void> {
    const discordId = process.argv[2];
    if (discordId === undefined || !/^\d{17,20}$/u.test(discordId)) {
        throw new Error("Usage: token:issue <discord-id>. The user must have signed in at least once.");
    }
    const configuration = createConfiguration(loadEnvironment());
    const client = createPostgresClient(configuration.database, 1);
    try {
        const database = drizzle(client, { schema });
        const [user] = await database.select().from(schema.users).where(eq(schema.users.discordId, discordId)).limit(1);
        if (user === undefined) {
            throw new Error(`No user with Discord ID ${discordId} exists.`);
        }
        const issued = await new TokenService(database, configuration.security, createLogger("silent", false)).issue(user.id);
        process.stderr.write(`Issued a token for ${user.discordUsername} (${user.role}), expiring ${issued.expiresAt.toISOString()}.\n`);
        process.stdout.write(`${issued.token}\n`);
    } finally {
        await client.end({ timeout: 5 });
    }
}

issueToken().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
});
