"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { X, UserPlus, Users, Trash2, CheckCircle2, AlertCircle, Loader2, Search, ShieldCheck, Copy, Check } from "lucide-react";

interface StudioInvite {
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

interface PlatformRegisteredUser {
    id: string;
    username: string;
    discordId: string;
    avatarUrl: string | null;
    role: string;
    specialties?: string[];
    isInvited: boolean;
    isAdmin: boolean;
}

interface InviteUserModalProps {
    isOpen: boolean;
    onClose: () => void;
    scriptId?: string | null;
    scriptTitle?: string | null;
    availableScripts?: { id: string; title: string }[];
}

export function InviteUserModal({ isOpen, onClose, scriptId = null, scriptTitle = null, availableScripts = [] }: InviteUserModalProps) {
    const [activeTab, setActiveTab] = useState<"users" | "custom" | "list">("users");
    const [targetId, setTargetId] = useState("");
    const [customRole, setCustomRole] = useState<"editor" | "viewer">("editor");
    const [userRoles, setUserRoles] = useState<Record<string, "editor" | "viewer">>({});
    const [userSearch, setUserSearch] = useState("");

    // script selection for invite scoping
    const [selectedScriptId, setSelectedScriptId] = useState<string>(scriptId || "");
    const [selectedScriptTitle, setSelectedScriptTitle] = useState<string>(scriptTitle || "");

    const [registeredUsers, setRegisteredUsers] = useState<PlatformRegisteredUser[]>([]);
    const [invites, setInvites] = useState<StudioInvite[]>([]);
    const [isLoadingUsers, setIsLoadingUsers] = useState(false);
    const [isLoadingList, setIsLoadingList] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [invitingUserId, setInvitingUserId] = useState<string | null>(null);
    const [revokingId, setRevokingId] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

    // sync active script selection when props change
    useEffect(() => {
        if (scriptId) {
            setSelectedScriptId(scriptId);
            setSelectedScriptTitle(scriptTitle || "Untitled Screenplay");
        } else if (availableScripts.length > 0 && !selectedScriptId) {
            const firstScript = availableScripts[0];
            if (firstScript) {
                setSelectedScriptId(firstScript.id);
                setSelectedScriptTitle(firstScript.title);
            }
        }
    }, [scriptId, scriptTitle, availableScripts, selectedScriptId]);

    const handleScriptChange = (newId: string) => {
        setSelectedScriptId(newId);
        const matched = availableScripts.find((s) => s.id === newId);
        setSelectedScriptTitle(matched ? matched.title : "");
    };

    const apiFetch = async (endpointPath: string, init?: RequestInit): Promise<Response> => {
        const candidates = [`/studio/script${endpointPath}`, endpointPath];
        for (const url of candidates) {
            try {
                const res = await fetch(url, { ...init, credentials: "same-origin" });
                if (res.status !== 404) return res;
            } catch {}
        }
        return fetch(`/studio/script${endpointPath}`, { ...init, credentials: "same-origin" });
    };

    const fetchInvites = useCallback(async () => {
        setIsLoadingList(true);
        try {
            const res = await apiFetch("/api/invites");
            if (res.ok) {
                const body = await res.json();
                setInvites(body?.data || []);
            }
        } catch {}
        setIsLoadingList(false);
    }, []);

    const fetchRegisteredUsers = useCallback(async (scopeScriptId?: string | null) => {
        setIsLoadingUsers(true);
        try {
            const query = scopeScriptId ? `?scriptId=${encodeURIComponent(scopeScriptId)}` : "";
            const res = await apiFetch(`/api/invites/users${query}`);
            if (res.ok) {
                const body = await res.json();
                setRegisteredUsers(body?.data || []);
            }
        } catch {}
        setIsLoadingUsers(false);
    }, []);

    useEffect(() => {
        if (isOpen) {
            fetchInvites();
            fetchRegisteredUsers(selectedScriptId);
            setFeedback(null);
            setTargetId("");
            setUserSearch("");
        }
    }, [isOpen, selectedScriptId, fetchInvites, fetchRegisteredUsers]);

    // close on escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && isOpen) {
                onClose();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, onClose]);

    const handleInviteUser = async (target: string, roleToAssign: "editor" | "viewer", fallbackName?: string) => {
        const cleanId = target.trim();
        if (!cleanId) return;

        setFeedback(null);

        try {
            const res = await apiFetch("/api/invites", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    targetId: cleanId,
                    role: roleToAssign,
                    scriptId: selectedScriptId || null,
                    scriptTitle: selectedScriptTitle || null
                })
            });

            const body = await res.json().catch(() => null);

            if (!res.ok) {
                const errorMsg = body?.error || (res.status === 403 ? "Admin privileges required." : `Invite failed (${res.status}).`);
                setFeedback({
                    type: "error",
                    message: errorMsg
                });
            } else {
                const displayName = body?.data?.username || fallbackName || cleanId;
                const dmSent = body?.dmSent;
                const dmError = body?.dmError;
                const msg = dmSent
                    ? `Invite granted to ${displayName}. Notification sent via Discord DM.`
                    : `Invite granted to ${displayName}. (Discord DM skipped: ${dmError || "user not in server"}).`;
                setFeedback({
                    type: "success",
                    message: msg
                });
                setTargetId("");
                fetchInvites();
                fetchRegisteredUsers(selectedScriptId);
            }
        } catch {
            setFeedback({
                type: "error",
                message: "Network error sending invite."
            });
        }
    };

    const handleCopyLink = async (invite: StudioInvite) => {
        const origin = window.location.origin;
        const url = invite.scriptId
            ? `${origin}/studio/script/editor?id=${encodeURIComponent(invite.scriptId)}`
            : `${origin}/studio/script`;
        try {
            await navigator.clipboard.writeText(url);
            setCopiedId(invite.id);
            setTimeout(() => setCopiedId(null), 2000);
        } catch {}
    };

    const handleCustomSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        await handleInviteUser(targetId, customRole);
        setIsSubmitting(false);
    };

    const handleDirectInvite = async (user: PlatformRegisteredUser) => {
        setInvitingUserId(user.id);
        const assignedRole = userRoles[user.id] || "editor";
        await handleInviteUser(user.discordId || user.id, assignedRole, user.username);
        setInvitingUserId(null);
    };

    const handleRevoke = async (id: string) => {
        setRevokingId(id);
        try {
            const res = await apiFetch("/api/invites", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id })
            });
            if (res.ok) {
                setInvites((prev) => prev.filter((i) => i.id !== id));
                fetchRegisteredUsers(selectedScriptId);
            }
        } catch {}
        setRevokingId(null);
    };

    const filteredUsers = useMemo(() => {
        if (!userSearch.trim()) return registeredUsers;
        const q = userSearch.toLowerCase();
        return registeredUsers.filter(
            (u) => u.username.toLowerCase().includes(q) || u.discordId.includes(q) || u.role.toLowerCase().includes(q)
        );
    }, [registeredUsers, userSearch]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs select-none">
            <div
                className="relative w-full max-w-lg bg-[#212326] border border-[#33353a] rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
                onClick={(e) => e.stopPropagation()}
            >
                {/* header */}
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#33353a] bg-[#16171a]">
                    <div className="flex items-center gap-2 min-w-0">
                        <UserPlus className="w-4 h-4 text-[#4c8aec] shrink-0" />
                        <span className="text-sm font-semibold text-zinc-100 truncate">Invite Collaborators</span>
                        {selectedScriptTitle && (
                            <span className="text-xs text-zinc-400 font-mono truncate hidden sm:inline">- {selectedScriptTitle}</span>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-[#25262a] transition-colors"
                        title="Close"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* screenplay switcher when in multi-script dashboard context */}
                {!scriptId && availableScripts.length > 0 && (
                    <div className="px-5 py-2 bg-[#1e2023] border-b border-[#33353a] flex items-center justify-between text-xs">
                        <span className="text-zinc-400 font-medium">Screenplay</span>
                        <select
                            value={selectedScriptId}
                            onChange={(e) => handleScriptChange(e.target.value)}
                            className="bg-[#27292c] border border-[#33353a] rounded px-2 py-1 text-zinc-200 text-xs outline-none focus:border-[#4c8aec] truncate max-w-xs"
                        >
                            {availableScripts.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.title}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                {/* tab switcher */}
                <div className="flex border-b border-[#33353a] bg-[#1a1c1f] px-5 pt-1.5">
                    <button
                        onClick={() => {
                            setActiveTab("users");
                            setFeedback(null);
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                            activeTab === "users" ? "border-[#4c8aec] text-white" : "border-transparent text-zinc-400 hover:text-zinc-200"
                        }`}
                    >
                        <Users className="w-3.5 h-3.5" />
                        <span>Users ({registeredUsers.length})</span>
                    </button>
                    <button
                        onClick={() => {
                            setActiveTab("custom");
                            setFeedback(null);
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                            activeTab === "custom" ? "border-[#4c8aec] text-white" : "border-transparent text-zinc-400 hover:text-zinc-200"
                        }`}
                    >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Discord ID</span>
                    </button>
                    <button
                        onClick={() => {
                            setActiveTab("list");
                            setFeedback(null);
                            fetchInvites();
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                            activeTab === "list" ? "border-[#4c8aec] text-white" : "border-transparent text-zinc-400 hover:text-zinc-200"
                        }`}
                    >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Invited ({invites.length})</span>
                    </button>
                </div>

                {/* feedback message banner */}
                {feedback && (
                    <div className="px-5 pt-3">
                        <div
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-mono ${
                                feedback.type === "success"
                                    ? "bg-emerald-950/40 border border-emerald-800 text-emerald-300"
                                    : "bg-rose-950/40 border border-rose-800 text-rose-300"
                            }`}
                        >
                            {feedback.type === "success" ? (
                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                            ) : (
                                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                            )}
                            <span className="flex-1 truncate">{feedback.message}</span>
                        </div>
                    </div>
                )}

                {/* tab 1: registered platform users */}
                {activeTab === "users" && (
                    <div className="p-4 space-y-3">
                        <div className="relative">
                            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-500 pointer-events-none" />
                            <input
                                type="text"
                                value={userSearch}
                                onChange={(e) => setUserSearch(e.target.value)}
                                placeholder="Search users..."
                                className="w-full pl-8 pr-3 py-1.5 bg-[#27292c] border border-[#33353a] focus:border-[#4c8aec] rounded-lg text-xs text-zinc-200 placeholder-zinc-500 outline-none transition-colors"
                                autoFocus
                            />
                        </div>

                        {isLoadingUsers ? (
                            <div className="py-10 text-center text-xs font-mono text-zinc-500 flex items-center justify-center gap-2">
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
                                <span>Loading users...</span>
                            </div>
                        ) : filteredUsers.length === 0 ? (
                            <div className="py-10 text-center text-xs font-mono text-zinc-500">
                                {userSearch ? "No users found." : "No registered platform users."}
                            </div>
                        ) : (
                            <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
                                {filteredUsers.map((user) => {
                                    const selectedRole = userRoles[user.id] || "editor";
                                    const isInvitedAlready = user.isInvited;
                                    const isAutoAdmin = user.isAdmin;

                                    return (
                                        <div
                                            key={user.id}
                                            className="flex items-center justify-between p-2.5 rounded-lg bg-[#27292c] border border-[#33353a] text-xs font-mono"
                                        >
                                            <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                                                {user.avatarUrl ? (
                                                    <img
                                                        src={user.avatarUrl}
                                                        alt=""
                                                        className="w-7 h-7 rounded-full object-cover shrink-0"
                                                    />
                                                ) : (
                                                    <div className="w-7 h-7 rounded-full bg-[#33353a] text-zinc-300 flex items-center justify-center font-bold text-[11px] shrink-0 uppercase">
                                                        {user.username.slice(0, 2)}
                                                    </div>
                                                )}
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="font-semibold text-zinc-200 truncate">{user.username}</span>
                                                        <span className="px-1 py-0.2 rounded text-[9px] bg-[#1a1c1f] text-zinc-400 border border-[#33353a] uppercase tracking-wider">
                                                            {user.role}
                                                        </span>
                                                    </div>
                                                    <div className="text-[10px] text-zinc-500 truncate">{user.discordId}</div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-1.5 shrink-0">
                                                {isAutoAdmin ? (
                                                    <span className="px-2 py-0.5 rounded text-[10px] bg-amber-950/40 border border-amber-800 text-amber-300">
                                                        Admin
                                                    </span>
                                                ) : isInvitedAlready ? (
                                                    <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-950/40 border border-emerald-800 text-emerald-300">
                                                        Invited
                                                    </span>
                                                ) : (
                                                    <div className="flex items-center gap-1">
                                                        <select
                                                            value={selectedRole}
                                                            onChange={(e) =>
                                                                setUserRoles((prev) => ({
                                                                    ...prev,
                                                                    [user.id]: e.target.value as "editor" | "viewer"
                                                                }))
                                                            }
                                                            className="px-1.5 py-1 bg-[#1a1c1f] border border-[#33353a] focus:border-[#4c8aec] rounded text-[11px] text-zinc-300 outline-none"
                                                        >
                                                            <option value="editor">Editor</option>
                                                            <option value="viewer">Viewer</option>
                                                        </select>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDirectInvite(user)}
                                                            disabled={invitingUserId === user.id}
                                                            className="flex items-center gap-1 px-2.5 py-1 bg-[#4c8aec] hover:bg-[#3b7be0] disabled:opacity-50 text-white rounded text-[11px] font-medium transition-colors"
                                                        >
                                                            {invitingUserId === user.id ? (
                                                                <Loader2 className="w-3 h-3 animate-spin" />
                                                            ) : (
                                                                <UserPlus className="w-3 h-3" />
                                                            )}
                                                            <span>Invite</span>
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* tab 2: custom id / snowflake invite form */}
                {activeTab === "custom" && (
                    <form onSubmit={handleCustomSubmit} className="p-4 space-y-3">
                        <div className="space-y-1">
                            <label htmlFor="targetId" className="block text-xs font-medium text-zinc-300">
                                Discord ID or Username
                            </label>
                            <input
                                id="targetId"
                                type="text"
                                value={targetId}
                                onChange={(e) => setTargetId(e.target.value)}
                                placeholder="Discord Snowflake or username"
                                className="w-full px-3 py-1.5 bg-[#27292c] border border-[#33353a] focus:border-[#4c8aec] rounded-lg text-xs font-mono text-zinc-200 placeholder-zinc-500 outline-none transition-colors"
                                autoFocus
                            />
                            <p className="text-[10px] text-zinc-500 font-mono">Link sent via Discord DM.</p>
                        </div>

                        <div className="space-y-1">
                            <label htmlFor="inviteRole" className="block text-xs font-medium text-zinc-300">
                                Role
                            </label>
                            <select
                                id="inviteRole"
                                value={customRole}
                                onChange={(e) => setCustomRole(e.target.value as "editor" | "viewer")}
                                className="w-full px-3 py-1.5 bg-[#27292c] border border-[#33353a] focus:border-[#4c8aec] rounded-lg text-xs font-mono text-zinc-200 outline-none transition-colors"
                            >
                                <option value="editor">Editor</option>
                                <option value="viewer">Viewer</option>
                            </select>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#33353a]">
                            <button
                                type="submit"
                                disabled={isSubmitting || !targetId.trim()}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#4c8aec] hover:bg-[#3b7be0] disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors"
                            >
                                {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                <span>Invite</span>
                            </button>
                        </div>
                    </form>
                )}

                {/* tab 3: active invites list */}
                {activeTab === "list" && (
                    <div className="p-4 space-y-2">
                        {isLoadingList ? (
                            <div className="py-8 text-center text-xs font-mono text-zinc-500 flex items-center justify-center gap-2">
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
                                <span>Loading invites...</span>
                            </div>
                        ) : invites.length === 0 ? (
                            <div className="py-8 text-center text-xs font-mono text-zinc-500">No active invites.</div>
                        ) : (
                            <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
                                {invites.map((invite) => (
                                    <div
                                        key={invite.id}
                                        className="flex items-center justify-between p-2.5 rounded-lg bg-[#27292c] border border-[#33353a] text-xs font-mono"
                                    >
                                        <div className="min-w-0 flex-1 pr-2">
                                            <div className="flex items-center gap-1.5">
                                                <span className="font-semibold text-zinc-200 truncate">{invite.username}</span>
                                                <span className="px-1 py-0.2 rounded text-[10px] bg-[#212326] text-[#70a6f8] border border-[#33353a]">
                                                    {invite.role}
                                                </span>
                                            </div>
                                            {invite.scriptTitle && (
                                                <div className="text-[10px] text-zinc-400 truncate mt-0.5">{invite.scriptTitle}</div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                onClick={() => handleCopyLink(invite)}
                                                className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-[#33353a] rounded transition-colors"
                                                title="Copy script URL"
                                            >
                                                {copiedId === invite.id ? (
                                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                                ) : (
                                                    <Copy className="w-3.5 h-3.5" />
                                                )}
                                            </button>
                                            <button
                                                onClick={() => handleRevoke(invite.id)}
                                                disabled={revokingId === invite.id}
                                                className="p-1 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
                                                title="Revoke access"
                                            >
                                                {revokingId === invite.id ? (
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                ) : (
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                <div className="flex items-center justify-end px-5 py-3 border-t border-[#33353a] bg-[#16171a]">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-[#25262a] transition-colors"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}
