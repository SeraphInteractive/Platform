import {
    ScreenplayRole,
    type AddScreenplayCollaboratorDto,
    type CreateScreenplayDto,
    type CreateScreenplayShelfDto,
    type CreateScreenplayVersionDto,
    type ScreenplayCollaboratorDto,
    type ScreenplayDto,
    type ScreenplayShelfDto,
    type ScreenplaySummaryDto,
    type ScreenplayVersionDto,
    type UpdateScreenplayDto
} from "@platform/contracts";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { BadRequestError, ErrorCode, ForbiddenError, NotFoundError } from "../../Common/Errors/ApplicationError.js";
import { toIso } from "../../Common/Http/Schemas.js";
import type { AuthenticatedUser } from "../../Common/Security/Principal.js";
import { hasAtLeast, Role } from "../../Domain/Roles.js";
import type { Database } from "../../Infrastructure/Database/Database.js";
import {
    screenplayCollaborators,
    screenplayShelves,
    screenplays,
    screenplayVersions,
    users,
    type ScreenplayRecord
} from "../../Infrastructure/Database/Schema.js";
import { ScriptEventType, type EventBus } from "../../Infrastructure/Events/EventBus.js";
import { toUserSummary } from "../Users/UserPresenter.js";

const userColumns = {
    id: users.id,
    discordId: users.discordId,
    discordUsername: users.discordUsername,
    discordAvatar: users.discordAvatar
};

export class ScriptsService {
    public constructor(
        private readonly database: Database,
        private readonly eventBus?: EventBus
    ) {}

    public async listScripts(user: AuthenticatedUser): Promise<ScreenplaySummaryDto[]> {
        const isAdmin = hasAtLeast(user.role, Role.Admin);

        // fetch collaborator memberships for current user
        const memberships = await this.database
            .select({
                screenplayId: screenplayCollaborators.screenplayId,
                role: screenplayCollaborators.role
            })
            .from(screenplayCollaborators)
            .where(eq(screenplayCollaborators.userId, user.id));

        const membershipMap = new Map(memberships.map((m) => [m.screenplayId, m.role]));
        const sharedScriptIds = [...membershipMap.keys()];

        const filter = isAdmin
            ? undefined
            : sharedScriptIds.length > 0
              ? or(eq(screenplays.ownerId, user.id), inArray(screenplays.id, sharedScriptIds))
              : eq(screenplays.ownerId, user.id);

        const rows = await this.database
            .select({
                screenplay: screenplays,
                owner: userColumns
            })
            .from(screenplays)
            .leftJoin(users, eq(users.id, screenplays.ownerId))
            .where(filter)
            .orderBy(desc(screenplays.updatedAt));

        return rows.map((row) => {
            const isOwner = row.screenplay.ownerId === user.id;
            const collabRole = membershipMap.get(row.screenplay.id);
            const userRole: "owner" | "editor" | "viewer" =
                isOwner || isAdmin ? "owner" : collabRole === ScreenplayRole.Editor ? "editor" : "viewer";

            return {
                id: row.screenplay.id,
                ownerId: row.screenplay.ownerId,
                owner: row.owner ? toUserSummary(row.owner) : undefined,
                title: row.screenplay.title,
                shelfId: row.screenplay.shelfId,
                category: row.screenplay.category,
                wordCount: row.screenplay.wordCount,
                sceneCount: row.screenplay.sceneCount,
                userRole,
                createdAt: toIso(row.screenplay.createdAt),
                updatedAt: toIso(row.screenplay.updatedAt)
            };
        });
    }

