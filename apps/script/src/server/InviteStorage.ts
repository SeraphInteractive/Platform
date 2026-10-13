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

export function getInvites(): StudioInvite[] {
    try {
        ensureStorage();
        const raw = fs.readFileSync(STORAGE_FILE, "utf-8");
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export function saveInvite(invite: StudioInvite): void {
    ensureStorage();
    const existing = getInvites();
    // upsert by targetId or discordId to prevent duplicates
    const filtered = existing.filter((item) => item.targetId !== invite.targetId && item.discordId !== invite.discordId);
    const updated = [invite, ...filtered];
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(updated, null, 2), "utf-8");
}

export function removeInvite(idOrTargetId: string): boolean {
    ensureStorage();
    const existing = getInvites();
    const filtered = existing.filter(
        (item) => item.id !== idOrTargetId && item.targetId !== idOrTargetId && item.discordId !== idOrTargetId
    );
    const changed = filtered.length !== existing.length;
    if (changed) {
        fs.writeFileSync(STORAGE_FILE, JSON.stringify(filtered, null, 2), "utf-8");
    }
    return changed;
}

export function isUserInvited(userId?: string | null, discordId?: string | null): boolean {
    if (!userId && !discordId) return false;
    const invites = getInvites();
    return invites.some((invite) => {
        if (userId && (invite.targetId === userId || invite.id === userId)) return true;
        if (discordId && (invite.discordId === discordId || invite.targetId === discordId)) return true;
        return false;
    });
}
