"use client";

import React, { useState } from "react";
import type { Editor } from "@tiptap/react";
import {
    Undo2,
    Redo2,
    Columns2,
    Type,
    Bold,
    Italic,
    Underline,
    Strikethrough,
    Pencil,
    Paintbrush,
    ImagePlus,
    Copy,
    Layers,
    MessageSquare,
    ChevronUp,
    SeparatorHorizontal,
    Sun,
    Moon,
    Image,
    User,
    Parentheses,
    MessageCircleMore,
    Video
} from "lucide-react";
import { ArcElementMenu, SCREENPLAY_ELEMENT_ITEMS } from "./ArcElementMenu";

interface ArcShortcutDockProps {
    editor: Editor | null;
    onTogglePageView?: () => void;
    isPageView?: boolean;
    pageTheme?: "dark" | "light";
    onTogglePageTheme?: () => void;
    onOpenImageModal?: () => void;
    onStashSelection?: () => void;
    onTogglePlotBoard?: () => void;
    onToggleStash?: () => void;
}

export function ArcShortcutDock({
    editor,
    onTogglePageView,
    isPageView,
    pageTheme = "dark",
    onTogglePageTheme,
    onOpenImageModal,
    onStashSelection,
    onTogglePlotBoard,
    onToggleStash
}: ArcShortcutDockProps) {
    const [showElementMenu, setShowElementMenu] = useState(false);

    if (!editor) return null;

    const currentType = editor.state.selection.$from.parent.type.name;
    const isBold = editor.isActive("bold");
    const isItalic = editor.isActive("italic");
    const isUnderline = editor.isActive("underline");
    const isStrike = editor.isActive("strike");
    const isHighlight = editor.isActive("highlight");

    // dynamically map element type to icon matching arc studio dock
    const currentItem = SCREENPLAY_ELEMENT_ITEMS.find((item) => item.id === currentType);
    const CurrentElementIcon = currentItem?.icon || Type;

    const setElementType = (type: string) => {
        editor.chain().focus().setNode(type).run();
        setShowElementMenu(false);
    };

    // transform selected text uppercase or lowercase
    const handleToggleCase = () => {
        const { from, to, empty } = editor.state.selection;
        if (empty) return;
        const text = editor.state.doc.textBetween(from, to, " ");
        const isUpper = text === text.toUpperCase();
        const newText = isUpper ? text.toLowerCase() : text.toUpperCase();
        editor.chain().focus().insertContentAt({ from, to }, newText).run();
    };

    // clear marks formatting
    const handleClearFormat = () => {
        editor.chain().focus().unsetAllMarks().run();
    };

    return (
        <div className="no-print fixed bottom-6 left-1/2 -translate-x-1/2 z-40 select-none">
            <div className="relative">
                {/* Arc Studio Screenplay Element Menu (Exact replica) */}
                <ArcElementMenu editor={editor} isOpen={showElementMenu} onClose={() => setShowElementMenu(false)} align="dock" />

                {/* Arc Studio Floating Shortcut Capsule */}
                <div className="flex items-center gap-0.5 px-2 py-1.5 bg-[#16171a]/98 border border-[#33353a] rounded-2xl shadow-2xl shadow-black/80 backdrop-blur-md text-zinc-400">
                    {/* Group 1: History */}
                    <button
                        onClick={() => editor.chain().focus().undo().run()}
                        disabled={!editor.can().undo()}
                        className="p-1.5 hover:text-zinc-100 hover:bg-[#25262a] disabled:opacity-30 rounded-lg transition-colors"
                        title="Undo (Cmd+Z)"
                    >
                        <Undo2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={() => editor.chain().focus().redo().run()}
                        disabled={!editor.can().redo()}
                        className="p-1.5 hover:text-zinc-100 hover:bg-[#25262a] disabled:opacity-30 rounded-lg transition-colors"
                        title="Redo (Cmd+Shift+Z)"
                    >
                        <Redo2 className="w-3.5 h-3.5" />
                    </button>

                    <div className="w-px h-3.5 bg-[#33353a] mx-1" />

                    {/* Group 2: View / Page Toggle, Page Theme & Page Break */}
                    {onTogglePageView && (
                        <button
                            onClick={onTogglePageView}
                            className={`p-1.5 rounded-lg transition-colors ${
                                isPageView ? "text-zinc-100 bg-[#25262a]" : "hover:text-zinc-100 hover:bg-[#25262a]"
                            }`}
                            title={isPageView ? "Switch to Continuous View" : "Switch to Page View"}
                        >
                            <Columns2 className="w-3.5 h-3.5" />
                        </button>
                    )}

                    {onTogglePageTheme && (
                        <button
                            onClick={onTogglePageTheme}
                            className={`p-1.5 rounded-lg transition-colors ${
                                pageTheme === "light" ? "text-amber-400 bg-[#25262a]" : "hover:text-zinc-100 hover:bg-[#25262a]"
                            }`}
                            title={pageTheme === "light" ? "Switch to Dark Page Theme" : "Switch to Light Page Theme"}
                        >
                            {pageTheme === "light" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                        </button>
                    )}

                    <button
                        onClick={() => editor.chain().focus().setPageBreak().run()}
                        className="p-1.5 hover:text-zinc-100 hover:bg-[#25262a] rounded-lg transition-colors"
                        title="Insert Page Break (Cmd+Enter)"
                    >
                        <SeparatorHorizontal className="w-3.5 h-3.5" />
                    </button>

                    {/* Group 3: Element Formatter Dropdown */}
                    <button
                        onClick={() => setShowElementMenu(!showElementMenu)}
                        className={`flex items-center gap-1 px-1.5 py-1 rounded-lg transition-colors ${
                            showElementMenu ? "bg-[#25262a] text-white" : "hover:text-zinc-100 hover:bg-[#25262a]"
                        }`}
                        title="Screenplay Elements (Cmd+1..6)"
                    >
                        <CurrentElementIcon className="w-3.5 h-3.5 text-zinc-300" />
                        <ChevronUp className="w-2.5 h-2.5 text-zinc-500" />
                    </button>

                    <div className="w-px h-3.5 bg-[#33353a] mx-1" />

                    {/* Group 4: Rich Text Marks */}
                    <button
                        onClick={() => editor.chain().focus().toggleBold().run()}
                        className={`p-1.5 rounded-lg font-bold text-xs transition-colors ${
                            isBold ? "bg-[#4c8aec]/20 text-[#60a5fa] font-semibold" : "hover:text-zinc-100 hover:bg-[#25262a]"
                        }`}
                        title="Bold (Cmd+B)"
                    >
                        <Bold className="w-3.5 h-3.5" />
                    </button>

                    <button
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                        className={`p-1.5 rounded-lg text-xs transition-colors ${
                            isItalic ? "bg-[#4c8aec]/20 text-[#60a5fa]" : "hover:text-zinc-100 hover:bg-[#25262a]"
                        }`}
                        title="Italic (Cmd+I)"
                    >
                        <Italic className="w-3.5 h-3.5" />
                    </button>

                    <button
                        onClick={() => editor.chain().focus().toggleUnderline().run()}
                        className={`p-1.5 rounded-lg text-xs transition-colors ${
                            isUnderline ? "bg-[#4c8aec]/20 text-[#60a5fa]" : "hover:text-zinc-100 hover:bg-[#25262a]"
                        }`}
                        title="Underline (Cmd+U)"
                    >
                        <Underline className="w-3.5 h-3.5" />
                    </button>

                    <button
                        onClick={() => editor.chain().focus().toggleStrike().run()}
                        className={`p-1.5 rounded-lg text-xs transition-colors ${
                            isStrike ? "bg-[#4c8aec]/20 text-[#60a5fa]" : "hover:text-zinc-100 hover:bg-[#25262a]"
                        }`}
                        title="Strikethrough"
                    >
                        <Strikethrough className="w-3.5 h-3.5" />
                    </button>

                    <button
                        onClick={handleToggleCase}
                        className="px-1.5 py-1 rounded-lg font-mono font-bold text-[11px] hover:text-zinc-100 hover:bg-[#25262a] transition-colors"
                        title="Toggle Case (Uppercase / lowercase)"
                    >
                        Aa
                    </button>

                    <button
                        onClick={() => editor.chain().focus().toggleHighlight().run()}
                        className={`p-1.5 rounded-lg transition-colors ${
                            isHighlight ? "bg-amber-500/20 text-amber-300" : "hover:text-zinc-100 hover:bg-[#25262a]"
                        }`}
                        title="Highlighter"
                    >
                        <Pencil className="w-3.5 h-3.5" />
                    </button>

                    <button
                        onClick={handleClearFormat}
                        className="p-1.5 hover:text-zinc-100 hover:bg-[#25262a] rounded-lg transition-colors"
                        title="Clear Formatting"
                    >
                        <Paintbrush className="w-3.5 h-3.5" />
                    </button>

                    <div className="w-px h-3.5 bg-[#33353a] mx-1" />

                    {/* Group 5: Embed Storyboard Still */}
                    {onOpenImageModal && (
                        <button
                            onClick={onOpenImageModal}
                            className="p-1.5 hover:text-[#4c8aec] hover:bg-[#25262a] rounded-lg transition-colors"
                            title="Embed Storyboard Still"
                        >
                            <ImagePlus className="w-3.5 h-3.5" />
                        </button>
                    )}

                    <div className="w-px h-3.5 bg-[#33353a] mx-1" />

                    {/* Group 6: Stash, Layers, Comments */}
                    {onStashSelection && (
                        <button
                            onClick={onStashSelection}
                            className="p-1.5 hover:text-zinc-100 hover:bg-[#25262a] rounded-lg transition-colors"
                            title="Cut & Send to Stash (Alt+Backspace)"
                        >
                            <Copy className="w-3.5 h-3.5" />
                        </button>
                    )}

                    {onTogglePlotBoard && (
                        <button
                            onClick={onTogglePlotBoard}
                            className="p-1.5 hover:text-zinc-100 hover:bg-[#25262a] rounded-lg transition-colors"
                            title="Plot Board"
                        >
                            <Layers className="w-3.5 h-3.5" />
                        </button>
                    )}

                    {onToggleStash && (
                        <button
                            onClick={onToggleStash}
                            className="p-1.5 hover:text-zinc-100 hover:bg-[#25262a] rounded-lg transition-colors"
                            title="The Stash & Notes"
                        >
                            <MessageSquare className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
