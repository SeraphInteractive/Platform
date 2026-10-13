"use client";

import React, { useState } from "react";
import type { Editor } from "@tiptap/react";
import { ChevronUp } from "lucide-react";
import { ArcElementMenu } from "./ArcElementMenu";

interface FloatingElementPillProps {
    editor: Editor | null;
    onStashSelection?: () => void;
    hasSelection?: boolean;
}

const ELEMENT_INFO: Record<string, { label: string; nextEnter: string; nextTab: string; color: string; dotColor: string }> = {
    sceneHeading: {
        label: "Scene Heading",
        nextEnter: "Action",
        nextTab: "Action",
        color: "text-cyan-400",
        dotColor: "bg-cyan-400"
    },
    action: {
        label: "Action",
        nextEnter: "Action",
        nextTab: "Character",
        color: "text-slate-300",
        dotColor: "bg-slate-400"
    },
    character: {
        label: "Character",
        nextEnter: "Dialogue",
        nextTab: "Transition",
        color: "text-amber-400",
        dotColor: "bg-amber-400"
    },
    parenthetical: {
        label: "Parenthetical",
        nextEnter: "Dialogue",
        nextTab: "Dialogue",
        color: "text-slate-400",
        dotColor: "bg-slate-400"
    },
    dialogue: {
        label: "Dialogue",
        nextEnter: "Action",
        nextTab: "Parenthetical",
        color: "text-emerald-400",
        dotColor: "bg-emerald-400"
    },
    transition: {
        label: "Transition",
        nextEnter: "Scene Heading",
        nextTab: "Scene Heading",
        color: "text-purple-400",
        dotColor: "bg-purple-400"
    }
};

export function FloatingElementPill({ editor, onStashSelection, hasSelection }: FloatingElementPillProps) {
    const [menuOpen, setMenuOpen] = useState(false);
    if (!editor) return null;

    const currentType = editor.state.selection.$from.parent.type.name;
    const info = ELEMENT_INFO[currentType] || {
        label: currentType,
        nextEnter: "Next",
        nextTab: "Tab",
        color: "text-slate-300",
        dotColor: "bg-blue-400"
    };

    return (
        <div className="no-print fixed bottom-4 left-6 z-30 flex items-center gap-2 select-none">
            <div className="relative">
                <button
                    onClick={() => setMenuOpen(!menuOpen)}
                    className="flex items-center gap-2 px-3.5 py-1.5 bg-[#12141a]/90 hover:bg-[#181a22] border border-[#262933] rounded-full shadow-2xl text-xs font-mono backdrop-blur-md transition-colors"
                    title="Click to switch screenplay element"
                >
                    <span className={`w-2 h-2 rounded-full ${info.dotColor} animate-pulse`} />
                    <span className={`font-bold uppercase tracking-wider ${info.color}`}>{info.label}</span>
                    <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
                </button>

                <ArcElementMenu editor={editor} isOpen={menuOpen} onClose={() => setMenuOpen(false)} align="pill" />
            </div>

            {/* Keyboard Flow Guide */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-[#12141a]/80 border border-[#262933] rounded-full text-[10px] font-mono text-slate-400 backdrop-blur-md">
                <span>
                    Enter: <strong className="text-slate-200">{info.nextEnter}</strong>
                </span>
                <span className="text-slate-600">|</span>
                <span>
                    Tab: <strong className="text-slate-200">{info.nextTab}</strong>
                </span>
            </div>

            {/* Quick Stash Selection button */}
            {hasSelection && onStashSelection && (
                <button
                    onClick={onStashSelection}
                    className="flex items-center gap-1.5 px-3 py-1 bg-blue-600/90 hover:bg-blue-600 border border-blue-500/50 rounded-full text-[10px] font-mono text-white shadow-lg backdrop-blur-md transition-colors"
                    title="Stash selected text (Alt+Backspace)"
                >
                    <span>Stash Selection</span>
                    <span className="opacity-70 text-[9px]">(Alt+Bksp)</span>
                </button>
            )}
        </div>
    );
}
