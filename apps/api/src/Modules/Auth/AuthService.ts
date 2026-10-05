import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type { RoleAssignmentConfiguration, SecurityConfiguration } from "../../Configuration/ApplicationConfiguration.js";
import { BadRequestError, ErrorCode } from "../../Common/Errors/ApplicationError.js";
import { constantTimeEquals, generateSecret, sha256Hex } from "../../Common/Security/Secrets.js";
import { Role } from "../../Domain/Roles.js";
import type { KeyValueStore } from "../../Infrastructure/Cache/KeyValueStore.js";
import type { Database } from "../../Infrastructure/Database/Database.js";
import { users, type UserRecord } from "../../Infrastructure/Database/Schema.js";
import type { DiscordOAuthClient, DiscordProfile } from "../../Infrastructure/Discord/DiscordOAuthClient.js";
import type { IssuedToken, TokenService } from "./TokenService.js";

export interface LoginStart {
    readonly authorizeUrl: string;
    readonly state: string;
}

export interface LoginCallback {
    readonly state: string | undefined;
    readonly cookieState: string | undefined;
    readonly code: string | undefined;
    readonly error: string | undefined;
}

export interface Session extends IssuedToken {
    readonly user: UserRecord;
}

interface ReturnTarget {
    readonly origin: string;
    readonly path: string;
}

interface PendingLogin extends ReturnTarget {
    readonly codeChallenge: string;
}

interface IssuedLoginCode {
    readonly userId: string;
    readonly codeChallenge: string;
}

