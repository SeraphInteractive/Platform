"use client";

import React, { useEffect, useRef } from "react";

interface AutocompleteMenuProps {
  suggestions: string[];
  isOpen: boolean;
  selectedIndex: number;
  position: { top: number; left: number } | null;
  onSelect: (item: string) => void;
  onHover: (index: number) => void;
  title: string;
}

export function AutocompleteMenu({
  suggestions,
  isOpen,
  selectedIndex,
  position,
  onSelect,
  onHover,
  title
}: AutocompleteMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // keep selected item scrolled into view
  useEffect(() => {
    if (!menuRef.current) return;
    const items = menuRef.current.querySelectorAll("[data-suggestion-item]");
    const active = items[selectedIndex] as HTMLElement | undefined;
    if (active) {
      active.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (!isOpen || suggestions.length === 0 || !position) return null;

  // clamp position within viewport
  const top = Math.min(position.top, typeof window !== "undefined" ? window.innerHeight - 240 : position.top);
  const left = Math.min(position.left, typeof window !== "undefined" ? window.innerWidth - 280 : position.left);

  return (
    <div
      ref={menuRef}
      style={{ top: `${top}px`, left: `${left}px` }}
      className="no-print fixed z-50 w-64 bg-[#141624]/95 border border-[#2b2f44] rounded-lg shadow-2xl shadow-black/90 backdrop-blur-md overflow-hidden text-xs animate-in fade-in duration-75 select-none"
    >
      <div className="px-3 py-1.5 bg-[#10121c] border-b border-[#242738] text-[10px] font-mono uppercase text-slate-400 tracking-wider flex items-center justify-between">
        <span>{title}</span>
        <span className="text-[9px] text-slate-500 font-mono">Tab / Enter</span>
      </div>

      <div className="max-h-52 overflow-y-auto p-1 space-y-0.5">
        {suggestions.map((item, index) => {
          const isSelected = index === selectedIndex;
          return (
            <button
              key={`${item}-${index}`}
              data-suggestion-item
              type="button"
              onMouseEnter={() => onHover(index)}
              onClick={() => onSelect(item)}
              className={`w-full text-left px-2.5 py-1.5 rounded transition-colors flex items-center justify-between text-xs font-mono uppercase ${
                isSelected
                  ? "bg-indigo-600/30 text-white font-semibold border-l-2 border-indigo-400 pl-2"
                  : "text-slate-300 hover:bg-[#1a1d2e] pl-2.5"
              }`}
              style={{ fontFamily: "var(--courier-font)" }}
            >
              <span className="truncate">{item}</span>
              {isSelected && (
                <span className="text-[9px] text-indigo-300 font-sans normal-case tracking-normal shrink-0">
                  Select
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
