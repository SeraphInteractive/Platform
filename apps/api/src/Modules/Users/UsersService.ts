import { asc, count, desc, eq, inArray } from "drizzle-orm";
import { ConflictError, ErrorCode, ForbiddenError, NotFoundError } from "../../Common/Errors/ApplicationError.js";
import { createPage, offsetOf, type Page, type PaginationQuery } from "../../Common/Http/Schemas.js";
import type { Actor } from "../../Common/Security/Principal.js";
import { isHigherThan, normalizeSpecialties, Role, type Specialty } from "../../Domain/Roles.js";
import type { Database, Transaction } from "../../Infrastructure/Database/Database.js";
import { users, type UserRecord } from "../../Infrastructure/Database/Schema.js";
import { NotificationType, personOfActor, personOfUser, type Notifier } from "../../Infrastructure/Notifications/Notification.js";
import type { LeaderboardCache } from "../Leaderboards/LeaderboardCache.js";

export type UserReference = { readonly kind: "id"; readonly id: string } | { readonly kind: "discord"; readonly discordId: string };

export interface RoleChange {
    readonly role: Role;
    readonly specialties?: readonly Specialty[];
    readonly discordUsername?: string;
}

export interface UserListQuery extends PaginationQuery {
    readonly role?: Role;
}

export class UsersService {
    public constructor(
        private readonly database: Database,
        private readonly notifier: Notifier,
        private readonly leaderboardCache: LeaderboardCache
    ) {}

    public async findById(userId: string): Promise<UserRecord | null> {
        const [user] = await this.database.select().from(users).where(eq(users.id, userId)).limit(1);
        return user ?? null;
    }

    public async list(query: UserListQuery): Promise<Page<UserRecord>> {
        const filter = query.role === undefined ? undefined : eq(users.role, query.role);
        const [rows, totals] = await Promise.all([
            this.database
                .select()
                .from(users)
                .where(filter)
                .orderBy(desc(users.createdAt), desc(users.id))
                .limit(query.perPage)
                .offset(offsetOf(query)),
            this.database.select({ total: count() }).from(users).where(filter)
        ]);
        return createPage(rows, totals[0]?.total ?? 0, query);
    }

    public async changeRole(actor: Actor, reference: UserReference, change: RoleChange, createIfMissing: boolean): Promise<UserRecord> {
        return this.database.transaction(async (transaction) => {
            const { actor: current, target } = await this.lockParticipants(transaction, actor, reference);
            this.assertCanGrant(current, change.role);
            if (target === null) {
                if (!createIfMissing || reference.kind !== "discord") {
                    throw new NotFoundError("User");
                }
                const [created] = await transaction
                    .insert(users)
                    .values({
                        discordId: reference.discordId,
                        discordUsername: change.discordUsername ?? `discord_${reference.discordId}`,
                        role: change.role,
                        specialties: normalizeSpecialties(change.role, change.specialties ?? [])
                    })
                    .onConflictDoNothing({ target: users.discordId })
                    .returning();
                if (created === undefined) {
                    throw new ConflictError("The user was created concurrently. Retry the request.");
                }
                return created;
            }

            this.assertCanManage(current, target);
            const specialties = normalizeSpecialties(change.role, change.specialties ?? target.specialties);
            const [updated] = await transaction
                .update(users)
                .set({
                    role: change.role,
                    specialties,
                    ...(change.discordUsername === undefined ? {} : { discordUsername: change.discordUsername })
                })
                .where(eq(users.id, target.id))
                .returning();
            return this.required(updated);
        });
    }