const stateTtlSeconds = 10 * 60;
const loginCodeTtlSeconds = 60;
const safePathPattern = /^\/(?![/\\])(?!.*\/\/)(?!.*%(?:2f|5c))[A-Za-z0-9\-._~!$&'()*+,;=:@%/]{0,511}$/iu;
const codeChallengePattern = /^[A-Za-z0-9_-]{43}$/u;
const codeVerifierPattern = /^[A-Za-z0-9\-._~]{43,128}$/u;
const statePattern = /^[A-Za-z0-9_-]{43}$/u;
const loginCodePattern = /^lgc_[A-Za-z0-9_-]{43}$/u;

export class AuthService {
    public constructor(
        private readonly database: Database,
        private readonly store: KeyValueStore,
        private readonly discord: DiscordOAuthClient,
        private readonly tokens: TokenService,
        private readonly security: SecurityConfiguration,
        private readonly roleAssignments: RoleAssignmentConfiguration,
        private readonly logger: FastifyBaseLogger
    ) {}

    public async beginLogin(returnTo: string | undefined, codeChallenge: string): Promise<LoginStart> {
        if (!codeChallengePattern.test(codeChallenge)) {
            throw new BadRequestError("codeChallenge must be the base64url SHA-256 of a PKCE code verifier.", ErrorCode.ValidationFailed);
        }
        const state = generateSecret("");
        const pending: PendingLogin = { ...this.resolveReturnTarget(returnTo), codeChallenge };
        await this.store.set(`oauth-state:${state}`, JSON.stringify(pending), stateTtlSeconds);
        return { authorizeUrl: this.discord.buildAuthorizeUrl(state), state };
    }

    public async completeLogin(callback: LoginCallback): Promise<string> {
        const defaultTarget = this.defaultTarget();
        const { state, cookieState } = callback;
        if (state === undefined || cookieState === undefined || !statePattern.test(state) || !constantTimeEquals(state, cookieState)) {
            return this.buildRedirect(defaultTarget, { error: "invalid_state" });
        }

        const storedTarget = await this.store.take(`oauth-state:${state}`);
        if (storedTarget === null) {
            return this.buildRedirect(defaultTarget, { error: "expired_state" });
        }
        const pending = this.parsePendingLogin(storedTarget);
        if (pending === null) {
            return this.buildRedirect(defaultTarget, { error: "invalid_state" });
        }
        const target: ReturnTarget = { origin: pending.origin, path: pending.path };

        if (callback.error !== undefined) {
            const error = /^[a-z_]{1,64}$/u.test(callback.error) ? callback.error : "authorization_failed";
            return this.buildRedirect(target, { error });
        }
        if (callback.code === undefined || callback.code.length === 0 || callback.code.length > 512) {
            return this.buildRedirect(target, { error: "missing_code" });
        }

        try {
            const accessToken = await this.discord.exchangeCode(callback.code);
            const profile = await this.discord.fetchProfile(accessToken);
            const user = await this.syncUser(profile);
            const loginCode = generateSecret("lgc_");
            const issued: IssuedLoginCode = { userId: user.id, codeChallenge: pending.codeChallenge };
            await this.store.set(`login-code:${sha256Hex(loginCode)}`, JSON.stringify(issued), loginCodeTtlSeconds);
            return this.buildRedirect(target, { code: loginCode, returnTo: target.path });
        } catch (error: unknown) {
            this.logger.warn({ err: error }, "discord login failed");
            return this.buildRedirect(target, { error: "authentication_failed" });
        }
    }

    public async exchangeLoginCode(code: string, codeVerifier: string): Promise<Session> {
        const stored = loginCodePattern.test(code) ? await this.store.take(`login-code:${sha256Hex(code)}`) : null;
        const issued = stored === null ? null : this.parseIssuedLoginCode(stored);
        if (
            issued === null ||
            !codeVerifierPattern.test(codeVerifier) ||
            !constantTimeEquals(createHash("sha256").update(codeVerifier, "ascii").digest("base64url"), issued.codeChallenge)
        ) {
            throw new BadRequestError("The login code is invalid, expired or already used.", ErrorCode.InvalidLoginCode);
        }
        const [user] = await this.database.select().from(users).where(eq(users.id, issued.userId)).limit(1);
        if (user === undefined) {
            throw new BadRequestError("The login code is invalid, expired or already used.", ErrorCode.InvalidLoginCode);
        }
        const token = await this.tokens.issue(user.id);
        return { ...token, user };
    }

    public async syncUser(profile: DiscordProfile): Promise<UserRecord> {
        const assignedRole = this.assignedRoleFor(profile.id);
        const [user] = await this.database
            .insert(users)
            .values({
                discordId: profile.id,
                discordUsername: profile.username,
                discordAvatar: profile.avatar,
                role: assignedRole
            })
            .onConflictDoUpdate({
                target: users.discordId,
                set: {
                    discordUsername: profile.username,
                    discordAvatar: profile.avatar,
                    role: sql`GREATEST(${users.role}, excluded.role)`,
                    updatedAt: new Date()
                }
            })
            .returning();
        if (user === undefined) {
            throw new Error("User upsert returned no row.");
        }
        return user;
    }

    public resolveReturnTarget(returnTo: string | undefined): ReturnTarget {
        const fallback = this.defaultTarget();
        if (returnTo === undefined || returnTo.length === 0 || returnTo.length > 2048) {
            return fallback;
        }
        try {
            const isRelative = returnTo.startsWith("/") && !returnTo.startsWith("//") && !returnTo.startsWith("/\\");
            const url = isRelative ? new URL(returnTo, fallback.origin) : new URL(returnTo);
            const allowed = this.security.corsOrigins.includes(url.origin);
            if (!allowed || url.username !== "" || url.password !== "" || !safePathPattern.test(url.pathname)) {
                return fallback;
            }
            return { origin: url.origin, path: url.pathname };
        } catch {
            return fallback;
        }
    }

    private assignedRoleFor(discordId: string): Role {
        const assignments = this.roleAssignments;
        if (assignments.admins.includes(discordId)) {
            return Role.Admin;
        }
        if (assignments.supervisors.includes(discordId)) {
            return Role.Supervisor;
        }
        if (assignments.moderators.includes(discordId)) {
            return Role.Moderator;
        }
        if (assignments.seniorContributors.includes(discordId)) {
            return Role.SeniorContributor;
        }
        return Role.Voter;
    }

    private defaultTarget(): ReturnTarget {
        return { origin: this.security.corsOrigins[0] ?? this.security.appUrl, path: "/" };
    }

    private parsePendingLogin(value: string): PendingLogin | null {
        try {
            const parsed = JSON.parse(value) as Partial<PendingLogin>;
            if (
                typeof parsed.origin === "string" &&
                typeof parsed.path === "string" &&
                typeof parsed.codeChallenge === "string" &&
                this.security.corsOrigins.includes(parsed.origin) &&
                safePathPattern.test(parsed.path) &&
                codeChallengePattern.test(parsed.codeChallenge)
            ) {
                return { origin: parsed.origin, path: parsed.path, codeChallenge: parsed.codeChallenge };
            }
        } catch {
            return null;
        }
        return null;
    }

    private parseIssuedLoginCode(value: string): IssuedLoginCode | null {
        try {
            const parsed = JSON.parse(value) as Partial<IssuedLoginCode>;
            if (typeof parsed.userId === "string" && typeof parsed.codeChallenge === "string") {
                return { userId: parsed.userId, codeChallenge: parsed.codeChallenge };
            }
        } catch {
            return null;
        }
        return null;
    }

    private buildRedirect(target: ReturnTarget, fragment: Record<string, string>): string {
        return `${target.origin}${this.security.webAuthCallbackPath}#${new URLSearchParams(fragment).toString()}`;
    }
}
