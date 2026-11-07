"use client";

import React from "react";
import type { Editor } from "@tiptap/react";
import { Clapperboard, User, Parentheses, MessageCircleMore, Video, MoreHorizontal } from "lucide-react";

// custom running figure icon matching Arc Studio
function RunningPersonIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
    return (
        <svg
            className={className}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <circle cx="17" cy="4" r="1.75" />
            <path d="M15 8.5l-3.5 3.5-3.5-1-3.5 4" />
            <path d="M11.5 12l2 4.5 4.5 1" />
            <path d="M8 15.5l-2.5 5" />
        </svg>
    );
}

// custom transition slide icon matching Arc Studio
function TransitionSplitIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
    return (
        <svg
            className={className}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <rect x="2" y="6" width="14" height="12" rx="2" />
            <path d="M9 6v12" />
            <path d="M15 10l5-2v8l-5-2" />
        </svg>
    );
}

const MOBILE_ELEMENTS = [
    { id: "sceneHeading", label: "Scene", icon: Clapperboard, targetNode: "sceneHeading" },
    { id: "action", label: "Action", icon: RunningPersonIcon, targetNode: "action" },
    { id: "character", label: "Char", icon: User, targetNode: "character" },
    { id: "parenthetical", label: "Par", icon: Parentheses, targetNode: "parenthetical" },
    { id: "dialogue", label: "Diag", icon: MessageCircleMore, targetNode: "dialogue" },
    { id: "shot", label: "Shot", icon: Video, targetNode: "shot" },
    { id: "transition", label: "Trans", icon: TransitionSplitIcon, targetNode: "transition" }
] as const;

interface MobileKeyboardToolbarProps {
    editor: Editor | null;
    isReadOnly?: boolean;
    onOpenContextMenu?: (coords: { x: number; y: number }) => void;
}

export function MobileKeyboardToolbar({ editor, isReadOnly = false, onOpenContextMenu }: MobileKeyboardToolbarProps) {
    if (!editor || isReadOnly) return null;

    const currentType = editor.state.selection.$from.parent.type.name;

    const handleSelectType = (e: React.MouseEvent, targetNode: string) => {
        // prevent blur on touch so mobile virtual keyboard stays open
        e.preventDefault();
        editor.chain().focus().setNode(targetNode).run();
    };

    const handleOpenMore = (e: React.MouseEvent) => {
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        if (onOpenContextMenu) {
            onOpenContextMenu({ x: rect.left, y: rect.top - 10 });
        }
    };

    return (
        <aside
            aria-label="Screenplay element accessory bar"
            className="no-print md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#16171a]/95 border-t border-[#33353a] backdrop-blur-md px-2 py-1.5 flex items-center gap-1.5 overflow-x-auto select-none shadow-2xl pb-[max(0.375rem,env(safe-area-inset-bottom))]"
        >
            <div className="flex items-center gap-1 min-w-max">
                {MOBILE_ELEMENTS.map((elem) => {
                    const isActive = currentType === elem.targetNode;
                    const Icon = elem.icon;
                    return (
                        <button
                            key={elem.id}
                            type="button"
                            onMouseDown={(e) => handleSelectType(e, elem.targetNode)}
                            onTouchStart={(e) => {
                                // keep focus inside editor
                                e.stopPropagation();
                            }}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-mono font-medium transition-colors ${
                                isActive
                                    ? "bg-[#25262a] text-[#4c8aec] border border-[#3e4044] shadow-sm font-semibold"
                                    : "text-zinc-400 hover:text-zinc-100 hover:bg-[#212326]"
                            }`}
                        >
                            <Icon className="w-3.5 h-3.5 shrink-0" />
                            <span>{elem.label}</span>
                        </button>
                    );
                })}

                <button
                    type="button"
                    onMouseDown={handleOpenMore}
                    className="p-1.5 rounded text-zinc-400 hover:text-zinc-100 hover:bg-[#212326] transition-colors"
                    title="Formatting Menu"
                >
                    <MoreHorizontal className="w-3.5 h-3.5" />
                </button>
            </div>
        </aside>
    );
}