    public async getScript(id: string, user: AuthenticatedUser): Promise<ScreenplayDto> {
        const [row] = await this.database
            .select({
                screenplay: screenplays,
                owner: userColumns
            })
            .from(screenplays)
            .leftJoin(users, eq(users.id, screenplays.ownerId))
            .where(eq(screenplays.id, id))
            .limit(1);

        if (!row) {
            throw new NotFoundError("Screenplay not found.");
        }

        const { screenplay, owner } = row;
        const isAdmin = hasAtLeast(user.role, Role.Admin);
        const isOwner = screenplay.ownerId === user.id;

        let userRole: "owner" | "editor" | "viewer";
        if (isOwner || isAdmin) {
            userRole = "owner";
        } else {
            const [collab] = await this.database
                .select()
                .from(screenplayCollaborators)
                .where(and(eq(screenplayCollaborators.screenplayId, id), eq(screenplayCollaborators.userId, user.id)))
                .limit(1);

            if (!collab) {
                throw new ForbiddenError("You do not have access to this screenplay.");
            }
            userRole = collab.role === ScreenplayRole.Editor ? "editor" : "viewer";
        }

        const collaboratorRows = await this.database
            .select({
                collab: screenplayCollaborators,
                user: userColumns
            })
            .from(screenplayCollaborators)
            .leftJoin(users, eq(users.id, screenplayCollaborators.userId))
            .where(eq(screenplayCollaborators.screenplayId, id));

        const collaborators: ScreenplayCollaboratorDto[] = collaboratorRows.map((c) => ({
            id: c.collab.id,
            screenplayId: c.collab.screenplayId,
            userId: c.collab.userId,
            user: c.user ? toUserSummary(c.user) : undefined,
            role: c.collab.role,
            invitedBy: c.collab.invitedBy,
            createdAt: toIso(c.collab.createdAt)
        }));

        return {
            id: screenplay.id,
            ownerId: screenplay.ownerId,
            owner: owner ? toUserSummary(owner) : undefined,
            title: screenplay.title,
            content: screenplay.content as Record<string, unknown>,
            titlePage: (screenplay.titlePage as Record<string, unknown> | null) ?? null,
            shelfId: screenplay.shelfId,
            category: screenplay.category,
            wordCount: screenplay.wordCount,
            sceneCount: screenplay.sceneCount,
            userRole,
            collaborators,
            createdAt: toIso(screenplay.createdAt),
            updatedAt: toIso(screenplay.updatedAt)
        };
    }

    public async createScript(user: AuthenticatedUser, input: CreateScreenplayDto): Promise<ScreenplayDto> {
        if (!hasAtLeast(user.role, Role.Admin)) {
            throw new ForbiddenError("Only administrators can create new screenplays.", ErrorCode.InsufficientRole);
        }

        const defaultContent = input.content ?? {
            type: "doc",
            content: [
                {
                    type: "sceneHeading",
                    attrs: { id: "sc_1", sceneNumber: "1" },
                    content: [{ type: "text", text: "INT. SCENE - DAY" }]
                },
                {
                    type: "action",
                    content: [{ type: "text", text: "" }]
                }
            ]
        };

        const [created] = await this.database
            .insert(screenplays)
            .values({
                ownerId: user.id,
                title: input.title,
                content: defaultContent,
                titlePage: input.titlePage ?? null,
                shelfId: input.shelfId ?? null,
                category: input.category ?? null,
                wordCount: input.wordCount ?? 0,
                sceneCount: input.sceneCount ?? 0
            })
            .returning();

        if (!created) {
            throw new Error("Failed to create screenplay.");
        }

        // record initial milestone version
        await this.database.insert(screenplayVersions).values({
            screenplayId: created.id,
            userId: user.id,
            name: "Initial Draft",
            content: defaultContent,
            wordCount: input.wordCount ?? 0,
            sceneCount: input.sceneCount ?? 0
        });

        return this.getScript(created.id, user);
    }

