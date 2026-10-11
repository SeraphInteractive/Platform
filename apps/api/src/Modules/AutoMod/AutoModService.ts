import { desc, eq } from "drizzle-orm";
import { BadRequestError, NotFoundError } from "../../Common/Errors/ApplicationError.js";
import type { Database } from "../../Infrastructure/Database/Database.js";
import { automodRules, type AutomodRuleRecord } from "../../Infrastructure/Database/Schema.js";

export class AutoModService {
    public constructor(private readonly database: Database) {}

    public async list(): Promise<AutomodRuleRecord[]> {
        return this.database.select().from(automodRules).orderBy(desc(automodRules.createdAt));
    }

    public async create(pattern: string, isRegex: boolean, actorId: string): Promise<AutomodRuleRecord> {
        const trimmed = pattern.trim();
        if (isRegex) {
            try {
                // validate regex pattern syntax
                new RegExp(trimmed);
            } catch (err) {
                throw new BadRequestError(`Invalid regular expression: ${err instanceof Error ? err.message : String(err)}`);
            }
        }

        const [created] = await this.database
            .insert(automodRules)
            .values({
                pattern: trimmed,
                isRegex,
                createdBy: actorId
            })
            .returning();

        if (created === undefined) {
            throw new Error("Failed to insert automod rule.");
        }
        return created;
    }

    public async delete(id: string): Promise<void> {
        const [deleted] = await this.database.delete(automodRules).where(eq(automodRules.id, id)).returning({ id: automodRules.id });

        if (deleted === undefined) {
            throw new NotFoundError("AutoMod rule not found.");
        }
    }
}
