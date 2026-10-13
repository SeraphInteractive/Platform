import { type NextRequest, NextResponse } from "next/server";
import { readSessionToken } from "@/server/Session";
import { getInvites, saveInvite, removeInvite, type StudioInvite } from "@/server/InviteStorage";
import { sendDiscordDm, fetchDiscordUser } from "@/server/DiscordBot";

export const dynamic = "force-dynamic";

async function getCallerUser(request: NextRequest): Promise<{ id: string; username: string; discordId?: string; role: string } | null> {
    const token = readSessionToken(request);
    if (!token) return null;

    const apiUrl = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "https://dev-api.projectstairway.net";
    try {
        const res = await fetch(`${apiUrl}/api/v1/auth/me`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) return null;
        const body = await res.json().catch(() => null);
        return body?.data ?? body;
    } catch {
        return null;
    }
}

function isCallerAdmin(caller: { id: string; discordId?: string; role: string } | null): boolean {
    if (!caller) return false;
    return caller.role === "super_admin" || caller.role === "admin";
}

export async function GET(request: NextRequest): Promise<NextResponse> {
    const caller = await getCallerUser(request);
    if (!caller || !isCallerAdmin(caller)) {
        return NextResponse.json({ error: "Access denied. Admin required." }, { status: 403 });
    }

    const invites = getInvites();
    return NextResponse.json({ data: invites }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
    const caller = await getCallerUser(request);
    if (!caller || !isCallerAdmin(caller)) {
        return NextResponse.json({ error: "Access denied. Admin required." }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const targetId = typeof body?.targetId === "string" ? body.targetId.trim() : "";
    const role = body?.role === "viewer" ? "viewer" : "editor";

    if (!targetId) {
        return NextResponse.json({ error: "Missing target user ID or Discord ID." }, { status: 400 });
    }

    const apiUrl = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "https://dev-api.projectstairway.net";
    const token = readSessionToken(request);

    let resolvedDiscordId = "";
    let resolvedUsername = targetId;
    let resolvedAvatarUrl: string | null = null;

    const isDiscordSnowflake = /^\d{17,20}$/.test(targetId);

    if (isDiscordSnowflake) {
        resolvedDiscordId = targetId;
        // try to resolve profile via platform api first
        try {
            const res = await fetch(`${apiUrl}/api/v1/users/by-discord/${targetId}`, {
                headers: token ? { Authorization: `Bearer ${token}` } : undefined
            });
            if (res.ok) {
                const data = await res.json().catch(() => null);
                const u = data?.data ?? data;
                if (u?.username) resolvedUsername = u.username;
                if (u?.avatarUrl) resolvedAvatarUrl = u.avatarUrl;
            }
        } catch {}

        // fallback to direct discord lookup via bot if platform api had no user record yet
        if (resolvedUsername === targetId) {
            const discordUser = await fetchDiscordUser(targetId);
            if (discordUser) {
                resolvedUsername = discordUser.globalName || discordUser.username;
                if (discordUser.avatar) {
                    resolvedAvatarUrl = `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`;
                }
            }
        }
    } else {
        // lookup by platform uuid
        try {
            const res = await fetch(`${apiUrl}/api/v1/users/${targetId}`, {
                headers: token ? { Authorization: `Bearer ${token}` } : undefined
            });
            if (res.ok) {
                const data = await res.json().catch(() => null);
                const u = data?.data ?? data;
                if (u?.discordId) resolvedDiscordId = u.discordId;
                if (u?.username) resolvedUsername = u.username;
                if (u?.avatarUrl) resolvedAvatarUrl = u.avatarUrl;
            }
        } catch {}
    }

    if (!resolvedDiscordId && isDiscordSnowflake) {
        resolvedDiscordId = targetId;
    }

    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "localhost:3002";
    const proto = request.headers.get("x-forwarded-proto") ?? "http";
    const appOrigin = `${proto}://${host}`;

    // deliver dm through discord bot without excess texts or emojis
    let dmSent = false;
    let dmError: string | undefined;

    if (resolvedDiscordId) {
        const callerName = caller.username || "an Administrator";
        const dmMessage = [
            `You have been granted access to Project Stairway Studio by ${callerName}.`,
            `Access URL: ${appOrigin}/studio/script`,
            `Role: ${role === "editor" ? "Screenplay Editor" : "Screenplay Viewer"}`
        ].join("\n");

        const dmRes = await sendDiscordDm(resolvedDiscordId, dmMessage);
        dmSent = dmRes.ok;
        dmError = dmRes.error;
    } else {
        dmError = "Could not resolve a Discord ID for the user to deliver DM.";
    }

    const invite: StudioInvite = {
        id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        targetId,
        discordId: resolvedDiscordId || targetId,
        username: resolvedUsername,
        avatarUrl: resolvedAvatarUrl,
        invitedBy: caller.username,
        invitedAt: new Date().toISOString(),
        role
    };

    saveInvite(invite);

    return NextResponse.json({
        data: invite,
        dmSent,
        dmError
    });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
    const caller = await getCallerUser(request);
    if (!caller || !isCallerAdmin(caller)) {
        return NextResponse.json({ error: "Access denied. Admin required." }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const id = typeof body?.id === "string" ? body.id : "";
    if (!id) {
        return NextResponse.json({ error: "Missing invite ID." }, { status: 400 });
    }

    const removed = removeInvite(id);
    return NextResponse.json({ success: removed });
}
