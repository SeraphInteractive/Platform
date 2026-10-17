import { type NextRequest, NextResponse } from "next/server";
import { readSessionToken } from "@/server/Session";
import { isUserInvited } from "@/server/InviteStorage";

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

export interface PlatformRegisteredUser {
    id: string;
    username: string;
    discordId: string;
    avatarUrl: string | null;
    role: string;
    specialties?: string[];
    isInvited: boolean;
    isAdmin: boolean;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
    const caller = await getCallerUser(request);
    if (!caller || !isCallerAdmin(caller)) {
        return NextResponse.json({ error: "Access denied. Admin required." }, { status: 403 });
    }

    const scriptId = request.nextUrl.searchParams.get("scriptId") || null;
    const token = readSessionToken(request);
    const apiUrl = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "https://dev-api.projectstairway.net";

    try {
        const res = await fetch(`${apiUrl}/api/v1/users?perPage=100`, {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined
        });

        if (!res.ok) {
            return NextResponse.json({ data: [] }, { status: 200 });
        }

        const body = await res.json().catch(() => null);
        const rawUsers: any[] = body?.data ?? [];

        const users: PlatformRegisteredUser[] = rawUsers.map((u) => {
            const isAdmin = u.role === "super_admin" || u.role === "admin";
            const invited = isUserInvited(u.id, u.discordId, scriptId);

            return {
                id: u.id,
                username: u.username || u.discordUsername || "User",
                discordId: u.discordId,
                avatarUrl: u.avatarUrl || null,
                role: u.role || "member",
                specialties: u.specialties || [],
                isInvited: invited,
                isAdmin
            };
        });

        return NextResponse.json({ data: users }, { headers: { "Cache-Control": "no-store" } });
    } catch {
        return NextResponse.json({ data: [] }, { status: 200 });
    }
}