    public async updateScript(id: string, user: AuthenticatedUser, input: UpdateScreenplayDto): Promise<ScreenplayDto> {
        await this.requireScriptWithWriteAccess(id, user);

        const updates: Partial<ScreenplayRecord> = {
            updatedAt: new Date()
        };

        if (input.title !== undefined) {
            updates.title = input.title;
        }
        if (input.content !== undefined) {
            updates.content = input.content;
        }
        if (input.titlePage !== undefined) {
            updates.titlePage = input.titlePage;
        }
        if (input.shelfId !== undefined) {
            updates.shelfId = input.shelfId;
        }
        if (input.category !== undefined) {
            updates.category = input.category;
        }
        if (input.wordCount !== undefined) {
            updates.wordCount = input.wordCount;
        }
        if (input.sceneCount !== undefined) {
            updates.sceneCount = input.sceneCount;
        }

        await this.database.update(screenplays).set(updates).where(eq(screenplays.id, id));

        const updated = await this.getScript(id, user);

        if (this.eventBus) {
            await this.eventBus.publishScript({
                type: ScriptEventType.ScriptUpdated,
                scriptId: id,
                userId: user.id,
                updatedAt: updated.updatedAt,
                title: input.title,
                content: input.content,
                titlePage: input.titlePage,
                wordCount: updated.wordCount,
                sceneCount: updated.sceneCount
            });
        }

        return updated;
    }

    public async deleteScript(id: string, user: AuthenticatedUser): Promise<void> {
        const [script] = await this.database.select().from(screenplays).where(eq(screenplays.id, id)).limit(1);

        if (!script) {
            throw new NotFoundError("Screenplay not found.");
        }

        const isOwner = script.ownerId === user.id;
        const isAdmin = hasAtLeast(user.role, Role.Admin);
        if (!isOwner && !isAdmin) {
            throw new ForbiddenError("Only the script owner or an administrator can delete this screenplay.");
        }

        await this.database.delete(screenplays).where(eq(screenplays.id, id));
    }

    public async duplicateScript(id: string, user: AuthenticatedUser): Promise<ScreenplayDto> {
        if (!hasAtLeast(user.role, Role.Admin)) {
            throw new ForbiddenError("Only administrators can duplicate screenplays.", ErrorCode.InsufficientRole);
        }

        const existing = await this.getScript(id, user);

        const [cloned] = await this.database
            .insert(screenplays)
            .values({
                ownerId: user.id,
                title: `${existing.title} (Copy)`,
                content: existing.content,
                titlePage: existing.titlePage,
                shelfId: existing.shelfId,
                category: existing.category,
                wordCount: existing.wordCount,
                sceneCount: existing.sceneCount
            })
            .returning();

        if (!cloned) {
            throw new Error("Failed to duplicate screenplay.");
        }

        await this.database.insert(screenplayVersions).values({
            screenplayId: cloned.id,
            userId: user.id,
            name: "Initial Snapshot",
            content: existing.content,
            wordCount: existing.wordCount,
            sceneCount: existing.sceneCount
        });

        return this.getScript(cloned.id, user);
    }

    public async listVersions(scriptId: string, user: AuthenticatedUser): Promise<ScreenplayVersionDto[]> {
        // verify read permission
        await this.getScript(scriptId, user);

        const rows = await this.database
            .select({
                version: screenplayVersions,
                author: userColumns
            })
            .from(screenplayVersions)
            .leftJoin(users, eq(users.id, screenplayVersions.userId))
            .where(eq(screenplayVersions.screenplayId, scriptId))
            .orderBy(desc(screenplayVersions.createdAt));

        return rows.map((row) => ({
            id: row.version.id,
            screenplayId: row.version.screenplayId,
            userId: row.version.userId,
            user: row.author ? toUserSummary(row.author) : null,
            name: row.version.name,
            content: row.version.content as Record<string, unknown>,
            wordCount: row.version.wordCount,
            sceneCount: row.version.sceneCount,
            createdAt: toIso(row.version.createdAt)
        }));
    }

