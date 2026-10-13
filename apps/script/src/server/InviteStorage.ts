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
    scriptId?: string | null;
    scriptTitle?: string | null;
}

const STORAGE_DIR = process.env.DATA_DIRECTORY || path.resolve(process.cwd(), "data");
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

export function getInvites(scriptId?: string | null): StudioInvite[] {
    try {
        ensureStorage();
        if (fs.existsSync(STORAGE_FILE)) {
            const raw = fs.readFileSync(STORAGE_FILE, "utf-8");
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) {
                memoryInvites = parsed;
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
    // upsert by user matching on the specific script
    const filtered = existing.filter((item) => {
        const matchesUser = item.targetId === invite.targetId || item.discordId === invite.discordId;
        const matchesScript = (item.scriptId || null) === (invite.scriptId || null);
        return !(matchesUser && matchesScript);
    });
    const updated = [invite, ...filtered];
    memoryInvites = updated;

    try {
        ensureStorage();
        fs.writeFileSync(STORAGE_FILE, JSON.stringify(updated, null, 2), "utf-8");
    } catch {}
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

export function isUserInvited(userId?: string | null, discordId?: string | null, scriptId?: string | null): boolean {
    if (!userId && !discordId) return false;
    const invites = getInvites();
    return invites.some((invite) => {
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

export function getUserInvitedScriptIds(userId?: string | null, discordId?: string | null): string[] {
    if (!userId && !discordId) return [];
    const invites = getInvites();
    const scriptIds = new Set<string>();

    for (const invite of invites) {
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
