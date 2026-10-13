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

    const scriptId = request.nextUrl.searchParams.get("scriptId") || null;
    const invites = getInvites(scriptId);
    return NextResponse.json({ data: invites }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
    const caller = await getCallerUser(request);
    if (!caller || !isCallerAdmin(caller)) {
        return NextResponse.json({ error: "Access denied. Admin required." }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const rawTargetId = typeof body?.targetId === "string" ? body.targetId.trim() : "";
    const cleanTarget = rawTargetId.replace(/^@/, "");
    const role = body?.role === "viewer" ? "viewer" : "editor";
    const scriptId = typeof body?.scriptId === "string" ? body.scriptId.trim() : null;
    const scriptTitle = typeof body?.scriptTitle === "string" ? body.scriptTitle.trim() : null;

    if (!cleanTarget) {
        return NextResponse.json({ error: "Missing target user ID, username, or Discord ID." }, { status: 400 });
    }

    const apiUrl = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "https://dev-api.projectstairway.net";
    const token = readSessionToken(request);

    let resolvedDiscordId = "";
    let resolvedUsername = cleanTarget;
    let resolvedAvatarUrl: string | null = null;
    let resolvedPlatformId = "";

    const isDiscordSnowflake = /^\d{17,20}$/.test(cleanTarget);

    if (isDiscordSnowflake) {
        resolvedDiscordId = cleanTarget;
        // query platform api by discord id
        try {
            const res = await fetch(`${apiUrl}/api/v1/users/by-discord/${cleanTarget}`, {
                headers: token ? { Authorization: `Bearer ${token}` } : undefined
            });
            if (res.ok) {
                const data = await res.json().catch(() => null);
                const u = data?.data ?? data;
                if (u?.id) resolvedPlatformId = u.id;
                if (u?.username) resolvedUsername = u.username;
                if (u?.avatarUrl) resolvedAvatarUrl = u.avatarUrl;
            }
        } catch {}

        // fallback to direct discord bot api if not registered on platform
        if (resolvedUsername === cleanTarget) {
            const discordUser = await fetchDiscordUser(cleanTarget);
            if (discordUser) {
                resolvedUsername = discordUser.globalName || discordUser.username;
                if (discordUser.avatar) {
                    resolvedAvatarUrl = `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`;
                }
            }
        }
    }

    // if not resolved yet, match against registered users list on platform
    if (!resolvedPlatformId || !resolvedDiscordId) {
        try {
            const res = await fetch(`${apiUrl}/api/v1/users?perPage=100`, {
                headers: token ? { Authorization: `Bearer ${token}` } : undefined
            });
            if (res.ok) {
                const data = await res.json().catch(() => null);
                const list: any[] = data?.data ?? [];
                const matched = list.find((u) => {
                    const uname = (u.username || u.discordUsername || "").toLowerCase();
                    const targetLower = cleanTarget.toLowerCase();
                    return (
                        u.id === cleanTarget ||
                        u.discordId === cleanTarget ||
                        uname === targetLower
                    );
                });

                if (matched) {
                    resolvedPlatformId = matched.id;
                    resolvedDiscordId = matched.discordId || resolvedDiscordId;
                    resolvedUsername = matched.username || matched.discordUsername || resolvedUsername;
                    resolvedAvatarUrl = matched.avatarUrl || resolvedAvatarUrl;
                }
            }
        } catch {}
    }

    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "localhost:3002";
    const proto = request.headers.get("x-forwarded-proto") ?? "http";
    const webAppUrl = process.env.WEB_APP_URL || process.env.NEXT_PUBLIC_APP_URL;
    const baseUrl = webAppUrl || `${proto}://${host}`;
    const targetScriptUrl = scriptId
        ? `${baseUrl.replace(/\/$/, "")}/studio/script/editor?id=${encodeURIComponent(scriptId)}`
        : `${baseUrl.replace(/\/$/, "")}/studio/script`;

    // deliver dm through discord bot without excess texts or emojis
    let dmSent = false;
    let dmError: string | undefined;

    if (resolvedDiscordId) {
        const callerName = caller.username || "an Administrator";
        const scriptName = scriptTitle ? `the screenplay "${scriptTitle}"` : "Screenplay Studio";
        const dmMessage = [
            `Project Stairway Studio Access:`,
            `You have been granted access to ${scriptName} by ${callerName}.`,
            `Role: ${role === "editor" ? "Screenplay Editor" : "Screenplay Viewer"}`,
            `Direct URL: ${targetScriptUrl}`
        ].join("\n");

        const dmRes = await sendDiscordDm(resolvedDiscordId, dmMessage);
        dmSent = dmRes.ok;
        dmError = dmRes.error;
    } else {
        dmError = "Could not resolve a Discord ID for the user to deliver DM.";
    }

    const invite: StudioInvite = {
        id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        targetId: resolvedPlatformId || cleanTarget,
        discordId: resolvedDiscordId || cleanTarget,
        username: resolvedUsername,
        avatarUrl: resolvedAvatarUrl,
        invitedBy: caller.username,
        invitedAt: new Date().toISOString(),
        role,
        scriptId: scriptId || null,
        scriptTitle: scriptTitle || null
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