    public async createVersion(
        scriptId: string,
        user: AuthenticatedUser,
        input: CreateScreenplayVersionDto
    ): Promise<ScreenplayVersionDto> {
        await this.requireScriptWithWriteAccess(scriptId, user);

        const [created] = await this.database
            .insert(screenplayVersions)
            .values({
                screenplayId: scriptId,
                userId: user.id,
                name: input.name,
                content: input.content,
                wordCount: input.wordCount ?? 0,
                sceneCount: input.sceneCount ?? 0
            })
            .returning();

        if (!created) {
            throw new Error("Failed to create screenplay version.");
        }

        const [author] = await this.database.select(userColumns).from(users).where(eq(users.id, user.id)).limit(1);

        if (this.eventBus) {
            await this.eventBus.publishScript({
                type: ScriptEventType.VersionCreated,
                scriptId: created.screenplayId,
                versionId: created.id,
                name: created.name,
                userId: user.id,
                occurredAt: toIso(created.createdAt)
            });
        }

        return {
            id: created.id,
            screenplayId: created.screenplayId,
            userId: created.userId,
            user: author ? toUserSummary(author) : null,
            name: created.name,
            content: created.content as Record<string, unknown>,
            wordCount: created.wordCount,
            sceneCount: created.sceneCount,
            createdAt: toIso(created.createdAt)
        };
    }

    public async restoreVersion(scriptId: string, versionId: string, user: AuthenticatedUser): Promise<ScreenplayDto> {
        const script = await this.requireScriptWithWriteAccess(scriptId, user);

        const [version] = await this.database
            .select()
            .from(screenplayVersions)
            .where(and(eq(screenplayVersions.id, versionId), eq(screenplayVersions.screenplayId, scriptId)))
            .limit(1);

        if (!version) {
            throw new NotFoundError("Version snapshot not found.");
        }

        // save safety backup milestone of current canvas state before restoring
        await this.database.insert(screenplayVersions).values({
            screenplayId: scriptId,
            userId: user.id,
            name: `Before restore to "${version.name}"`,
            content: script.content,
            wordCount: script.wordCount,
            sceneCount: script.sceneCount
        });

        await this.database
            .update(screenplays)
            .set({
                content: version.content,
                wordCount: version.wordCount,
                sceneCount: version.sceneCount,
                updatedAt: new Date()
            })
            .where(eq(screenplays.id, scriptId));

        const restored = await this.getScript(scriptId, user);

        if (this.eventBus) {
            await this.eventBus.publishScript({
                type: ScriptEventType.ScriptUpdated,
                scriptId,
                userId: user.id,
                updatedAt: restored.updatedAt,
                content: restored.content,
                wordCount: restored.wordCount,
                sceneCount: restored.sceneCount
            });
        }

        return restored;
    }

    public async addCollaborator(
        scriptId: string,
        user: AuthenticatedUser | "service",
        input: AddScreenplayCollaboratorDto
    ): Promise<ScreenplayCollaboratorDto> {
        let script: ScreenplayRecord;
        let invitedById: string;

        if (user === "service") {
            const [found] = await this.database.select().from(screenplays).where(eq(screenplays.id, scriptId)).limit(1);
            if (!found) {
                throw new NotFoundError("Screenplay not found.");
            }
            script = found;
            invitedById = script.ownerId;
        } else {
            script = await this.requireScriptWithOwnerAccess(scriptId, user);
            invitedById = user.id;
        }

        const [targetUser] = await this.database.select(userColumns).from(users).where(eq(users.id, input.userId)).limit(1);

        if (!targetUser) {
            throw new NotFoundError("User not found.");
        }

        if (input.userId === script.ownerId) {
            throw new BadRequestError("The script owner already has full access.");
        }

        const [existing] = await this.database
            .select()
            .from(screenplayCollaborators)
            .where(and(eq(screenplayCollaborators.screenplayId, scriptId), eq(screenplayCollaborators.userId, input.userId)))
            .limit(1);

        const role = input.role ?? ScreenplayRole.Editor;
        let recordId: string;
        let createdAt: Date;

        if (existing) {
            await this.database.update(screenplayCollaborators).set({ role }).where(eq(screenplayCollaborators.id, existing.id));
            recordId = existing.id;
            createdAt = existing.createdAt;
        } else {
            const [inserted] = await this.database
                .insert(screenplayCollaborators)
                .values({
                    screenplayId: scriptId,
                    userId: input.userId,
                    role,
                    invitedBy: invitedById
                })
                .returning();

            if (!inserted) {
                throw new Error("Failed to add collaborator.");
            }

            recordId = inserted.id;
            createdAt = inserted.createdAt;
        }

        return {
            id: recordId,
            screenplayId: scriptId,
            userId: input.userId,
            user: toUserSummary(targetUser),
            role,
            invitedBy: invitedById,
            createdAt: toIso(createdAt)
        };
    }

