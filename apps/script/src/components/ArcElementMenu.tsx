"use client";

import React, { useEffect, useRef } from "react";
import type { Editor } from "@tiptap/react";
import { Clapperboard, User, Parentheses, MessageCircleMore, Video } from "lucide-react";

// custom running figure icon matching Arc Studio
function RunningPersonIcon({ className = "w-4 h-4" }: { className?: string }) {
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
function TransitionSplitIcon({ className = "w-4 h-4" }: { className?: string }) {
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

export const SCREENPLAY_ELEMENT_ITEMS = [
    { id: "sceneHeading", label: "Scene Heading", num: 1, icon: Clapperboard, targetNode: "sceneHeading" },
    { id: "action", label: "Action", num: 2, icon: RunningPersonIcon, targetNode: "action" },
    { id: "character", label: "Character", num: 3, icon: User, targetNode: "character" },
    { id: "parenthetical", label: "Parenthetical", num: 4, icon: Parentheses, targetNode: "parenthetical" },
    { id: "dialogue", label: "Dialogue", num: 5, icon: MessageCircleMore, targetNode: "dialogue" },
    { id: "shot", label: "Shot", num: 6, icon: Video, targetNode: "shot" },
    { id: "transition", label: "Transition", num: 7, icon: TransitionSplitIcon, targetNode: "transition" }
] as const;

export interface ArcElementMenuProps {
    editor: Editor | null;
    isOpen: boolean;
    onClose: () => void;
    position?: { x: number; y: number } | null;
    align?: "dock" | "context" | "pill";
}

export function ArcElementMenu({ editor, isOpen, onClose, position, align = "dock" }: ArcElementMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen) return;

        const handleOutsideClick = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onClose();
            }
        };

        window.addEventListener("mousedown", handleOutsideClick);
        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("mousedown", handleOutsideClick);
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [isOpen, onClose]);

    if (!isOpen || !editor) return null;

    const currentType = editor.state.selection.$from.parent.type.name;
    const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.userAgent);
    const modKey = isMac ? "⌘" : "Ctrl";

    const handleSelect = (targetNode: string) => {
        editor.chain().focus().setNode(targetNode).run();
        onClose();
    };

    // calculate position based on alignment mode
    const style: React.CSSProperties =
        align === "context" && position
            ? {
                  position: "fixed",
                  left: Math.min(position.x, window.innerWidth - 240),
                  top: Math.min(position.y, window.innerHeight - 300),
                  zIndex: 60
              }
            : align === "pill"
              ? {
                    position: "absolute",
                    bottom: "44px",
                    left: "0px",
                    zIndex: 50
                }
              : {
                    position: "absolute",
                    bottom: "48px",
                    left: "50%",
                    transform: "translateX(-50%)",
                    zIndex: 50
                };

    return (
        <div
            ref={menuRef}
            style={style}
            className="no-print w-56 bg-[#1a1b1f] border border-[#2d2f36] rounded-xl shadow-2xl p-1 text-xs select-none space-y-0.5 animate-in fade-in duration-100"
        >
            {SCREENPLAY_ELEMENT_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = currentType === item.id;

                return (
                    <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelect(item.targetNode)}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors group cursor-pointer ${
                            isActive ? "bg-[#27292f] text-white" : "text-zinc-300 hover:text-white hover:bg-[#23242a]"
                        }`}
                    >
                        <div className="flex items-center gap-2.5 min-w-0">
                            <Icon
                                className={`w-4 h-4 shrink-0 ${isActive ? "text-[#60a5fa]" : "text-zinc-400 group-hover:text-zinc-300"}`}
                            />
                            <span className="text-[13px] font-medium tracking-wide truncate">{item.label}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 ml-3">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium text-zinc-300 bg-[#282a30] leading-none select-none">
                                {modKey}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium text-zinc-300 bg-[#282a30] leading-none select-none">
                                {item.num}
                            </span>
                        </div>
                    </button>
                );
            })}
        </div>
    );
}
