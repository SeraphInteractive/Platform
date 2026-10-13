"use client";

import React, { useState } from "react";
import {
  Archive,
  Pin,
  PinOff,
  Plus,
  Trash2,
  CornerDownLeft,
  Copy,
  Check,
  Search,
  X
} from "lucide-react";

export interface StashItem {
  id: string;
  title: string;
  text: string;
  type: "dialogue" | "action" | "sceneHeading" | "character" | "note";
  createdAt: string;
  characterName?: string;
}

interface ScriptStashProps {
  items: StashItem[];
  isOpen: boolean;
  onClose: () => void;
  isPinned: boolean;
  onTogglePin: () => void;
  onRestore: (item: StashItem) => void;
  onDelete: (id: string) => void;
  onAddManualNote: (title: string, text: string) => void;
}

export function ScriptStash({
  items,
  isOpen,
  onClose,
  isPinned,
  onTogglePin,
  onRestore,
  onDelete,
  onAddManualNote
}: ScriptStashProps) {
  const [filterQuery, setFilterQuery] = useState("");
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newText, setNewText] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!isOpen && !isPinned) {
    return null;
  }

  const filteredItems = items.filter((item) => {
    if (!filterQuery.trim()) return true;
    const q = filterQuery.toLowerCase();
    return (
      item.title.toLowerCase().includes(q) ||
      item.text.toLowerCase().includes(q) ||
      item.characterName?.toLowerCase().includes(q)
    );
  });

  const handleCopy = (id: string, text: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    }
  };

  const handleCreateNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim()) return;
    onAddManualNote(newTitle.trim() || "Scratchpad Note", newText.trim());
    setNewTitle("");
    setNewText("");
    setIsAddingNote(false);
  };

  return (
    <aside className="no-print w-80 bg-[#12141a] border-l border-[#262933] flex flex-col h-[calc(100vh-46px)] shrink-0 select-none z-20">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#262933] bg-[#0e1015]">
        <div className="flex items-center gap-2">
          <Archive className="w-4 h-4 text-blue-400" />
          <span className="font-semibold text-xs text-slate-100 tracking-wide uppercase">
            The Stash
          </span>
          <span className="px-1.5 py-0.5 rounded-full bg-[#1e222d] text-[10px] font-mono text-slate-400">
            {items.length}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onTogglePin}
            className={`p-1 rounded transition-colors ${
              isPinned
                ? "bg-blue-600/20 text-blue-400"
                : "text-slate-400 hover:text-slate-200 hover:bg-[#1a1d26]"
            }`}
            title={isPinned ? "Unpin Stash sidebar" : "Pin Stash sidebar"}
          >
            {isPinned ? <Pin className="w-3.5 h-3.5" /> : <PinOff className="w-3.5 h-3.5" />}
          </button>
          {!isPinned && (
            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-200 hover:bg-[#1a1d26] rounded transition-colors"
              title="Close Stash"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Action bar & Search */}
      <div className="p-2.5 border-b border-[#262933] space-y-2 bg-[#12141a]">
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <Search className="w-3 h-3 text-slate-500 absolute left-2 top-2" />
            <input
              type="text"
              placeholder="Search stashed cuts..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="w-full bg-[#0e1015] border border-[#262933] rounded px-2 py-1 pl-6 text-[11px] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>
          <button
            onClick={() => setIsAddingNote(!isAddingNote)}
            className="p-1.5 bg-[#1e222d] hover:bg-[#282d3d] border border-[#262933] rounded text-slate-300 hover:text-white transition-colors"
            title="Add scratch note"
          >
            <Plus className="w-3.5 h-3.5 text-blue-400" />
          </button>
        </div>

        {/* Manual note creator */}
        {isAddingNote && (
          <form onSubmit={handleCreateNote} className="p-2 bg-[#0e1015] border border-[#262933] rounded space-y-2">
            <input
              type="text"
              placeholder="Note title (e.g. Alt Ending, Dialogue Idea)"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full bg-[#161820] border border-[#262933] rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
            />
            <textarea
              placeholder="Write cut prose or alternate dialogue..."
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              rows={3}
              className="w-full bg-[#161820] border border-[#262933] rounded px-2 py-1 text-xs text-slate-200 font-mono focus:outline-none focus:border-blue-500 resize-none"
            />
            <div className="flex items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setIsAddingNote(false)}
                className="px-2 py-1 text-[11px] text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-[11px] font-medium"
              >
                Save to Stash
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Stash Items List */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
        {filteredItems.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs px-4">
            <Archive className="w-8 h-8 mx-auto mb-2 opacity-30 text-slate-400" />
            <p className="font-semibold text-slate-400">Your Stash is empty</p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              Cut dialogue or scenes without losing them permanently. Highlight any text and press{" "}
              <kbd className="px-1 py-0.5 bg-[#1e222d] border border-[#262933] rounded text-[10px] font-mono text-slate-300">
                Alt+Backspace
              </kbd>{" "}
              to stash it here.
            </p>
          </div>
        ) : (
          filteredItems.map((item) => (
            <div
              key={item.id}
              className="group p-2.5 bg-[#161820] hover:bg-[#1a1d26] border border-[#262933] hover:border-[#383d4e] rounded transition-all shadow-xs"
            >
              <div className="flex items-center justify-between gap-1 mb-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider ${
                      item.type === "dialogue"
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : item.type === "character"
                        ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                        : item.type === "sceneHeading"
                        ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                        : "bg-slate-500/10 text-slate-400 border border-slate-500/20"
                    }`}
                  >
                    {item.characterName ? item.characterName : item.type}
                  </span>
                  <span className="text-[11px] font-medium text-slate-200 truncate">
                    {item.title}
                  </span>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleCopy(item.id, item.text)}
                    className="p-1 hover:bg-[#282d3d] rounded text-slate-400 hover:text-slate-200"
                    title="Copy text"
                  >
                    {copiedId === item.id ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                  <button
                    onClick={() => onDelete(item.id)}
                    className="p-1 hover:bg-red-500/10 rounded text-slate-400 hover:text-red-400"
                    title="Delete permanently"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Text Snippet */}
              <div className="font-mono text-[11px] text-slate-300 leading-relaxed bg-[#0e1015]/60 p-2 rounded border border-[#20242f] max-h-28 overflow-hidden relative">
                {item.text}
                <div className="absolute inset-x-0 bottom-0 h-4 bg-gradient-to-t from-[#0e1015]/90 to-transparent pointer-events-none" />
              </div>

              {/* Restore action bar */}
              <div className="mt-2 pt-2 border-t border-[#20242f] flex items-center justify-between text-[10px] text-slate-500">
                <span>{item.createdAt}</span>
                <button
                  onClick={() => onRestore(item)}
                  className="flex items-center gap-1 px-2 py-0.5 bg-[#1e222d] hover:bg-blue-600 text-slate-300 hover:text-white rounded border border-[#282d3d] hover:border-blue-500 transition-colors font-medium"
                  title="Insert back into script at cursor position"
                >
                  <CornerDownLeft className="w-3 h-3" />
                  <span>Insert at Cursor</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
