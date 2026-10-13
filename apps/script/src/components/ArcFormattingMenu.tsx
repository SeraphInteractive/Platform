"use client";

import React, { useState, useEffect, useRef } from "react";
import type { Editor } from "@tiptap/react";
import {
    MessageSquare,
    GitBranch,
    Type,
    Volume2,
    Box,
    Hash,
    EyeOff,
    Link2,
    ChevronRight,
    Film,
    Activity,
    User,
    Code,
    MessageSquareQuote,
    Video,
    Flag,
    Bold,
    Italic,
    Underline,
    Strikethrough,
    Paintbrush,
    Check
} from "lucide-react";
import { SCREENPLAY_ELEMENT_ITEMS } from "./ArcElementMenu";

export interface ArcFormattingMenuProps {
    editor: Editor | null;
    isOpen: boolean;
    onClose: () => void;
    onOpenBeatBoard?: () => void;
    onOpenComments?: () => void;
    position?: { x: number; y: number } | null;
    align?: "dock" | "context";
}

type ActiveSubmenu = "none" | "element" | "alts" | "formatting";

export function ArcFormattingMenu({
    editor,
    isOpen,
    onClose,
    onOpenBeatBoard,
    onOpenComments,
    position,
    align = "dock"
}: ArcFormattingMenuProps) {
    const [activeSubmenu, setActiveSubmenu] = useState<ActiveSubmenu>("none");
    const [copiedLink, setCopiedLink] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen) {
            setActiveSubmenu("none");
            setCopiedLink(false);
            return;
        }

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

    const setElementType = (type: string) => {
        editor.chain().focus().setNode(type).run();
        onClose();
    };

    const handleToggleCase = () => {
        const { from, to, empty } = editor.state.selection;
        if (empty) return;
        const text = editor.state.doc.textBetween(from, to, " ");
        const isUpper = text === text.toUpperCase();
        const newText = isUpper ? text.toLowerCase() : text.toUpperCase();
        editor.chain().focus().insertContentAt({ from, to }, newText).run();
        onClose();
    };

    const handleClearFormat = () => {
        editor.chain().focus().unsetAllMarks().run();
        onClose();
    };

    const handleReadParagraph = () => {
        if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

        if (isSpeaking) {
            window.speechSynthesis.cancel();
            setIsSpeaking(false);
            onClose();
            return;
        }

        const { from, to, empty } = editor.state.selection;
        let textToRead = "";
        if (!empty) {
            textToRead = editor.state.doc.textBetween(from, to, " ");
        } else {
            textToRead = editor.state.selection.$from.parent.textContent;
        }

        if (!textToRead.trim()) return;

        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(textToRead);
        utterance.rate = 1.0;
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);
        setIsSpeaking(true);
        window.speechSynthesis.speak(utterance);
        onClose();
    };

    const handleAddBeat = () => {
        if (onOpenBeatBoard) {
            onOpenBeatBoard();
        }
        onClose();
    };

    const handleOpenComments = () => {
        if (onOpenComments) {
            onOpenComments();
        }
        onClose();
    };

    const handleAddSceneNumber = () => {
        const { $from } = editor.state.selection;
        const parentNode = $from.parent;
        if (parentNode.type.name === "sceneHeading") {
            const text = parentNode.textContent;
            if (!/^\d+\./.test(text.trim())) {
                const startPos = $from.start();
                editor.chain().focus().insertContentAt(startPos, "1. ").run();
            }
        } else {
            editor.chain().focus().setNode("sceneHeading").run();
        }
        onClose();
    };

    const handleCopyLink = () => {
        if (typeof window === "undefined") return;
        try {
            navigator.clipboard.writeText(window.location.href);
            setCopiedLink(true);
            setTimeout(() => {
                setCopiedLink(false);
                onClose();
            }, 700);
        } catch {}
    };

    const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.userAgent);
    const cmdKey = isMac ? "⌘" : "Ctrl";
    const altKey = isMac ? "⌥" : "Alt";

    // positioning: dock-anchored or context-anchored
    const style: React.CSSProperties =
        align === "context" && position
            ? {
                  position: "fixed",
                  left: Math.min(position.x, window.innerWidth - 260),
                  top: Math.min(position.y, window.innerHeight - 360),
                  zIndex: 60
              }
            : {
                  position: "absolute",
                  bottom: "48px",
                  left: "64px",
                  zIndex: 50
              };

    return (
        <div
            ref={menuRef}
            style={style}
            className="no-print w-60 bg-[#1a1a1e]/98 border border-[#2c2c34] rounded-xl shadow-2xl p-1 text-xs text-zinc-300 backdrop-blur-md select-none animate-in fade-in duration-100"
        >
            <div className="relative">
                {/* Row 1: Change element */}
                <div
                    onMouseEnter={() => setActiveSubmenu("element")}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors ${
                        activeSubmenu === "element" ? "bg-[#282830] text-white" : "hover:bg-[#25252b]"
                    }`}
                >
                    <div className="flex items-center gap-2">
                        <MessageSquare className="w-3.5 h-3.5 text-zinc-400" />
                        <span className="font-medium text-[12px]">Change element</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
                </div>

                {/* Submenu: Elements */}
                {activeSubmenu === "element" && (
                    <div
                        onMouseLeave={() => setActiveSubmenu("none")}
                        className="absolute left-full top-0 ml-1 w-56 bg-[#1a1b1f] border border-[#2d2f36] rounded-xl shadow-2xl p-1 text-xs text-zinc-300 backdrop-blur-md space-y-0.5 animate-in fade-in duration-100"
                    >
                        {SCREENPLAY_ELEMENT_ITEMS.map((item) => {
                            const Icon = item.icon;
                            const isSelected = currentType === item.id;
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => setElementType(item.targetNode)}
                                    className={`flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer group ${
                                        isSelected
                                            ? "bg-[#27292f] text-white font-semibold"
                                            : "hover:bg-[#23242a] text-zinc-300 hover:text-white"
                                    }`}
                                >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <Icon
                                            className={`w-4 h-4 shrink-0 ${
                                                isSelected ? "text-[#60a5fa]" : "text-zinc-400 group-hover:text-zinc-300"
                                            }`}
                                        />
                                        <span className="text-[13px] font-medium tracking-wide truncate">{item.label}</span>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0 ml-3">
                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium text-zinc-300 bg-[#282a30] leading-none select-none">
                                            {cmdKey}
                                        </span>
                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium text-zinc-300 bg-[#282a30] leading-none select-none">
                                            {item.num}
                                        </span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Row 2: Alts */}
                <div
                    onMouseEnter={() => setActiveSubmenu("alts")}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors ${
                        activeSubmenu === "alts" ? "bg-[#282830] text-white" : "hover:bg-[#25252b]"
                    }`}
                >
                    <div className="flex items-center gap-2">
                        <GitBranch className="w-3.5 h-3.5 text-zinc-400" />
                        <span className="font-medium text-[12px]">Alts</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
                </div>

                {/* Submenu: Alts */}
                {activeSubmenu === "alts" && (
                    <div
                        onMouseLeave={() => setActiveSubmenu("none")}
                        className="absolute left-full top-7 ml-1 w-48 bg-[#1a1a1e]/98 border border-[#2c2c34] rounded-xl shadow-2xl p-1 text-xs text-zinc-300 backdrop-blur-md space-y-0.5 animate-in fade-in duration-100"
                    >
                        <button
                            onClick={() => {
                                if (onOpenComments) onOpenComments();
                                onClose();
                            }}
                            className="flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-[#25252b] text-zinc-300"
                        >
                            <span>Show Alts</span>
                        </button>
                        <button
                            onClick={() => {
                                editor.chain().focus().run();
                                onClose();
                            }}
                            className="flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-[#25252b] text-zinc-300"
                        >
                            <span>Save as Alt</span>
                            <span className="text-[10px] font-mono text-zinc-500">
                                {altKey} {cmdKey} A
                            </span>
                        </button>
                        <button
                            onClick={() => {
                                if (onOpenComments) onOpenComments();
                                onClose();
                            }}
                            className="flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-[#25252b] text-zinc-300"
                        >
                            <span>Show History</span>
                            <span className="text-[10px] font-mono text-zinc-500">
                                {altKey} {cmdKey} H
                            </span>
                        </button>
                    </div>
                )}

                {/* Row 3: Formatting */}
                <div
                    onMouseEnter={() => setActiveSubmenu("formatting")}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors ${
                        activeSubmenu === "formatting" ? "bg-[#282830] text-white" : "hover:bg-[#25252b]"
                    }`}
                >
                    <div className="flex items-center gap-2">
                        <Type className="w-3.5 h-3.5 text-zinc-400" />
                        <span className="font-medium text-[12px]">Formatting</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
                </div>

                {/* Submenu: Formatting */}
                {activeSubmenu === "formatting" && (
                    <div
                        onMouseLeave={() => setActiveSubmenu("none")}
                        className="absolute left-full top-14 ml-1 w-48 bg-[#1a1a1e]/98 border border-[#2c2c34] rounded-xl shadow-2xl p-1 text-xs text-zinc-300 backdrop-blur-md space-y-0.5 animate-in fade-in duration-100"
                    >
                        <button
                            onClick={() => onClose()}
                            className="flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-[#25252b] text-zinc-300"
                        >
                            <span>Margins</span>
                            <span className="text-[10px] font-mono text-zinc-500">
                                {altKey} {cmdKey} F
                            </span>
                        </button>
                        <button
                            onClick={() => onClose()}
                            className="flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-[#25252b] text-zinc-300"
                        >
                            <span>Alignment</span>
                            <ChevronRight className="w-3 h-3 text-zinc-500" />
                        </button>
                        <button
                            onClick={() => onClose()}
                            className="flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-[#25252b] text-zinc-300"
                        >
                            <span>Spacing before</span>
                            <ChevronRight className="w-3 h-3 text-zinc-500" />
                        </button>
                        <button
                            onClick={() => onClose()}
                            className="flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-[#25252b] text-zinc-300"
                        >
                            <span>Line Height</span>
                            <ChevronRight className="w-3 h-3 text-zinc-500" />
                        </button>
                    </div>
                )}

                {/* Divider */}
                <div className="border-t border-[#2c2c34] my-1" />

                {/* Row 4: Read paragraph */}
                <button
                    onClick={handleReadParagraph}
                    onMouseEnter={() => setActiveSubmenu("none")}
                    className="flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-[#25252b] text-zinc-300 transition-colors"
                >
                    <div className="flex items-center gap-2">
                        <Volume2 className="w-3.5 h-3.5 text-zinc-400" />
                        <span className="text-[12px]">{isSpeaking ? "Stop reading" : "Read paragraph"}</span>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-500">
                        {altKey} {cmdKey} R
                    </span>
                </button>

                {/* Row 5: Add beat */}
                <button
                    onClick={handleAddBeat}
                    onMouseEnter={() => setActiveSubmenu("none")}
                    className="flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-[#25252b] text-zinc-300 transition-colors"
                >
                    <div className="flex items-center gap-2">
                        <Box className="w-3.5 h-3.5 text-zinc-400" />
                        <span className="text-[12px]">Add beat</span>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-500">⇧ {cmdKey} B</span>
                </button>

                {/* Row 6: Comments */}
                <button
                    onClick={handleOpenComments}
                    onMouseEnter={() => setActiveSubmenu("none")}
                    className="flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-[#25252b] text-zinc-300 transition-colors"
                >
                    <div className="flex items-center gap-2">
                        <MessageSquare className="w-3.5 h-3.5 text-zinc-400" />
                        <span className="text-[12px]">Comments</span>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-500">
                        {altKey} {cmdKey} M
                    </span>
                </button>

                {/* Row 7: Omit Scene */}
                <button
                    onClick={handleAddSceneNumber}
                    onMouseEnter={() => setActiveSubmenu("none")}
                    className="flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-[#25252b] text-zinc-300 transition-colors"
                >
                    <div className="flex items-center gap-2">
                        <EyeOff className="w-3.5 h-3.5 text-zinc-400" />
                        <span className="text-[12px]">Omit Scene</span>
                    </div>
                </button>

                {/* Row 8: Copy link */}
                <button
                    onClick={handleCopyLink}
                    onMouseEnter={() => setActiveSubmenu("none")}
                    className="flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-[#25252b] text-zinc-300 transition-colors"
                >
                    <div className="flex items-center gap-2">
                        {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Link2 className="w-3.5 h-3.5 text-zinc-400" />}
                        <span className="text-[12px]">{copiedLink ? "Link copied!" : "Copy link"}</span>
                    </div>
                </button>
            </div>
        </div>
    );
}
