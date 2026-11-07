"use client";

import React, { useState, useEffect, useRef } from "react";
import type { Editor } from "@tiptap/react";
import { MessageSquare, GitBranch, SlidersHorizontal, Volume2, Box, Hash, Link2, ChevronRight, Check, Copy } from "lucide-react";
import { SCREENPLAY_ELEMENT_ITEMS } from "./ArcElementMenu";

export interface ArcFormattingMenuProps {
    editor: Editor | null;
    isOpen: boolean;
    onClose: () => void;
    onOpenBeatBoard?: () => void;
    onOpenComments?: () => void;
    onOpenMargins?: () => void;
    position?: { x: number; y: number } | null;
    align?: "dock" | "context" | "gutter";
    currentFormatting?: {
        alignment?: "left" | "center" | "right";
        spacingBefore?: number;
        lineHeight?: number;
    };
    onUpdateFormatting?: (formatting: { alignment?: "left" | "center" | "right"; spacingBefore?: number; lineHeight?: number }) => void;
}

type ActiveSubmenu = "none" | "element" | "alts" | "formatting";
type NestedSubmenu = "none" | "alignment" | "spacing" | "lineHeight";

export function ArcFormattingMenu({
    editor,
    isOpen,
    onClose,
    onOpenBeatBoard,
    onOpenComments,
    onOpenMargins,
    position,
    align = "dock",
    currentFormatting,
    onUpdateFormatting
}: ArcFormattingMenuProps) {
    const [activeSubmenu, setActiveSubmenu] = useState<ActiveSubmenu>("none");
    const [nestedSubmenu, setNestedSubmenu] = useState<NestedSubmenu>("none");
    const [copiedText, setCopiedText] = useState(false);
    const [copiedLink, setCopiedLink] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen) {
            setActiveSubmenu("none");
            setNestedSubmenu("none");
            setCopiedText(false);
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
            const currentNum = parentNode.attrs.sceneNumber;
            const newNum = currentNum ? null : "1";
            editor.chain().focus().updateAttributes("sceneHeading", { sceneNumber: newNum }).run();
        } else {
            editor.chain().focus().setNode("sceneHeading", { sceneNumber: "1" }).run();
        }
        onClose();
    };

    const handleCopyText = async () => {
        if (typeof window === "undefined" || !editor) return;
        try {
            const { from, to, empty } = editor.state.selection;
            let textToCopy = "";
            if (!empty) {
                textToCopy = editor.state.doc.textBetween(from, to, "\n");
            } else {
                textToCopy = editor.state.selection.$from.parent.textContent;
            }
            if (!textToCopy) return;
            await navigator.clipboard.writeText(textToCopy);
            setCopiedText(true);
            setTimeout(() => {
                setCopiedText(false);
                onClose();
            }, 700);
        } catch {
            onClose();
        }
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

    // positioning: gutter-anchored, context-anchored, or dock-anchored
    const style: React.CSSProperties =
        (align === "context" || align === "gutter") && position
            ? {
                  position: "fixed",
                  left: Math.min(position.x, window.innerWidth - 260),
                  top: Math.min(position.y, window.innerHeight - 380),
                  zIndex: 30000
              }
            : {
                  position: "absolute",
                  bottom: "48px",
                  left: "64px",
                  zIndex: 30000
              };

    // find current element item icon
    const currentItem = SCREENPLAY_ELEMENT_ITEMS.find((item) => item.id === currentType) || SCREENPLAY_ELEMENT_ITEMS[4];
    const ElementIcon = currentItem.icon;

    const alignment = currentFormatting?.alignment || "left";
    const spacingBefore = currentFormatting?.spacingBefore ?? 1;
    const lineHeight = currentFormatting?.lineHeight ?? 1;

    return (
        <div
            ref={menuRef}
            style={style}
            className="no-print w-[238px] bg-[#1d1f21] border border-white/15 rounded-lg p-1 text-xs text-zinc-300 shadow-[rgba(10,10,10,0.5)_0px_1px_4px_0px,rgba(10,10,10,0.1)_0px_2px_4px_0px] select-none z-[30000] animate-in fade-in duration-75"
        >
            <div className="relative">
                {/* 1. Change element */}
                <div
                    onMouseEnter={() => {
                        setActiveSubmenu("element");
                        setNestedSubmenu("none");
                    }}
                    className={`flex items-center justify-between h-[33px] px-2 rounded cursor-pointer transition-colors ${
                        activeSubmenu === "element" ? "bg-[#282830] text-white" : "hover:bg-[#25252b]"
                    }`}
                >
                    <div className="flex items-center gap-2 min-w-0">
                        <ElementIcon className="w-4 h-4 text-zinc-400 shrink-0" />
                        <span className="font-normal text-[12px] truncate">Change element</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                </div>

                {/* Submenu: Change element */}
                {activeSubmenu === "element" && (
                    <div
                        onMouseLeave={() => setActiveSubmenu("none")}
                        className="absolute left-full top-0 ml-1 w-[210px] bg-[#1d1f21] border border-white/15 rounded-lg p-1 text-xs text-zinc-300 shadow-[rgba(10,10,10,0.5)_0px_1px_4px_0px,rgba(10,10,10,0.1)_0px_2px_4px_0px] space-y-0.5 z-[30001] animate-in fade-in duration-75"
                    >
                        {SCREENPLAY_ELEMENT_ITEMS.map((item) => {
                            const Icon = item.icon;
                            const isSelected = currentType === item.id;
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => setElementType(item.targetNode)}
                                    className={`flex items-center justify-between w-full h-[33px] px-2 rounded text-left transition-colors cursor-pointer group ${
                                        isSelected
                                            ? "bg-[#282830] text-white font-medium"
                                            : "hover:bg-[#25252b] text-zinc-300 hover:text-white"
                                    }`}
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        <Icon className="w-4 h-4 shrink-0 text-zinc-400 group-hover:text-zinc-200" />
                                        <span className="text-[12px] truncate">{item.label}</span>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0 ml-2">
                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-300 bg-[#282a30] leading-none select-none">
                                            {cmdKey}
                                        </span>
                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-300 bg-[#282a30] leading-none select-none">
                                            {item.num}
                                        </span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* 2. Alts */}
                <div
                    onMouseEnter={() => {
                        setActiveSubmenu("alts");
                        setNestedSubmenu("none");
                    }}
                    className={`flex items-center justify-between h-[33px] px-2 rounded cursor-pointer transition-colors ${
                        activeSubmenu === "alts" ? "bg-[#282830] text-white" : "hover:bg-[#25252b]"
                    }`}
                >
                    <div className="flex items-center gap-2 min-w-0">
                        <GitBranch className="w-4 h-4 text-zinc-400 shrink-0" />
                        <span className="font-normal text-[12px] truncate">Alts</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                </div>

                {/* Submenu: Alts */}
                {activeSubmenu === "alts" && (
                    <div
                        onMouseLeave={() => setActiveSubmenu("none")}
                        className="absolute left-full top-[34px] ml-1 w-[200px] bg-[#1d1f21] border border-white/15 rounded-lg p-1 text-xs text-zinc-300 shadow-[rgba(10,10,10,0.5)_0px_1px_4px_0px,rgba(10,10,10,0.1)_0px_2px_4px_0px] space-y-0.5 z-[30001] animate-in fade-in duration-75"
                    >
                        <button
                            type="button"
                            onClick={() => {
                                if (onOpenComments) onOpenComments();
                                onClose();
                            }}
                            className="flex items-center justify-between w-full h-[33px] px-2 rounded text-left hover:bg-[#25252b] text-zinc-300"
                        >
                            <span className="text-[12px]">Show Alts</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                if (onOpenComments) onOpenComments();
                                onClose();
                            }}
                            className="flex items-center justify-between w-full h-[33px] px-2 rounded text-left hover:bg-[#25252b] text-zinc-300"
                        >
                            <span className="text-[12px]">Save as Alt</span>
                            <div className="flex items-center gap-1 shrink-0 ml-2">
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-300 bg-[#282a30] leading-none">
                                    {altKey}
                                </span>
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-300 bg-[#282a30] leading-none">
                                    {cmdKey}
                                </span>
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-300 bg-[#282a30] leading-none">
                                    A
                                </span>
                            </div>
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                if (onOpenComments) onOpenComments();
                                onClose();
                            }}
                            className="flex items-center justify-between w-full h-[33px] px-2 rounded text-left hover:bg-[#25252b] text-zinc-300"
                        >
                            <span className="text-[12px]">Show History</span>
                            <div className="flex items-center gap-1 shrink-0 ml-2">
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-300 bg-[#282a30] leading-none">
                                    {altKey}
                                </span>
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-300 bg-[#282a30] leading-none">
                                    {cmdKey}
                                </span>
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-300 bg-[#282a30] leading-none">
                                    H
                                </span>
                            </div>
                        </button>
                    </div>
                )}

                {/* 3. Formatting */}
                <div
                    onMouseEnter={() => {
                        setActiveSubmenu("formatting");
                        setNestedSubmenu("none");
                    }}
                    className={`flex items-center justify-between h-[33px] px-2 rounded cursor-pointer transition-colors ${
                        activeSubmenu === "formatting" ? "bg-[#282830] text-white" : "hover:bg-[#25252b]"
                    }`}
                >
                    <div className="flex items-center gap-2 min-w-0">
                        <SlidersHorizontal className="w-4 h-4 text-zinc-400 shrink-0" />
                        <span className="font-normal text-[12px] truncate">Formatting</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                </div>

                {/* Submenu: Formatting */}
                {activeSubmenu === "formatting" && (
                    <div
                        onMouseLeave={() => {
                            setActiveSubmenu("none");
                            setNestedSubmenu("none");
                        }}
                        className="absolute left-full top-[68px] ml-1 w-[200px] bg-[#1d1f21] border border-white/15 rounded-lg p-1 text-xs text-zinc-300 shadow-[rgba(10,10,10,0.5)_0px_1px_4px_0px,rgba(10,10,10,0.1)_0px_2px_4px_0px] space-y-0.5 z-[30001] animate-in fade-in duration-75"
                    >
                        {/* Margins */}
                        <button
                            type="button"
                            onClick={() => {
                                if (onOpenMargins) onOpenMargins();
                                onClose();
                            }}
                            onMouseEnter={() => setNestedSubmenu("none")}
                            className="flex items-center justify-between w-full h-[33px] px-2 rounded text-left hover:bg-[#25252b] text-zinc-300"
                        >
                            <span className="text-[12px]">Margins</span>
                            <div className="flex items-center gap-1 shrink-0 ml-2">
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-300 bg-[#282a30] leading-none">
                                    {altKey}
                                </span>
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-300 bg-[#282a30] leading-none">
                                    {cmdKey}
                                </span>
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-300 bg-[#282a30] leading-none">
                                    F
                                </span>
                            </div>
                        </button>

                        {/* Alignment */}
                        <div
                            onMouseEnter={() => setNestedSubmenu("alignment")}
                            className={`flex items-center justify-between h-[33px] px-2 rounded cursor-pointer transition-colors ${
                                nestedSubmenu === "alignment" ? "bg-[#282830] text-white" : "hover:bg-[#25252b]"
                            }`}
                        >
                            <span className="text-[12px]">Alignment</span>
                            <ChevronRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                        </div>

                        {/* Nested Submenu: Alignment */}
                        {nestedSubmenu === "alignment" && (
                            <div className="absolute left-full top-[34px] ml-1 w-[160px] bg-[#1d1f21] border border-white/15 rounded-lg p-1 text-xs text-zinc-300 shadow-[rgba(10,10,10,0.5)_0px_1px_4px_0px,rgba(10,10,10,0.1)_0px_2px_4px_0px] space-y-0.5 z-[30002] animate-in fade-in duration-75">
                                {(["left", "center", "right"] as const).map((alignVal) => (
                                    <button
                                        key={alignVal}
                                        type="button"
                                        onClick={() => {
                                            if (onUpdateFormatting) {
                                                onUpdateFormatting({ alignment: alignVal });
                                            }
                                            onClose();
                                        }}
                                        className="flex items-center justify-between w-full h-[33px] px-2 rounded text-left hover:bg-[#25252b] text-zinc-300"
                                    >
                                        <div className="flex items-center gap-2">
                                            {alignment === alignVal ? (
                                                <Check className="w-3.5 h-3.5 text-blue-400" />
                                            ) : (
                                                <span className="w-3.5" />
                                            )}
                                            <span className="text-[12px] capitalize">{alignVal}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Spacing before */}
                        <div
                            onMouseEnter={() => setNestedSubmenu("spacing")}
                            className={`flex items-center justify-between h-[33px] px-2 rounded cursor-pointer transition-colors ${
                                nestedSubmenu === "spacing" ? "bg-[#282830] text-white" : "hover:bg-[#25252b]"
                            }`}
                        >
                            <span className="text-[12px]">Spacing before</span>
                            <ChevronRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                        </div>

                        {/* Nested Submenu: Spacing */}
                        {nestedSubmenu === "spacing" && (
                            <div className="absolute left-full top-[68px] ml-1 w-[160px] bg-[#1d1f21] border border-white/15 rounded-lg p-1 text-xs text-zinc-300 shadow-[rgba(10,10,10,0.5)_0px_1px_4px_0px,rgba(10,10,10,0.1)_0px_2px_4px_0px] space-y-0.5 z-[30002] animate-in fade-in duration-75">
                                {[
                                    { label: "0 lines", value: 0 },
                                    { label: "1 line", value: 1 },
                                    { label: "1½ lines", value: 1.5 },
                                    { label: "2 lines", value: 2 }
                                ].map((sp) => (
                                    <button
                                        key={sp.label}
                                        type="button"
                                        onClick={() => {
                                            if (onUpdateFormatting) {
                                                onUpdateFormatting({ spacingBefore: sp.value });
                                            }
                                            onClose();
                                        }}
                                        className="flex items-center justify-between w-full h-[33px] px-2 rounded text-left hover:bg-[#25252b] text-zinc-300"
                                    >
                                        <div className="flex items-center gap-2">
                                            {spacingBefore === sp.value ? (
                                                <Check className="w-3.5 h-3.5 text-blue-400" />
                                            ) : (
                                                <span className="w-3.5" />
                                            )}
                                            <span className="text-[12px]">{sp.label}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Line Height */}
                        <div
                            onMouseEnter={() => setNestedSubmenu("lineHeight")}
                            className={`flex items-center justify-between h-[33px] px-2 rounded cursor-pointer transition-colors ${
                                nestedSubmenu === "lineHeight" ? "bg-[#282830] text-white" : "hover:bg-[#25252b]"
                            }`}
                        >
                            <span className="text-[12px]">Line Height</span>
                            <ChevronRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                        </div>

                        {/* Nested Submenu: Line Height */}
                        {nestedSubmenu === "lineHeight" && (
                            <div className="absolute left-full top-[102px] ml-1 w-[160px] bg-[#1d1f21] border border-white/15 rounded-lg p-1 text-xs text-zinc-300 shadow-[rgba(10,10,10,0.5)_0px_1px_4px_0px,rgba(10,10,10,0.1)_0px_2px_4px_0px] space-y-0.5 z-[30002] animate-in fade-in duration-75">
                                {[1, 1.25, 1.5, 1.75, 2].map((lh) => (
                                    <button
                                        key={lh}
                                        type="button"
                                        onClick={() => {
                                            if (onUpdateFormatting) {
                                                onUpdateFormatting({ lineHeight: lh });
                                            }
                                            onClose();
                                        }}
                                        className="flex items-center justify-between w-full h-[33px] px-2 rounded text-left hover:bg-[#25252b] text-zinc-300"
                                    >
                                        <div className="flex items-center gap-2">
                                            {lineHeight === lh ? (
                                                <Check className="w-3.5 h-3.5 text-blue-400" />
                                            ) : (
                                                <span className="w-3.5" />
                                            )}
                                            <span className="text-[12px]">{lh}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Divider */}
                <div className="border-t border-white/10 my-1" />

                {/* 4. Read paragraph */}
                <button
                    type="button"
                    onClick={handleReadParagraph}
                    onMouseEnter={() => {
                        setActiveSubmenu("none");
                        setNestedSubmenu("none");
                    }}
                    className="flex items-center justify-between w-full h-[33px] px-2 rounded text-left hover:bg-[#25252b] text-zinc-300 transition-colors"
                >
                    <div className="flex items-center gap-2 min-w-0">
                        <Volume2 className="w-4 h-4 text-zinc-400 shrink-0" />
                        <span className="text-[12px] truncate">{isSpeaking ? "Stop reading" : "Read paragraph"}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-300 bg-[#282a30] leading-none">
                            {altKey}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-300 bg-[#282a30] leading-none">
                            {cmdKey}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-300 bg-[#282a30] leading-none">R</span>
                    </div>
                </button>

                {/* 5. Add beat */}
                <button
                    type="button"
                    onClick={handleAddBeat}
                    onMouseEnter={() => {
                        setActiveSubmenu("none");
                        setNestedSubmenu("none");
                    }}
                    className="flex items-center justify-between w-full h-[33px] px-2 rounded text-left hover:bg-[#25252b] text-zinc-300 transition-colors"
                >
                    <div className="flex items-center gap-2 min-w-0">
                        <Box className="w-4 h-4 text-zinc-400 shrink-0" />
                        <span className="text-[12px] truncate">Add beat</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-300 bg-[#282a30] leading-none">⇧</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-300 bg-[#282a30] leading-none">
                            {cmdKey}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-300 bg-[#282a30] leading-none">B</span>
                    </div>
                </button>

                {/* 6. Comments */}
                <button
                    type="button"
                    onClick={handleOpenComments}
                    onMouseEnter={() => {
                        setActiveSubmenu("none");
                        setNestedSubmenu("none");
                    }}
                    className="flex items-center justify-between w-full h-[33px] px-2 rounded text-left hover:bg-[#25252b] text-zinc-300 transition-colors"
                >
                    <div className="flex items-center gap-2 min-w-0">
                        <MessageSquare className="w-4 h-4 text-zinc-400 shrink-0" />
                        <span className="text-[12px] truncate">Comments</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-300 bg-[#282a30] leading-none">
                            {altKey}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-300 bg-[#282a30] leading-none">
                            {cmdKey}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-300 bg-[#282a30] leading-none">M</span>
                    </div>
                </button>

                {/* 7. Add scene number */}
                <button
                    type="button"
                    onClick={handleAddSceneNumber}
                    onMouseEnter={() => {
                        setActiveSubmenu("none");
                        setNestedSubmenu("none");
                    }}
                    className="flex items-center justify-between w-full h-[33px] px-2 rounded text-left hover:bg-[#25252b] text-zinc-300 transition-colors"
                >
                    <div className="flex items-center gap-2 min-w-0">
                        <Hash className="w-4 h-4 text-zinc-400 shrink-0" />
                        <span className="text-[12px] truncate">Add scene number</span>
                    </div>
                </button>

                {/* 8. Copy text */}
                <button
                    type="button"
                    onClick={handleCopyText}
                    onMouseEnter={() => {
                        setActiveSubmenu("none");
                        setNestedSubmenu("none");
                    }}
                    className="flex items-center justify-between w-full h-[33px] px-2 rounded text-left hover:bg-[#25252b] text-zinc-300 transition-colors"
                >
                    <div className="flex items-center gap-2 min-w-0">
                        {copiedText ? (
                            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                            <Copy className="w-4 h-4 text-zinc-400 shrink-0" />
                        )}
                        <span className="text-[12px] truncate">{copiedText ? "Copied!" : "Copy"}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-300 bg-[#282a30] leading-none">
                            {cmdKey}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-300 bg-[#282a30] leading-none">C</span>
                    </div>
                </button>

                {/* 9. Copy link */}
                <button
                    type="button"
                    onClick={handleCopyLink}
                    onMouseEnter={() => {
                        setActiveSubmenu("none");
                        setNestedSubmenu("none");
                    }}
                    className="flex items-center justify-between w-full h-[33px] px-2 rounded text-left hover:bg-[#25252b] text-zinc-300 transition-colors"
                >
                    <div className="flex items-center gap-2 min-w-0">
                        {copiedLink ? (
                            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                            <Link2 className="w-4 h-4 text-zinc-400 shrink-0" />
                        )}
                        <span className="text-[12px] truncate">{copiedLink ? "Link copied!" : "Copy link"}</span>
                    </div>
                </button>
            </div>
        </div>
    );
}
