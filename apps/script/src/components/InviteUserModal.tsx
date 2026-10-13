"use client";

import React, { useState, useEffect, useCallback } from "react";
import { X, UserPlus, Users, Trash2, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

interface StudioInvite {
    id: string;
    targetId: string;
    discordId: string;
    username: string;
    avatarUrl?: string | null;
    invitedBy: string;
    invitedAt: string;
    role: "editor" | "viewer";
}

interface InviteUserModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function InviteUserModal({ isOpen, onClose }: InviteUserModalProps) {
    const [activeTab, setActiveTab] = useState<"invite" | "list">("invite");
    const [targetId, setTargetId] = useState("");
    const [role, setRole] = useState<"editor" | "viewer">("editor");
    const [invites, setInvites] = useState<StudioInvite[]>([]);
    const [isLoadingList, setIsLoadingList] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [revokingId, setRevokingId] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

    const getInvitesUrl = () => {
        return typeof window !== "undefined" && window.location.pathname.startsWith("/studio/script")
            ? "/studio/script/api/invites"
            : "/api/invites";
    };

    const fetchInvites = useCallback(async () => {
        setIsLoadingList(true);
        try {
            const res = await fetch(getInvitesUrl());
            if (res.ok) {
                const body = await res.json();
                setInvites(body?.data || []);
            }
        } catch {}
        setIsLoadingList(false);
    }, []);

    useEffect(() => {
        if (isOpen) {
            fetchInvites();
            setFeedback(null);
            setTargetId("");
        }
    }, [isOpen, fetchInvites]);

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

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const cleanId = targetId.trim();
        if (!cleanId) return;

        setIsSubmitting(true);
        setFeedback(null);

        try {
            const res = await fetch(getInvitesUrl(), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ targetId: cleanId, role })
            });

            const body = await res.json().catch(() => null);

            if (!res.ok) {
                setFeedback({
                    type: "error",
                    message: body?.error || "Failed to invite user."
                });
            } else {
                const dmSent = body?.dmSent;
                const msg = dmSent
                    ? `Invite created for ${body?.data?.username || cleanId}. Bot notification delivered via Discord DM.`
                    : `Invite created for ${body?.data?.username || cleanId}. (Discord DM could not be delivered: ${body?.dmError || "user DMs closed"}).`;

                setFeedback({
                    type: dmSent ? "success" : "error",
                    message: msg
                });
                setTargetId("");
                fetchInvites();
            }
        } catch {
            setFeedback({
                type: "error",
                message: "Network error sending invite."
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleRevoke = async (id: string) => {
        setRevokingId(id);
        try {
            const res = await fetch(getInvitesUrl(), {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id })
            });
            if (res.ok) {
                setInvites((prev) => prev.filter((i) => i.id !== id));
            }
        } catch {}
        setRevokingId(null);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none">
            <div
                className="relative w-full max-w-lg bg-[#1c1c20] border border-[#2e2e34] rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
                onClick={(e) => e.stopPropagation()}
            >
                {/* header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-[#28282e] bg-[#18181b]">
                    <div className="flex items-center gap-2">
                        <UserPlus className="w-4 h-4 text-[#818cf8]" />
                        <span className="text-sm font-semibold text-zinc-100">Studio Access & Invites</span>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-[#252529] transition-colors"
                        title="Close"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* tab switcher */}
                <div className="flex border-b border-[#28282e] bg-[#141416] px-5 pt-2">
                    <button
                        onClick={() => {
                            setActiveTab("invite");
                            setFeedback(null);
                        }}
                        className={`flex items-center gap-2 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                            activeTab === "invite" ? "border-[#6366f1] text-white" : "border-transparent text-zinc-400 hover:text-zinc-200"
                        }`}
                    >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Invite User</span>
                    </button>
                    <button
                        onClick={() => {
                            setActiveTab("list");
                            setFeedback(null);
                            fetchInvites();
                        }}
                        className={`flex items-center gap-2 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                            activeTab === "list" ? "border-[#6366f1] text-white" : "border-transparent text-zinc-400 hover:text-zinc-200"
                        }`}
                    >
                        <Users className="w-3.5 h-3.5" />
                        <span>Active Invites ({invites.length})</span>
                    </button>
                </div>

                {/* tab 1: invite form */}
                {activeTab === "invite" && (
                    <form onSubmit={handleSubmit} className="p-5 space-y-4">
                        <div className="space-y-1.5">
                            <label htmlFor="targetId" className="block text-xs font-medium text-zinc-300">
                                User ID or Discord ID
                            </label>
                            <input
                                id="targetId"
                                type="text"
                                value={targetId}
                                onChange={(e) => setTargetId(e.target.value)}
                                placeholder="e.g. 965511204372086814 or user UUID"
                                className="w-full px-3 py-2 bg-[#252529] border border-[#303036] focus:border-[#6366f1] rounded-lg text-xs font-mono text-zinc-200 placeholder-zinc-500 outline-none transition-colors"
                                autoFocus
                            />
                            <p className="text-[11px] text-zinc-500 font-mono">
                                The bot delivers the Studio access link directly via Discord DM.
                            </p>
                        </div>

                        <div className="space-y-1.5">
                            <label htmlFor="inviteRole" className="block text-xs font-medium text-zinc-300">
                                Access Level
                            </label>
                            <select
                                id="inviteRole"
                                value={role}
                                onChange={(e) => setRole(e.target.value as "editor" | "viewer")}
                                className="w-full px-3 py-2 bg-[#252529] border border-[#303036] focus:border-[#6366f1] rounded-lg text-xs font-mono text-zinc-200 outline-none transition-colors"
                            >
                                <option value="editor">Screenplay Editor (Full read/write)</option>
                                <option value="viewer">Screenplay Viewer (Read-only)</option>
                            </select>
                        </div>

                        {feedback && (
                            <div
                                className={`flex items-start gap-2 p-3 rounded-xl text-xs font-mono ${
                                    feedback.type === "success"
                                        ? "bg-emerald-950/40 border border-emerald-800 text-emerald-300"
                                        : "bg-rose-950/40 border border-rose-800 text-rose-300"
                                }`}
                            >
                                {feedback.type === "success" ? (
                                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                                ) : (
                                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                                )}
                                <div className="flex-1">{feedback.message}</div>
                            </div>
                        )}

                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#28282e]">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-[#252529] transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting || !targetId.trim()}
                                className="flex items-center gap-2 px-4 py-2 bg-[#6366f1] hover:bg-[#4f46e5] disabled:opacity-50 disabled:hover:bg-[#6366f1] text-white rounded-lg text-xs font-medium transition-colors shadow-lg"
                            >
                                {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                <span>Send Invite</span>
                            </button>
                        </div>
                    </form>
                )}

                {/* tab 2: active invites list */}
                {activeTab === "list" && (
                    <div className="p-5 space-y-3">
                        {isLoadingList ? (
                            <div className="py-8 text-center text-xs font-mono text-zinc-500 flex items-center justify-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                                <span>Loading active invites...</span>
                            </div>
                        ) : invites.length === 0 ? (
                            <div className="py-8 text-center text-xs font-mono text-zinc-500">
                                No external users currently invited. Only administrators have access.
                            </div>
                        ) : (
                            <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                                {invites.map((invite) => (
                                    <div
                                        key={invite.id}
                                        className="flex items-center justify-between p-3 rounded-xl bg-[#252529] border border-[#2e2e34] text-xs font-mono"
                                    >
                                        <div className="min-w-0 flex-1 pr-3">
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-zinc-200 truncate">{invite.username}</span>
                                                <span className="px-1.5 py-0.5 rounded-md text-[10px] bg-[#1c1c20] text-[#a5b4fc] border border-[#303036]">
                                                    {invite.role}
                                                </span>
                                            </div>
                                            <div className="text-[11px] text-zinc-500 truncate mt-0.5">
                                                ID: {invite.discordId || invite.targetId} - Invited by {invite.invitedBy}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleRevoke(invite.id)}
                                            disabled={revokingId === invite.id}
                                            className="p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors shrink-0"
                                            title="Revoke access"
                                        >
                                            {revokingId === invite.id ? (
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            ) : (
                                                <Trash2 className="w-3.5 h-3.5" />
                                            )}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex items-center justify-end pt-2 border-t border-[#28282e]">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-[#252529] transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