    public async blacklist(actor: Actor, reference: UserReference, reason: string | null): Promise<UserRecord> {
        const user = await this.database.transaction(async (transaction) => {
            const { actor: current, target } = await this.lockParticipants(transaction, actor, reference);
            if (target === null) {
                throw new NotFoundError("User");
            }
            this.assertCanManage(current, target);
            const [updated] = await transaction
                .update(users)
                .set({ isBlacklisted: true, blacklistReason: reason, blacklistedAt: target.blacklistedAt ?? new Date() })
                .where(eq(users.id, target.id))
                .returning();
            return this.required(updated);
        });
        await this.leaderboardCache.invalidateAll();
        this.notifier.notify({
            type: NotificationType.UserBlacklisted,
            user: personOfUser(user),
            actor: personOfActor(actor),
            reason
        });
        return user;
    }

    public async reinstate(actor: Actor, reference: UserReference): Promise<UserRecord> {
        const user = await this.database.transaction(async (transaction) => {
            const { actor: current, target } = await this.lockParticipants(transaction, actor, reference);
            if (target === null) {
                throw new NotFoundError("User");
            }
            this.assertCanManage(current, target);
            const [updated] = await transaction
                .update(users)
                .set({ isBlacklisted: false, blacklistReason: null, blacklistedAt: null })
                .where(eq(users.id, target.id))
                .returning();
            return this.required(updated);
        });
        await this.leaderboardCache.invalidateAll();
        this.notifier.notify({
            type: NotificationType.UserReinstated,
            user: personOfUser(user),
            actor: personOfActor(actor)
        });
        return user;
    }

    public async promoteToSenior(actor: Actor, userId: string): Promise<UserRecord> {
        const user = await this.database.transaction(async (transaction) => {
            const { actor: current, target } = await this.lockParticipants(transaction, actor, { kind: "id", id: userId });
            if (target === null) {
                throw new NotFoundError("User");
            }
            if (target.role !== Role.Contributor) {
                throw new ConflictError("Only contributors can be promoted to senior contributor.", ErrorCode.InvalidStatusTransition);
            }
            this.assertCanManage(current, target);
            const [updated] = await transaction
                .update(users)
                .set({ role: Role.SeniorContributor })
                .where(eq(users.id, target.id))
                .returning();
            return this.required(updated);
        });
        this.notifier.notify({ type: NotificationType.ContributorPromoted, user: personOfUser(user), actor: personOfActor(actor) });
        return user;
    }

    private async lockParticipants(
        transaction: Transaction,
        actor: Actor,
        reference: UserReference
    ): Promise<{ actor: Actor; target: UserRecord | null }> {
        const condition = reference.kind === "id" ? eq(users.id, reference.id) : eq(users.discordId, reference.discordId);
        const [resolved] = await transaction.select({ id: users.id }).from(users).where(condition).limit(1);
        const ids = [...new Set([resolved?.id, actor.userId].filter((id): id is string => id !== undefined && id !== null))];
        const locked =
            ids.length === 0
                ? []
                : await transaction.select().from(users).where(inArray(users.id, ids)).orderBy(asc(users.id)).for("update");
        const target = locked.find((user) => user.id === resolved?.id) ?? null;
        if (actor.userId === null) {
            return { actor, target };
        }
        const actorRecord = locked.find((user) => user.id === actor.userId);
        if (actorRecord === undefined || actorRecord.isBlacklisted) {
            throw new ForbiddenError("Your account can no longer perform this action.");
        }
        return { actor: { ...actor, role: actorRecord.role }, target };
    }

    private assertCanGrant(actor: Actor, role: Role): void {
        if (actor.role !== Role.Admin && !isHigherThan(actor.role, role)) {
            throw new ForbiddenError("You can only grant roles below your own.");
        }
    }

    private assertCanManage(actor: Actor, target: UserRecord): void {
        if (actor.userId === target.id) {
            throw new ForbiddenError("You cannot change your own account.");
        }
        if (!isHigherThan(actor.role, target.role)) {
            throw new ForbiddenError("You can only manage users ranked below you.");
        }
    }

    private required(user: UserRecord | undefined): UserRecord {
        if (user === undefined) {
            throw new NotFoundError("User");
        }
        return user;
    }
}
