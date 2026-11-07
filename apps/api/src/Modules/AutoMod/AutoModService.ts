import { desc, eq } from "drizzle-orm";
import { BadRequestError, NotFoundError } from "../../Common/Errors/ApplicationError.js";
import type { Database } from "../../Infrastructure/Database/Database.js";
import { automodRules, type AutomodRuleRecord } from "../../Infrastructure/Database/Schema.js";

const defaultSeedRules: readonly string[] = Object.freeze([
    "gyatt",
    "goon",
    "gooner",
    "gooning",
    "edging",
    "edger",
    "diddy party",
    "oil up",
    "freaky bob",
    "thug shaker",
    "bop",
    "nigger",
    "nigga",
    "niggaz",
    "faggot",
    "fag",
    "retard",
    "retarded",
    "tranny",
    "troon",
    "shemale",
    "chink",
    "gook",
    "kike",
    "spic",
    "wetback",
    "coon",
    "beaner",
    "raghead",
    "towelhead",
    "kys",
    "kill yourself",
    "rope yourself",
    "slit wrists",
    "drink bleach",
    "neck yourself",
    "hang yourself",
    "cunt",
    "cunts",
    "whore",
    "whores",
    "slut",
    "sluts",
    "bitch",
    "bitches",
    "bitchass",
    "bastard",
    "bastards",
    "dickhead",
    "cocksucker",
    "pussy",
    "fuck",
    "fucking",
    "fucker",
    "motherfucker",
    "shit",
    "bullshit",
    "dipshit",
    "shithead",
    "asshole",
    "dumbass",
    "jackass",
    "asswipe",
    "asshat"
]);

export class AutoModService {
    public constructor(private readonly database: Database) {}

    public async list(): Promise<AutomodRuleRecord[]> {
        const existing = await this.database.select().from(automodRules).orderBy(desc(automodRules.createdAt));
        if (existing.length === 0) {
            await this.seedDefaults();
            return this.database.select().from(automodRules).orderBy(desc(automodRules.createdAt));
        }
        return existing;
    }

    private async seedDefaults(): Promise<void> {
        const rows = defaultSeedRules.map((pattern) => ({
            pattern,
            isRegex: false,
            createdBy: null
        }));
        await this.database.insert(automodRules).values(rows);
    }

    public async create(pattern: string, isRegex: boolean, actorId: string): Promise<AutomodRuleRecord> {
        const trimmed = pattern.trim();
        if (trimmed.length === 0 || trimmed.length > 250) {
            throw new BadRequestError("Pattern length must be between 1 and 250 characters.");
        }
        if (isRegex) {
            // reject nested quantifiers that cause catastrophic exponential backtracking
            if (/(?:[+*]|\{\d+,?\d*\})\s*(?:[+*]|\{\d+,?\d*\})|\([^)]{1,50}[+*][^)]{0,50}\)[+*]/u.test(trimmed)) {
                throw new BadRequestError("Regular expression contains potentially unsafe nested quantifiers.");
            }
            try {
                // validate regex pattern syntax
                new RegExp(trimmed, "u");
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
