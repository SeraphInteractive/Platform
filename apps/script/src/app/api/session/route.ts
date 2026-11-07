import { type NextRequest, NextResponse } from "next/server";
import { readSessionToken, setSessionCookie, clearSessionCookie, readVerifier, clearVerifierCookie } from "@/server/Session";
import { isUserInvited, getUserInvitedScriptIds, getPendingInvitesForUser, getAcceptedInvitesForUser } from "@/server/InviteStorage";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
    const token = readSessionToken(request);
    if (!token) {
        return NextResponse.json({ data: null }, { headers: { "Cache-Control": "no-store" } });
    }

    const apiUrl = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "https://dev-api.projectstairway.net";

    try {
        const upstream = await fetch(`${apiUrl}/api/v1/auth/me`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (upstream.status === 401 || upstream.status === 404) {
            const res = NextResponse.json({ data: null }, { headers: { "Cache-Control": "no-store" } });
            clearSessionCookie(res);
            res.cookies.set("mcs_auth_token", "", { path: "/", maxAge: 0 });
            res.cookies.set("platform_session", "", { path: "/", maxAge: 0 });
            return res;
        }

        const payload = await upstream.json().catch(() => null);
        const user = payload?.data ?? payload;
        if (user) {
            // fetch collaborated scripts from backend api for database-persisted access
            let backendCollabScriptIds: string[] = [];
            try {
                const scriptsRes = await fetch(`${apiUrl}/api/v1/scripts`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (scriptsRes.ok) {
                    const scriptsBody = await scriptsRes.json().catch(() => null);
                    const serverScripts = scriptsBody?.data ?? [];
                    if (Array.isArray(serverScripts)) {
                        backendCollabScriptIds = serverScripts.map((s: any) => s.id);
                    }
                }
            } catch {}

            const localInvited = isUserInvited(user.id, user.discordId, null, true);
            const localScriptIds = getUserInvitedScriptIds(user.id, user.discordId, true);
            const pendingInvites = getPendingInvitesForUser(user.id, user.discordId);
            const acceptedInvites = getAcceptedInvitesForUser(user.id, user.discordId);

            const mergedScriptIds = Array.from(new Set([...localScriptIds, ...backendCollabScriptIds]));
            const isInvited = localInvited || backendCollabScriptIds.length > 0;

            return NextResponse.json(
                {
                    data: {
                        ...user,
                        isInvited,
                        invitedScriptIds: mergedScriptIds,
                        pendingInvites,
                        acceptedInvites
                    }
                },
                { headers: { "Cache-Control": "no-store" } }
            );
        }
        return NextResponse.json({ data: null }, { headers: { "Cache-Control": "no-store" } });
    } catch {
        return NextResponse.json({ data: null }, { status: 502 });
    }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
    const verifier = readVerifier(request);
    if (!verifier) {
        return NextResponse.json({ error: "Login session expired. Try again." }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const code = body?.code;
    if (!code || typeof code !== "string") {
        return NextResponse.json({ error: "Missing authorization code." }, { status: 400 });
    }

    const apiUrl = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "https://dev-api.projectstairway.net";

    try {
        const upstream = await fetch(`${apiUrl}/api/v1/auth/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code, codeVerifier: verifier })
        });

        const payload = await upstream.json().catch(() => null);
        const session = payload?.data ?? payload;

        if (!upstream.ok || !session?.token) {
            const res = NextResponse.json({ error: "Discord authentication failed." }, { status: 401 });
            clearVerifierCookie(res);
            return res;
        }

        const res = NextResponse.json({ data: session.user }, { headers: { "Cache-Control": "no-store" } });
        setSessionCookie(res, session.token, new Date(session.expiresAt || Date.now() + 86400000 * 7));
        clearVerifierCookie(res);
        return res;
    } catch {
        const res = NextResponse.json({ error: "Authentication service unreachable." }, { status: 502 });
        clearVerifierCookie(res);
        return res;
    }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
    const token = readSessionToken(request);
    const apiUrl = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "https://dev-api.projectstairway.net";

    if (token) {
        await fetch(`${apiUrl}/api/v1/auth/session`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` }
        }).catch(() => undefined);
    }

    const res = new NextResponse(null, { status: 204 });
    clearSessionCookie(res);
    return res;
}