    public async removeCollaborator(scriptId: string, user: AuthenticatedUser | "service", targetUserId: string): Promise<void> {
        const [script] = await this.database.select().from(screenplays).where(eq(screenplays.id, scriptId)).limit(1);

        if (!script) {
            throw new NotFoundError("Screenplay not found.");
        }

        if (user !== "service") {
            const isOwnerOrAdmin = script.ownerId === user.id || hasAtLeast(user.role, Role.Admin);
            const isSelf = user.id === targetUserId;

            if (!isOwnerOrAdmin && !isSelf) {
                throw new ForbiddenError("You cannot remove collaborators from this screenplay.");
            }
        }

        await this.database
            .delete(screenplayCollaborators)
            .where(and(eq(screenplayCollaborators.screenplayId, scriptId), eq(screenplayCollaborators.userId, targetUserId)));
    }

    public async listShelves(user: AuthenticatedUser): Promise<ScreenplayShelfDto[]> {
        const rows = await this.database
            .select()
            .from(screenplayShelves)
            .where(eq(screenplayShelves.userId, user.id))
            .orderBy(screenplayShelves.name);

        return rows.map((shelf) => ({
            id: shelf.id,
            userId: shelf.userId,
            name: shelf.name,
            createdAt: toIso(shelf.createdAt)
        }));
    }

    public async createShelf(user: AuthenticatedUser, input: CreateScreenplayShelfDto): Promise<ScreenplayShelfDto> {
        const [shelf] = await this.database
            .insert(screenplayShelves)
            .values({
                userId: user.id,
                name: input.name
            })
            .returning();

        if (!shelf) {
            throw new Error("Failed to create shelf.");
        }

        return {
            id: shelf.id,
            userId: shelf.userId,
            name: shelf.name,
            createdAt: toIso(shelf.createdAt)
        };
    }

    public async deleteShelf(id: string, user: AuthenticatedUser): Promise<void> {
        const [shelf] = await this.database
            .select()
            .from(screenplayShelves)
            .where(and(eq(screenplayShelves.id, id), eq(screenplayShelves.userId, user.id)))
            .limit(1);

        if (!shelf) {
            throw new NotFoundError("Shelf not found.");
        }

        await this.database.delete(screenplayShelves).where(eq(screenplayShelves.id, id));
    }

    private async requireScriptWithWriteAccess(id: string, user: AuthenticatedUser): Promise<ScreenplayRecord> {
        const [script] = await this.database.select().from(screenplays).where(eq(screenplays.id, id)).limit(1);

        if (!script) {
            throw new NotFoundError("Screenplay not found.");
        }

        const isOwner = script.ownerId === user.id;
        const isAdmin = hasAtLeast(user.role, Role.Admin);
        if (isOwner || isAdmin) {
            return script;
        }

        const [collab] = await this.database
            .select()
            .from(screenplayCollaborators)
            .where(and(eq(screenplayCollaborators.screenplayId, id), eq(screenplayCollaborators.userId, user.id)))
            .limit(1);

        if (!collab || collab.role !== ScreenplayRole.Editor) {
            throw new ForbiddenError("You do not have write access to this screenplay.");
        }

        return script;
    }

    private async requireScriptWithOwnerAccess(id: string, user: AuthenticatedUser): Promise<ScreenplayRecord> {
        const [script] = await this.database.select().from(screenplays).where(eq(screenplays.id, id)).limit(1);

        if (!script) {
            throw new NotFoundError("Screenplay not found.");
        }

        const isOwner = script.ownerId === user.id;
        const isAdmin = hasAtLeast(user.role, Role.Admin);
        if (!isOwner && !isAdmin) {
            throw new ForbiddenError("Only the script owner or an administrator can manage collaborators.");
        }

        return script;
    }
}
