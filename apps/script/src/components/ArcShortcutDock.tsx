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
  Film,
  Activity,
  User,
  Code,
  MessageSquareQuote,
  Video,
  Flag
} from "lucide-react";
import { ArcFormattingMenu } from "./ArcFormattingMenu";

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

const SCREENPLAY_ELEMENTS = [
  { id: "sceneHeading", label: "Scene Heading", key: "Cmd+1" },
  { id: "action", label: "Action", key: "Cmd+2" },
  { id: "character", label: "Character", key: "Cmd+3" },
  { id: "dialogue", label: "Dialogue", key: "Cmd+4" },
  { id: "parenthetical", label: "Parenthetical", key: "Cmd+5" },
  { id: "transition", label: "Transition", key: "Cmd+6" }
];

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
  const elementIcons: Record<string, React.ComponentType<{ className?: string }>> = {
    sceneHeading: Film,
    action: Activity,
    character: User,
    parenthetical: Code,
    dialogue: MessageSquareQuote,
    shot: Video,
    transition: Flag
  };
  const CurrentElementIcon = elementIcons[currentType] || Type;

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
        {/* Arc Studio Formatting Menu (Exact replica) */}
        <ArcFormattingMenu
          editor={editor}
          isOpen={showElementMenu}
          onClose={() => setShowElementMenu(false)}
          onOpenBeatBoard={onTogglePlotBoard}
          onOpenComments={onToggleStash}
          align="dock"
        />

        {/* Arc Studio Floating Shortcut Capsule */}
        <div className="flex items-center gap-0.5 px-2 py-1.5 bg-[#18181b]/98 border border-[#28282e] rounded-2xl shadow-2xl shadow-black/80 backdrop-blur-md text-zinc-400">
          {/* Group 1: History */}
          <button
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            className="p-1.5 hover:text-zinc-100 hover:bg-[#252529] disabled:opacity-30 rounded-lg transition-colors"
            title="Undo (Cmd+Z)"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            className="p-1.5 hover:text-zinc-100 hover:bg-[#252529] disabled:opacity-30 rounded-lg transition-colors"
            title="Redo (Cmd+Shift+Z)"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-3.5 bg-[#28282e] mx-1" />

          {/* Group 2: View / Page Toggle, Page Theme & Page Break */}
          {onTogglePageView && (
            <button
              onClick={onTogglePageView}
              className={`p-1.5 rounded-lg transition-colors ${
                isPageView
                  ? "text-zinc-100 bg-[#252529]"
                  : "hover:text-zinc-100 hover:bg-[#252529]"
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
                pageTheme === "light"
                  ? "text-amber-400 bg-[#252529]"
                  : "hover:text-zinc-100 hover:bg-[#252529]"
              }`}
              title={pageTheme === "light" ? "Switch to Dark Page Theme" : "Switch to Light Page Theme"}
            >
              {pageTheme === "light" ? (
                <Sun className="w-3.5 h-3.5" />
              ) : (
                <Moon className="w-3.5 h-3.5" />
              )}
            </button>
          )}

          <button
            onClick={() => editor.chain().focus().setPageBreak().run()}
            className="p-1.5 hover:text-zinc-100 hover:bg-[#252529] rounded-lg transition-colors"
            title="Insert Page Break (Cmd+Enter)"
          >
            <SeparatorHorizontal className="w-3.5 h-3.5" />
          </button>

          {/* Group 3: Element Formatter Dropdown */}
          <button
            onClick={() => setShowElementMenu(!showElementMenu)}
            className={`flex items-center gap-1 px-1.5 py-1 rounded-lg transition-colors ${
              showElementMenu
                ? "bg-[#252529] text-white"
                : "hover:text-zinc-100 hover:bg-[#252529]"
            }`}
            title="Screenplay Elements (Cmd+1..6)"
          >
            <CurrentElementIcon className="w-3.5 h-3.5 text-zinc-300" />
            <ChevronUp className="w-2.5 h-2.5 text-zinc-500" />
          </button>

          <div className="w-px h-3.5 bg-[#28282e] mx-1" />

          {/* Group 4: Rich Text Marks */}
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`p-1.5 rounded-lg font-bold text-xs transition-colors ${
              isBold ? "bg-[#6366f1]/20 text-[#818cf8] font-semibold" : "hover:text-zinc-100 hover:bg-[#252529]"
            }`}
            title="Bold (Cmd+B)"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`p-1.5 rounded-lg text-xs transition-colors ${
              isItalic ? "bg-[#6366f1]/20 text-[#818cf8]" : "hover:text-zinc-100 hover:bg-[#252529]"
            }`}
            title="Italic (Cmd+I)"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={`p-1.5 rounded-lg text-xs transition-colors ${
              isUnderline ? "bg-[#6366f1]/20 text-[#818cf8]" : "hover:text-zinc-100 hover:bg-[#252529]"
            }`}
            title="Underline (Cmd+U)"
          >
            <Underline className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className={`p-1.5 rounded-lg text-xs transition-colors ${
              isStrike ? "bg-[#6366f1]/20 text-[#818cf8]" : "hover:text-zinc-100 hover:bg-[#252529]"
            }`}
            title="Strikethrough"
          >
            <Strikethrough className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleToggleCase}
            className="px-1.5 py-1 rounded-lg font-mono font-bold text-[11px] hover:text-zinc-100 hover:bg-[#252529] transition-colors"
            title="Toggle Case (Uppercase / lowercase)"
          >
            Aa
          </button>

          <button
            onClick={() => editor.chain().focus().toggleHighlight().run()}
            className={`p-1.5 rounded-lg transition-colors ${
              isHighlight ? "bg-amber-500/20 text-amber-300" : "hover:text-zinc-100 hover:bg-[#252529]"
            }`}
            title="Highlighter"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleClearFormat}
            className="p-1.5 hover:text-zinc-100 hover:bg-[#252529] rounded-lg transition-colors"
            title="Clear Formatting"
          >
            <Paintbrush className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-3.5 bg-[#28282e] mx-1" />

          {/* Group 5: Embed Storyboard Still */}
          {onOpenImageModal && (
            <button
              onClick={onOpenImageModal}
              className="p-1.5 hover:text-indigo-400 hover:bg-[#252529] rounded-lg transition-colors"
              title="Embed Storyboard Still"
            >
              <ImagePlus className="w-3.5 h-3.5" />
            </button>
          )}

          <div className="w-px h-3.5 bg-[#28282e] mx-1" />

          {/* Group 6: Stash, Layers, Comments */}
          {onStashSelection && (
            <button
              onClick={onStashSelection}
              className="p-1.5 hover:text-zinc-100 hover:bg-[#252529] rounded-lg transition-colors"
              title="Cut & Send to Stash (Alt+Backspace)"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          )}

          {onTogglePlotBoard && (
            <button
              onClick={onTogglePlotBoard}
              className="p-1.5 hover:text-zinc-100 hover:bg-[#252529] rounded-lg transition-colors"
              title="Plot Board"
            >
              <Layers className="w-3.5 h-3.5" />
            </button>
          )}

          {onToggleStash && (
            <button
              onClick={onToggleStash}
              className="p-1.5 hover:text-zinc-100 hover:bg-[#252529] rounded-lg transition-colors"
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
