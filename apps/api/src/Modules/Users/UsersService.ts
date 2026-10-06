import { and, asc, count, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { ConflictError, ErrorCode, ForbiddenError, NotFoundError } from "../../Common/Errors/ApplicationError.js";
import { createPage, offsetOf, type Page, type PaginationQuery } from "../../Common/Http/Schemas.js";
import type { Actor } from "../../Common/Security/Principal.js";
import {
    exclusiveSpecialties,
    hasAtLeast,
    isGrantable,
    isHigherThan,
    maximumSpecialties,
    normalizeSpecialties,
    rankOf,
    Role,
    selfSelectableSpecialties,
    settleRole,
    Specialty,
    specialtyLabel
} from "../../Domain/Roles.js";
import type { Database, Transaction } from "../../Infrastructure/Database/Database.js";
import { users, type UserRecord } from "../../Infrastructure/Database/Schema.js";
import { NotificationType, personOfActor, personOfUser, type Notifier } from "../../Infrastructure/Notifications/Notification.js";
import type { LegalAcceptance } from "../Documents/DocumentsService.js";
import type { LeaderboardCache } from "../Leaderboards/LeaderboardCache.js";
import type { TokenService } from "../Auth/TokenService.js";

export type UserReference = { readonly kind: "id"; readonly id: string } | { readonly kind: "discord"; readonly discordId: string };

export interface RoleChange {
    readonly role: Role;
    readonly specialties?: readonly Specialty[];
    readonly discordUsername?: string;
    readonly transfer?: boolean;
}

export interface UserListQuery extends PaginationQuery {
    readonly role?: Role;
}

export class UsersService {
    public constructor(
        private readonly database: Database,
        private readonly notifier: Notifier,
        private readonly leaderboardCache: LeaderboardCache,
        private readonly legal: LegalAcceptance,
        private readonly tokens?: TokenService
    ) {}

    public async findById(userId: string): Promise<UserRecord | null> {
        const [user] = await this.database.select().from(users).where(eq(users.id, userId)).limit(1);
        return user ?? null;
    }

    public async findByDiscordId(discordId: string): Promise<UserRecord | null> {
        const [user] = await this.database.select().from(users).where(eq(users.discordId, discordId)).limit(1);
        return user ?? null;
    }

    public async getSpecialtyHolders(): Promise<Record<Specialty, { id: string; username: string; discordId: string } | null>> {
        const rows = await this.database
            .select({
                id: users.id,
                username: users.discordUsername,
                discordId: users.discordId,
                specialties: users.specialties
            })
            .from(users)
            .where(sql`cardinality(${users.specialties}) > 0`);

        const holders = Object.fromEntries(
            Object.values(Specialty).map((s) => [s, null as { id: string; username: string; discordId: string } | null])
        ) as Record<Specialty, { id: string; username: string; discordId: string } | null>;

        for (const row of rows) {
            for (const specialty of row.specialties) {
                if (exclusiveSpecialties.includes(specialty)) {
                    holders[specialty] = {
                        id: row.id,
                        username: row.username,
                        discordId: row.discordId
                    };
                }
            }
        }
        return holders;
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
        const transferredHolders: UserRecord[] = [];
        let isDemoted = false;
        const user = await this.database.transaction(async (transaction) => {
            const { actor: current, target } = await this.lockParticipants(transaction, actor, reference);
            if (target === null) {
                this.assertCanGrant(current, change.role);
                if (!createIfMissing || reference.kind !== "discord") {
                    throw new NotFoundError("User");
                }
                const initialRole = settleRole(change.role, false, null);
                const initialSpecialties = normalizeSpecialties(change.role, change.specialties ?? []);
                await this.enforceSpecialtyExclusivity(transaction, null, initialSpecialties, change.transfer, transferredHolders);
                const [created] = await transaction
                    .insert(users)
                    .values({
                        discordId: reference.discordId,
                        discordUsername: change.discordUsername ?? `discord_${reference.discordId}`,
                        role: initialRole,
                        specialties: initialSpecialties
                    })
                    .onConflictDoNothing({ target: users.discordId })
                    .returning();
                if (created === undefined) {
                    throw new ConflictError("The user was created concurrently. Retry the request.");
                }
                return created;
            }

            if (change.role !== target.role) {
                this.assertCanGrant(current, change.role);
                this.assertCanManage(current, target);
            } else {
                this.assertCanManageSecondary(current, target);
            }
            const role = settleRole(change.role, target.emailVerifiedAt !== null, target.role);
            if (rankOf(role) < rankOf(target.role)) {
                isDemoted = true;
            }
            const specialties = normalizeSpecialties(role, change.specialties ?? target.specialties);
            await this.enforceSpecialtyExclusivity(transaction, target.id, specialties, change.transfer, transferredHolders);
            const [updated] = await transaction
                .update(users)
                .set({
                    role,
                    specialties,
                    ...(change.discordUsername === undefined ? {} : { discordUsername: change.discordUsername })
                })
                .where(eq(users.id, target.id))
                .returning();
            return this.required(updated);
        });

        if (isDemoted && this.tokens !== undefined) {
            await this.tokens.revokeAllForUser(user.id);
        }

        for (const transferred of transferredHolders) {
            this.notifier.notify({
                type: NotificationType.UserRoleChanged,
                user: personOfUser(transferred),
                role: transferred.role,
                specialties: transferred.specialties,
                actor: personOfActor(actor)
            });
        }

        this.notifier.notify({
            type: NotificationType.UserRoleChanged,
            user: personOfUser(user),
            role: user.role,
            specialties: user.specialties,
            actor: personOfActor(actor)
        });
        return user;
    }

    public async acceptTerms(userId: string, version: string): Promise<UserRecord> {
        if (version !== (await this.legal.currentAcceptanceVersion())) {
            throw new ConflictError("The terms have changed. Reload the page and review them again.");
        }
        const [updated] = await this.database
            .update(users)
            .set({ termsVersion: version, termsAcceptedAt: new Date() })
            .where(eq(users.id, userId))
            .returning();
        return this.required(updated);
    }

    public async chooseOwnSpecialties(userId: string, chosen: readonly Specialty[]): Promise<UserRecord> {
        const user = await this.database.transaction(async (transaction) => {
            const [user] = await transaction.select().from(users).where(eq(users.id, userId)).limit(1).for("update");
            const current = this.required(user);
            const assigned = current.specialties.filter((specialty) => !selfSelectableSpecialties.includes(specialty));
            const selected = chosen.filter((specialty) => selfSelectableSpecialties.includes(specialty)).slice(0, maximumSpecialties);
            const [updated] = await transaction
                .update(users)
                .set({
                    specialties: normalizeSpecialties(current.role, [...assigned, ...selected]),
                    onboardedAt: current.onboardedAt ?? new Date()
                })
                .where(eq(users.id, userId))
                .returning();
            return this.required(updated);
        });
        this.notifier.notify({
            type: NotificationType.UserRoleChanged,
            user: personOfUser(user),
            role: user.role,
            specialties: user.specialties,
            actor: personOfUser(user)
        });
        return user;
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
        if (this.tokens !== undefined) {
            await this.tokens.revokeAllForUser(user.id);
        }
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
        if (!isGrantable(role)) {
            throw new ForbiddenError("Super admins are assigned through the environment only.");
        }
        if (!hasAtLeast(actor.role, Role.Admin) && !isHigherThan(actor.role, role)) {
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

    private assertCanManageSecondary(actor: Actor, target: UserRecord): void {
        if (hasAtLeast(actor.role, Role.Admin)) {
            return;
        }
        this.assertCanManage(actor, target);
    }

    private async enforceSpecialtyExclusivity(
        transaction: Transaction,
        targetId: string | null,
        requestedSpecialties: readonly Specialty[],
        allowTransfer: boolean | undefined,
        transferredHolders: UserRecord[]
    ): Promise<void> {
        const requestedExclusive = requestedSpecialties.filter((s) => exclusiveSpecialties.includes(s));
        if (requestedExclusive.length === 0) {
            return;
        }
        const condition =
            targetId === null
                ? sql`cardinality(${users.specialties}) > 0`
                : and(ne(users.id, targetId), sql`cardinality(${users.specialties}) > 0`);

        const candidateHolders = await transaction.select().from(users).where(condition).for("update");

        const conflicts: { holder: UserRecord; specialty: Specialty }[] = [];
        for (const candidate of candidateHolders) {
            for (const spec of requestedExclusive) {
                if (candidate.specialties.includes(spec)) {
                    conflicts.push({ holder: candidate, specialty: spec });
                }
            }
        }

        if (conflicts.length === 0) {
            return;
        }

        if (allowTransfer !== true) {
            const conflict = conflicts[0]!;
            throw new ConflictError(
                `${specialtyLabel(conflict.specialty)} is already held by @${conflict.holder.discordUsername}.`,
                ErrorCode.InvalidStatusTransition
            );
        }

        for (const { holder, specialty } of conflicts) {
            const nextSpecialties = holder.specialties.filter((s) => s !== specialty);
            const [stripped] = await transaction
                .update(users)
                .set({ specialties: nextSpecialties })
                .where(eq(users.id, holder.id))
                .returning();
            if (stripped !== undefined) {
                transferredHolders.push(stripped);
            }
        }
    }

    private required(user: UserRecord | undefined): UserRecord {
        if (user === undefined) {
            throw new NotFoundError("User");
        }
        return user;
    }
}
