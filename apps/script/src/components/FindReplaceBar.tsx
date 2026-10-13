"use client";

import React, { useState } from "react";
import type { Editor } from "@tiptap/react";
import { Search, Replace, ChevronDown, ChevronUp, X } from "lucide-react";

interface FindReplaceBarProps {
  editor: Editor | null;
  isOpen: boolean;
  onClose: () => void;
  drawerOffset?: boolean;
}

export function FindReplaceBar({ editor, isOpen, onClose, drawerOffset = false }: FindReplaceBarProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [replaceTerm, setReplaceTerm] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [resultCount, setResultCount] = useState<number | null>(null);

  if (!isOpen || !editor) return null;

  const handleSearch = () => {
    if (!searchTerm.trim()) {
      setResultCount(null);
      return;
    }

    let count = 0;
    const docText = editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n");
    const flags = matchCase ? "g" : "gi";
    const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);
    const matches = docText.match(regex);
    count = matches ? matches.length : 0;
    setResultCount(count);

    // select first occurrence if found
    if (count > 0) {
      let foundPos = -1;
      editor.state.doc.descendants((node, pos) => {
        if (foundPos !== -1 || !node.isText) return;
        const text = node.text || "";
        const idx = matchCase ? text.indexOf(searchTerm) : text.toLowerCase().indexOf(searchTerm.toLowerCase());
        if (idx !== -1) {
          foundPos = pos + idx;
        }
      });

      if (foundPos !== -1) {
        editor.chain().focus().setTextSelection({ from: foundPos, to: foundPos + searchTerm.length }).run();
      }
    }
  };

  const handleReplaceCurrent = () => {
    if (!searchTerm.trim()) return;
    const { selection } = editor.state;
    const selectedText = editor.state.doc.textBetween(selection.from, selection.to);

    const matches = matchCase
      ? selectedText === searchTerm
      : selectedText.toLowerCase() === searchTerm.toLowerCase();

    if (matches) {
      editor.chain().focus().insertContentAt({ from: selection.from, to: selection.to }, replaceTerm).run();
      handleSearch();
    } else {
      handleSearch();
    }
  };

  const handleReplaceAll = () => {
    if (!searchTerm.trim()) return;
    const json = editor.getJSON();

    const replaceInNode = (node: any) => {
      if (node.text && typeof node.text === "string") {
        const flags = matchCase ? "g" : "gi";
        const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);
        node.text = node.text.replace(regex, replaceTerm);
      }
      if (node.content && Array.isArray(node.content)) {
        node.content.forEach(replaceInNode);
      }
    };

    replaceInNode(json);
    editor.commands.setContent(json);
    setResultCount(0);
  };

  return (
    <div
      className={`no-print absolute top-14 ${
        drawerOffset ? "right-84" : "right-6"
      } z-30 flex items-center gap-2 p-2.5 bg-[#141620] border border-[#262938] rounded-lg shadow-2xl text-xs text-slate-200 animate-in fade-in slide-in-from-top-2`}
    >
      <div className="flex items-center gap-1.5 bg-[#0d0f15] px-2 py-1 rounded border border-[#262938]">
        <Search className="w-3.5 h-3.5 text-slate-400" />
        <input
          id="searchTerm"
          name="searchTerm"
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="Find text..."
          className="bg-transparent text-slate-100 placeholder-slate-500 focus:outline-none w-36 text-xs"
        />
        {resultCount !== null && (
          <span className="text-[10px] font-mono text-slate-400">
            {resultCount} found
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 bg-[#0d0f15] px-2 py-1 rounded border border-[#262938]">
        <Replace className="w-3.5 h-3.5 text-slate-400" />
        <input
          id="replaceTerm"
          name="replaceTerm"
          type="text"
          value={replaceTerm}
          onChange={(e) => setReplaceTerm(e.target.value)}
          placeholder="Replace with..."
          className="bg-transparent text-slate-100 placeholder-slate-500 focus:outline-none w-36 text-xs"
        />
      </div>

      <button
        onClick={() => setMatchCase(!matchCase)}
        className={`px-2 py-1 rounded text-[10px] font-mono transition-colors ${
          matchCase ? "bg-slate-200 text-slate-900 font-bold" : "text-slate-400 hover:text-slate-200 bg-[#1c1f2b]"
        }`}
        title="Match Case"
      >
        Aa
      </button>

      <button
        onClick={handleSearch}
        className="px-2.5 py-1 bg-[#1c1f2b] hover:bg-[#252a3a] text-slate-200 rounded font-medium transition-colors"
      >
        Find
      </button>

      <button
        onClick={handleReplaceCurrent}
        className="px-2.5 py-1 bg-[#1c1f2b] hover:bg-[#252a3a] text-slate-200 rounded font-medium transition-colors"
      >
        Replace
      </button>

      <button
        onClick={handleReplaceAll}
        className="px-2.5 py-1 bg-slate-200 hover:bg-white text-slate-900 rounded font-semibold transition-colors"
      >
        All
      </button>

      <button
        onClick={onClose}
        className="p-1 text-slate-400 hover:text-slate-200 rounded ml-1"
        title="Close (ESC)"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
