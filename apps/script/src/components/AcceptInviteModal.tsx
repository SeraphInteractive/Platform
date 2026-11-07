"use client";

import React, { useState } from "react";
import { Loader2 } from "lucide-react";

export interface PendingInvite {
    id: string;
    scriptId?: string | null;
    scriptTitle?: string | null;
    invitedBy: string;
    role: "editor" | "viewer";
}

interface AcceptInviteModalProps {
    invite: PendingInvite;
    isOpen: boolean;
    onAccept: () => void;
    onDecline: () => void;
}

export function AcceptInviteModal({ invite, isOpen, onAccept, onDecline }: AcceptInviteModalProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleAction = async (action: "accept" | "decline") => {
        setIsSubmitting(true);
        setError(null);
        try {
            const res = await fetch("/studio/script/api/invites", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ inviteId: invite.id, action })
            });

            if (!res.ok) {
                const body = await res.json().catch(() => null);
                throw new Error(body?.error || `Failed to ${action} invite.`);
            }

            if (action === "accept") {
                onAccept();
            } else {
                onDecline();
            }
        } catch (err: any) {
            setError(err?.message || "Failed to process invitation.");
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm select-none">
            <div className="w-full max-w-md bg-[#16171a] border border-[#33353a] rounded-xl shadow-2xl p-6 text-zinc-200">
                <div className="flex items-center gap-2 mb-4">
                    <span className="w-2 h-2 rounded-full bg-[#4c8aec]" />
                    <h2 className="text-sm font-semibold tracking-wide text-zinc-100 uppercase">Screenplay Invitation</h2>
                </div>

                <div className="space-y-3 text-xs text-zinc-400">
                    <p>
                        You have been invited to collaborate on{" "}
                        <span className="text-zinc-100 font-medium">{invite.scriptTitle || "Untitled Screenplay"}</span>.
                    </p>
                    <div className="p-3 bg-[#1e2024] border border-[#2b2d32] rounded-lg space-y-1 font-mono text-[11px]">
                        <div>
                            <span className="text-zinc-500">Invited by: </span>
                            <span className="text-zinc-300">{invite.invitedBy}</span>
                        </div>
                        <div>
                            <span className="text-zinc-500">Access Role: </span>
                            <span className="text-zinc-300 capitalize">{invite.role}</span>
                        </div>
                    </div>
                    <p className="text-[11px] text-zinc-500">
                        {invite.role === "editor"
                            ? "As an editor, you can edit scenes and dialogue in real-time."
                            : "As a viewer, you have read-only access to review and export."}
                    </p>
                </div>

                {error && <div className="mt-4 p-2.5 bg-red-950/40 border border-red-800/50 rounded-lg text-xs text-red-300">{error}</div>}

                <div className="mt-6 flex items-center justify-end gap-2.5">
                    <button
                        type="button"
                        onClick={() => handleAction("decline")}
                        disabled={isSubmitting}
                        className="px-4 py-2 bg-[#212327] hover:bg-[#2c2f35] border border-[#33353a] rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50"
                    >
                        Decline
                    </button>
                    <button
                        type="button"
                        onClick={() => handleAction("accept")}
                        disabled={isSubmitting}
                        className="flex items-center gap-2 px-4 py-2 bg-[#4c8aec] hover:bg-[#3b78d8] text-white rounded-lg text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
                    >
                        {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        Accept Invite
                    </button>
                </div>
            </div>
        </div>
    );
}
