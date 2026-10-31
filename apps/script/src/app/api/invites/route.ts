import { type NextRequest, NextResponse } from "next/server";
import { readSessionToken } from "@/server/Session";
import { getInvites, saveInvite, removeInvite, acceptInvite, type StudioInvite } from "@/server/InviteStorage";
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
    try {
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
        const serviceToken = process.env.SERVICE_TOKEN;

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
            let discordAvatarHash: string | null = null;
            if (resolvedUsername === cleanTarget || !resolvedPlatformId) {
                const discordUser = await fetchDiscordUser(cleanTarget);
                if (discordUser) {
                    resolvedUsername = discordUser.globalName || discordUser.username;
                    if (discordUser.avatar) {
                        resolvedAvatarUrl = `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`;
                        if (/^(?:a_)?[a-f0-9]{32}$/u.test(discordUser.avatar)) {
                            discordAvatarHash = discordUser.avatar;
                        }
                    }
                }
            }

            // provision minimal platform user if not yet registered
            if (!resolvedPlatformId && serviceToken) {
                try {
                    const provRes = await fetch(`${apiUrl}/api/v1/users/by-discord/${cleanTarget}/profile`, {
                        method: "PUT",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${serviceToken}`
                        },
                        body: JSON.stringify({
                            username: resolvedUsername.trim().slice(0, 64) || `user_${cleanTarget.slice(-4)}`,
                            avatar: discordAvatarHash
                        })
                    });
                    if (provRes.ok) {
                        const provData = await provRes.json().catch(() => null);
                        const u = provData?.data ?? provData;
                        if (u?.id) resolvedPlatformId = u.id;
                    }
                } catch {}
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
                        return u.id === cleanTarget || u.discordId === cleanTarget || uname === targetLower;
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

        // sync collaborator to postgresql if script and user uuid are resolved
        if (scriptId && resolvedPlatformId) {
            try {
                const authHeader = token ? `Bearer ${token}` : serviceToken ? `Bearer ${serviceToken}` : undefined;
                if (authHeader) {
                    await fetch(`${apiUrl}/api/v1/scripts/${encodeURIComponent(scriptId)}/collaborators`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: authHeader
                        },
                        body: JSON.stringify({
                            userId: resolvedPlatformId,
                            role
                        })
                    });
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
            dmError = "no Discord ID linked";
        }

        const invite: StudioInvite = {
            id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            targetId: resolvedPlatformId || cleanTarget,
            discordId: resolvedDiscordId || cleanTarget,
            username: resolvedUsername,
            avatarUrl: resolvedAvatarUrl,
            invitedBy: caller.username,
            invitedAt: new Date().toISOString(),
            status: "pending",
            role,
            scriptId: scriptId || null,
            scriptTitle: scriptTitle || null
        };

        saveInvite(invite);

        return NextResponse.json({
            data: invite,
            dmSent,
            dmError,
            scriptUrl: targetScriptUrl
        });
    } catch (err: any) {
        return NextResponse.json({ error: err?.message || "Failed to invite user." }, { status: 500 });
    }
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

    const allInvites = getInvites();
    const targetInvite = allInvites.find((i) => i.id === id || i.targetId === id);

    const removed = removeInvite(id);

    // remove collaborator from backend database if script and target are known
    if (targetInvite?.scriptId && targetInvite.targetId) {
        const apiUrl = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "https://dev-api.projectstairway.net";
        const token = readSessionToken(request);
        const serviceToken = process.env.SERVICE_TOKEN;
        const authHeader = token ? `Bearer ${token}` : serviceToken ? `Bearer ${serviceToken}` : undefined;
        if (authHeader && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetInvite.targetId)) {
            try {
                await fetch(
                    `${apiUrl}/api/v1/scripts/${encodeURIComponent(targetInvite.scriptId)}/collaborators/${encodeURIComponent(targetInvite.targetId)}`,
                    {
                        method: "DELETE",
                        headers: { Authorization: authHeader }
                    }
                );
            } catch {}
        }
    }

    return NextResponse.json({ success: removed });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
    const caller = await getCallerUser(request);
    if (!caller) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const inviteId = typeof body?.inviteId === "string" ? body.inviteId : "";
    const action = body?.action === "decline" ? "decline" : "accept";

    if (!inviteId) {
        return NextResponse.json({ error: "Missing invite ID." }, { status: 400 });
    }

    const allInvites = getInvites();
    const targetInvite = allInvites.find((i) => i.id === inviteId);
    const apiUrl = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "https://dev-api.projectstairway.net";
    const token = readSessionToken(request);
    const serviceToken = process.env.SERVICE_TOKEN;

    if (action === "decline") {
        const removed = removeInvite(inviteId);
        if (targetInvite?.scriptId && caller.id) {
            try {
                await fetch(
                    `${apiUrl}/api/v1/scripts/${encodeURIComponent(targetInvite.scriptId)}/collaborators/${encodeURIComponent(caller.id)}`,
                    {
                        method: "DELETE",
                        headers: { Authorization: `Bearer ${token}` }
                    }
                );
            } catch {}
        }
        return NextResponse.json({ success: removed, action: "decline" });
    }

    const accepted = acceptInvite(inviteId, caller.id, caller.discordId);
    if (!accepted) {
        return NextResponse.json({ error: "Invite not found or not addressed to caller." }, { status: 404 });
    }

    // ensure collaborator row exists in postgresql when accepted
    if (accepted.scriptId && caller.id) {
        try {
            const authHeader = serviceToken ? `Bearer ${serviceToken}` : token ? `Bearer ${token}` : undefined;
            if (authHeader) {
                await fetch(`${apiUrl}/api/v1/scripts/${encodeURIComponent(accepted.scriptId)}/collaborators`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: authHeader
                    },
                    body: JSON.stringify({
                        userId: caller.id,
                        role: accepted.role
                    })
                });
            }
        } catch {}
    }

    return NextResponse.json({ data: accepted, action: "accept" });
}
