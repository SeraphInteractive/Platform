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

const STORAGE_DIR = path.resolve(process.cwd(), "data");
const STORAGE_FILE = path.join(STORAGE_DIR, "studio_invites.json");

function ensureStorage(): void {
    // ensure local data directory exists for persistent storage
    if (!fs.existsSync(STORAGE_DIR)) {
        fs.mkdirSync(STORAGE_DIR, { recursive: true });
    }
    if (!fs.existsSync(STORAGE_FILE)) {
        fs.writeFileSync(STORAGE_FILE, JSON.stringify([], null, 2), "utf-8");
    }
}

export function getInvites(scriptId?: string | null): StudioInvite[] {
    try {
        ensureStorage();
        const raw = fs.readFileSync(STORAGE_FILE, "utf-8");
        const parsed = JSON.parse(raw);
        const list: StudioInvite[] = Array.isArray(parsed) ? parsed : [];
        if (scriptId) {
            return list.filter((item) => !item.scriptId || item.scriptId === scriptId);
        }
        return list;
    } catch {
        return [];
    }
}

export function saveInvite(invite: StudioInvite): void {
    ensureStorage();
    const existing = getInvites();
    // upsert by user matching on the specific script
    const filtered = existing.filter((item) => {
        const matchesUser = item.targetId === invite.targetId || item.discordId === invite.discordId;
        const matchesScript = (item.scriptId || null) === (invite.scriptId || null);
        return !(matchesUser && matchesScript);
    });
    const updated = [invite, ...filtered];
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(updated, null, 2), "utf-8");
}

export function removeInvite(idOrTargetId: string, scriptId?: string | null): boolean {
    ensureStorage();
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
        fs.writeFileSync(STORAGE_FILE, JSON.stringify(filtered, null, 2), "utf-8");
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
