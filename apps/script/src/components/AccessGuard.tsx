"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { StairwayLoader } from "./StairwayLoader";
import { AcceptInviteModal, type PendingInvite } from "./AcceptInviteModal";

export interface ScriptUserProfile {
    id: string;
    discordId?: string | null;
    username: string;
    globalName?: string | null;
    avatarUrl?: string | null;
    role: string;
    specialties?: string[];
    isInvited?: boolean;
    invitedScriptIds?: string[];
    pendingInvites?: {
        id: string;
        scriptId?: string | null;
        scriptTitle?: string | null;
        invitedBy: string;
        role: "editor" | "viewer";
    }[];
    acceptedInvites?: {
        id: string;
        scriptId?: string | null;
        scriptTitle?: string | null;
        invitedBy: string;
        role: "editor" | "viewer";
    }[];
}

export function checkUserAuthorized(data: ScriptUserProfile): boolean {
    const isSuperadmin = data.role === "super_admin";
    const isAdmin = data.role === "admin";
    const isInvited = Boolean(data.isInvited);
    const hasPending = Array.isArray(data.pendingInvites) && data.pendingInvites.length > 0;

    return Boolean(isSuperadmin || isAdmin || isInvited || hasPending);
}

export function canAccessScript(user: ScriptUserProfile | null, scriptId: string): boolean {
    if (!user) return false;
    // administrators retain access to all screenplays automatically
    if (user.role === "super_admin" || user.role === "admin") return true;
    if (!user.isInvited) return false;
    const permitted = user.invitedScriptIds || [];
    return permitted.includes("*") || permitted.includes(scriptId);
}

export function isUserAdminRole(data: ScriptUserProfile | null): boolean {
    if (!data) return false;
    return data.role === "super_admin" || data.role === "admin";
}

interface AuthContextValue {
    user: ScriptUserProfile | null;
    isLoading: boolean;
    isAuthorized: boolean;
    isAdmin: boolean;
    logout: () => Promise<void>;
    refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
    user: null,
    isLoading: true,
    isAuthorized: false,
    isAdmin: false,
    logout: async () => {},
    refreshAuth: async () => {}
});

export function useStudioAuth(): AuthContextValue {
    return useContext(AuthContext);
}

interface AccessGuardProps {
    children: React.ReactNode;
}

export function AccessGuard({ children }: AccessGuardProps) {
    const [user, setUser] = useState<ScriptUserProfile | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isAuthorized, setIsAuthorized] = useState(false);

    const checkAuth = async () => {
        try {
            let profile: ScriptUserProfile | null = null;
            const endpoints = ["/studio/script/api/session", "/api/session"];
            for (const endpoint of endpoints) {
                const res = await fetch(endpoint, { credentials: "same-origin" }).catch(() => null);
                if (res && res.ok) {
                    const body = await res.json().catch(() => null);
                    if (body?.data) {
                        profile = body.data as ScriptUserProfile;
                        break;
                    }
                }
            }
            if (profile) {
                setUser(profile);
                setIsAuthorized(checkUserAuthorized(profile));
            } else {
                setUser(null);
                setIsAuthorized(false);
            }
        } catch {
            setUser(null);
            setIsAuthorized(false);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        checkAuth();
    }, []);

    const router = useRouter();

    const handleLogin = () => {
        const returnTo = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/studio/script";
        window.location.href = `/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
    };

    const handleLogout = async () => {
        try {
            await fetch("/api/session", { method: "DELETE" }).catch(() => undefined);
            await fetch("/studio/script/api/session", { method: "DELETE" }).catch(() => undefined);
        } catch {}
        setUser(null);
        setIsAuthorized(false);
        window.location.href = "/auth/login";
    };

    const contextValue: AuthContextValue = {
        user,
        isLoading,
        isAuthorized,
        isAdmin: isUserAdminRole(user),
        logout: handleLogout,
        refreshAuth: checkAuth
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-[#0e1015]">
                <StairwayLoader size="md" label="Authenticating..." />
            </div>
        );
    }

    if (!isAuthorized) {
        return (
            <AuthContext.Provider value={contextValue}>
                <div className="flex flex-col items-center justify-center min-h-screen bg-[#0e1015] p-6 text-center select-none">
                    <StairwayLoader size="md" label={user ? "Access Restricted" : "Project Stairway Studio"} />

                    <div className="mt-6 flex flex-col items-center gap-3 max-w-sm">
                        {user ? (
                            <>
                                <p className="text-xs text-slate-400 font-mono">
                                    Studio access requires an Administrator role or an active invite. Signed in as{" "}
                                    <span className="text-slate-200 font-semibold">{user.username}</span> ({user.role}).
                                </p>
                                <button
                                    onClick={handleLogout}
                                    className="mt-2 px-5 py-2 bg-[#1c1f2b] hover:bg-[#252a3a] border border-[#262933] hover:border-slate-500 rounded-md text-xs font-mono text-slate-200 transition-colors shadow-lg"
                                >
                                    Switch Account
                                </button>
                            </>
                        ) : (
                            <>
                                <p className="text-xs text-slate-400 font-mono">
                                    Sign in with your verified Discord account to access Studio.
                                </p>
                                <button
                                    onClick={handleLogin}
                                    className="px-5 py-2 bg-[#1c1f2b] hover:bg-[#252a3a] border border-[#262933] hover:border-slate-500 rounded-md text-xs font-mono text-slate-200 transition-colors shadow-lg"
                                >
                                    Sign in with Discord
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </AuthContext.Provider>
        );
    }

    const pendingInvites = user?.pendingInvites || [];
    const activePendingInvite: PendingInvite | undefined = pendingInvites[0];

    if (!isUserAdminRole(user) && !user?.isInvited && activePendingInvite) {
        return (
            <AuthContext.Provider value={contextValue}>
                <div className="flex items-center justify-center min-h-screen bg-[#0e1015]">
                    <StairwayLoader size="md" label="Project Stairway Studio" />
                    <AcceptInviteModal
                        invite={activePendingInvite}
                        isOpen={true}
                        onAccept={checkAuth}
                        onDecline={() => {
                            checkAuth();
                            window.location.href = "/";
                        }}
                    />
                </div>
            </AuthContext.Provider>
        );
    }

    return (
        <AuthContext.Provider value={contextValue}>
            {children}
            {activePendingInvite && (
                <AcceptInviteModal
                    invite={activePendingInvite}
                    isOpen={true}
                    onAccept={checkAuth}
                    onDecline={() => {
                        checkAuth();
                        window.location.href = "/";
                    }}
                />
            )}
        </AuthContext.Provider>
    );
}
