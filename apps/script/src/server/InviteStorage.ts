import "server-only";
import fs from "node:fs";
import path from "node:path";

export interface StudioInvite {
    id: string;
    targetId: string;
    discordId: string;
    username: string;
    avatarUrl?: string | null;
    invitedBy: string;
    invitedAt: string;
    role: "editor" | "viewer";
    status: "pending" | "accepted";
    acceptedAt?: string | null;
    scriptId?: string | null;
    scriptTitle?: string | null;
}

const defaultDir = fs.existsSync("/app/data") ? "/app/data" : path.resolve(process.cwd(), "data");
const STORAGE_DIR = process.env.DATA_DIRECTORY || defaultDir;
const STORAGE_FILE = path.join(STORAGE_DIR, "studio_invites.json");

// in-memory fallback cache so storage operations never throw or crash
let memoryInvites: StudioInvite[] = [];

function ensureStorage(): void {
    try {
        if (!fs.existsSync(STORAGE_DIR)) {
            fs.mkdirSync(STORAGE_DIR, { recursive: true });
        }
        if (!fs.existsSync(STORAGE_FILE)) {
            fs.writeFileSync(STORAGE_FILE, JSON.stringify([], null, 2), "utf-8");
        }
    } catch {}
}

function normalizeInvite(item: any): StudioInvite {
    return {
        ...item,
        status: item.status === "accepted" ? "accepted" : "pending"
    };
}

export function getInvites(scriptId?: string | null): StudioInvite[] {
    try {
        ensureStorage();
        if (fs.existsSync(STORAGE_FILE)) {
            const raw = fs.readFileSync(STORAGE_FILE, "utf-8");
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) {
                memoryInvites = parsed.map(normalizeInvite);
            }
        }
    } catch {}

    if (scriptId) {
        return memoryInvites.filter((item) => !item.scriptId || item.scriptId === scriptId);
    }
    return memoryInvites;
}

export function saveInvite(invite: StudioInvite): void {
    const existing = getInvites();
    const normalized = normalizeInvite(invite);
    // upsert by user matching on the specific script
    const filtered = existing.filter((item) => {
        const matchesUser = item.targetId === normalized.targetId || item.discordId === normalized.discordId;
        const matchesScript = (item.scriptId || null) === (normalized.scriptId || null);
        return !(matchesUser && matchesScript);
    });
    const updated = [normalized, ...filtered];
    memoryInvites = updated;

    try {
        ensureStorage();
        fs.writeFileSync(STORAGE_FILE, JSON.stringify(updated, null, 2), "utf-8");
    } catch {}
}

export function acceptInvite(inviteId: string, userId?: string | null, discordId?: string | null): StudioInvite | null {
    const existing = getInvites();
    let updatedInvite: StudioInvite | null = null;
    const updated = existing.map((item) => {
        if (item.id !== inviteId) return item;
        const matchesUser =
            !userId && !discordId
                ? true
                : (userId && (item.targetId === userId || item.id === userId)) ||
                  (discordId && (item.discordId === discordId || item.targetId === discordId));
        if (matchesUser) {
            updatedInvite = {
                ...item,
                targetId: userId || item.targetId,
                status: "accepted",
                acceptedAt: new Date().toISOString()
            };
            return updatedInvite;
        }
        return item;
    });

    if (updatedInvite) {
        memoryInvites = updated;
        try {
            ensureStorage();
            fs.writeFileSync(STORAGE_FILE, JSON.stringify(updated, null, 2), "utf-8");
        } catch {}
    }
    return updatedInvite;
}

export function removeInvite(idOrTargetId: string, scriptId?: string | null): boolean {
    const existing = getInvites();
    const filtered = existing.filter((item) => {
        const isTarget = item.id === idOrTargetId || item.targetId === idOrTargetId || item.discordId === idOrTargetId;
        if (!isTarget) return true;
        if (scriptId) {
            return item.scriptId !== scriptId;
        }
        return false;
    });
    const changed = filtered.length !== existing.length;
    if (changed) {
        memoryInvites = filtered;
        try {
            ensureStorage();
            fs.writeFileSync(STORAGE_FILE, JSON.stringify(filtered, null, 2), "utf-8");
        } catch {}
    }
    return changed;
}

export function getPendingInvitesForUser(userId?: string | null, discordId?: string | null, scriptId?: string | null): StudioInvite[] {
    if (!userId && !discordId) return [];
    const invites = getInvites();
    return invites.filter((invite) => {
        if (invite.status !== "pending") return false;
        const userMatches =
            (userId && (invite.targetId === userId || invite.id === userId)) ||
            (discordId && (invite.discordId === discordId || invite.targetId === discordId));
        if (!userMatches) return false;
        if (scriptId) {
            return !invite.scriptId || invite.scriptId === scriptId;
        }
        return true;
    });
}

export function isUserInvited(userId?: string | null, discordId?: string | null, scriptId?: string | null, onlyAccepted = true): boolean {
    if (!userId && !discordId) return false;
    const invites = getInvites();
    return invites.some((invite) => {
        if (onlyAccepted && invite.status !== "accepted") return false;
        const userMatches =
            (userId && (invite.targetId === userId || invite.id === userId)) ||
            (discordId && (invite.discordId === discordId || invite.targetId === discordId));
        if (!userMatches) return false;

        // check script-level permission if specific script requested
        if (scriptId) {
            return !invite.scriptId || invite.scriptId === scriptId;
        }
        return true;
    });
}

export function getUserInvitedScriptIds(userId?: string | null, discordId?: string | null, onlyAccepted = true): string[] {
    if (!userId && !discordId) return [];
    const invites = getInvites();
    const scriptIds = new Set<string>();

    for (const invite of invites) {
        if (onlyAccepted && invite.status !== "accepted") continue;
        const userMatches =
            (userId && (invite.targetId === userId || invite.id === userId)) ||
            (discordId && (invite.discordId === discordId || invite.targetId === discordId));
        if (userMatches) {
            if (invite.scriptId) {
                scriptIds.add(invite.scriptId);
            } else {
                scriptIds.add("*");
            }
        }
    }
    return Array.from(scriptIds);
}

export function getUserInviteRole(userId?: string | null, discordId?: string | null, scriptId?: string | null): "editor" | "viewer" | null {
    if (!userId && !discordId) return null;
    const invites = getInvites();
    for (const invite of invites) {
        if (invite.status !== "accepted") continue;
        const userMatches =
            (userId && (invite.targetId === userId || invite.id === userId)) ||
            (discordId && (invite.discordId === discordId || invite.targetId === discordId));
        if (userMatches) {
            if (!scriptId || !invite.scriptId || invite.scriptId === scriptId) {
                return invite.role;
            }
        }
    }
    return null;
}

export function getAcceptedInvitesForUser(userId?: string | null, discordId?: string | null): StudioInvite[] {
    if (!userId && !discordId) return [];
    const invites = getInvites();
    return invites.filter((invite) => {
        if (invite.status !== "accepted") return false;
        const userMatches =
            (userId && (invite.targetId === userId || invite.id === userId)) ||
            (discordId && (invite.discordId === discordId || invite.targetId === discordId));
        return userMatches;
    });
}
