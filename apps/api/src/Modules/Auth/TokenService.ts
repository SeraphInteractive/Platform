import { and, eq, gt, lt } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type { SecurityConfiguration } from "../../Configuration/ApplicationConfiguration.js";
import type { Principal, UserPrincipal } from "../../Common/Security/Principal.js";
import { constantTimeEquals, generateSecret, sha256Hex } from "../../Common/Security/Secrets.js";
import type { Database } from "../../Infrastructure/Database/Database.js";
import { accessTokens, users } from "../../Infrastructure/Database/Schema.js";

export interface IssuedToken {
    readonly token: string;
    readonly expiresAt: Date;
}

const tokenPrefix = "plt_";
const tokenPattern = /^plt_[A-Za-z0-9_-]{43}$/u;
const lastUsedRefreshMs = 5 * 60 * 1000;

export class TokenService {
    public constructor(
        private readonly database: Database,
        private readonly configuration: SecurityConfiguration,
        private readonly logger: FastifyBaseLogger
    ) {}

    public async issue(userId: string): Promise<IssuedToken> {
        const token = generateSecret(tokenPrefix);
        const expiresAt = new Date(Date.now() + this.configuration.sessionTtlDays * 24 * 60 * 60 * 1000);
        await this.database.insert(accessTokens).values({ userId, tokenHash: sha256Hex(token), expiresAt });
        return { token, expiresAt };
    }

    public async authenticate(rawToken: string): Promise<Principal | null> {
        const serviceToken = this.configuration.serviceToken;
        if (serviceToken !== undefined && constantTimeEquals(rawToken, serviceToken)) {
            return { kind: "service" };
        }
        if (!tokenPattern.test(rawToken)) {
            return null;
        }

        const now = new Date();
        const [row] = await this.database
            .select({
                tokenId: accessTokens.id,
                lastUsedAt: accessTokens.lastUsedAt,
                id: users.id,
                discordId: users.discordId,
                discordUsername: users.discordUsername,
                role: users.role,
                isBlacklisted: users.isBlacklisted
            })
            .from(accessTokens)
            .innerJoin(users, eq(users.id, accessTokens.userId))
            .where(and(eq(accessTokens.tokenHash, sha256Hex(rawToken)), gt(accessTokens.expiresAt, now)))
            .limit(1);

        if (row === undefined) {
            return null;
        }

        if (row.lastUsedAt === null || now.getTime() - row.lastUsedAt.getTime() > lastUsedRefreshMs) {
            this.database
                .update(accessTokens)
                .set({ lastUsedAt: now })
                .where(eq(accessTokens.id, row.tokenId))
                .catch((error: unknown) => {
                    this.logger.warn({ err: error }, "failed to record token usage");
                });
        }

        return {
            kind: "user",
            tokenId: row.tokenId,
            isDelegated: false,
            user: {
                id: row.id,
                discordId: row.discordId,
                discordUsername: row.discordUsername,
                role: row.role,
                isBlacklisted: row.isBlacklisted
            }
        };
    }

    public async authenticateDelegated(discordId: string): Promise<UserPrincipal | null> {
        const [user] = await this.database
            .select({
                id: users.id,
                discordId: users.discordId,
                discordUsername: users.discordUsername,
                role: users.role,
                isBlacklisted: users.isBlacklisted
            })
            .from(users)
            .where(eq(users.discordId, discordId))
            .limit(1);
        return user === undefined ? null : { kind: "user", tokenId: null, isDelegated: true, user };
    }

    public async revoke(tokenId: string): Promise<void> {
        await this.database.delete(accessTokens).where(eq(accessTokens.id, tokenId));
    }

    public async revokeAllForUser(userId: string): Promise<void> {
        await this.database.delete(accessTokens).where(eq(accessTokens.userId, userId));
    }

    public async purgeExpired(): Promise<number> {
        const removed = await this.database
            .delete(accessTokens)
            .where(lt(accessTokens.expiresAt, new Date()))
            .returning({ id: accessTokens.id });
        return removed.length;
    }
}
