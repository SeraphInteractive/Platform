"use client";

import React, { useEffect, useRef } from "react";

interface AutocompleteMenuProps {
    suggestions: string[];
    isOpen: boolean;
    selectedIndex: number;
    position: { top: number; left: number } | null;
    onSelect: (item: string) => void;
    onHover: (index: number) => void;
    onClose?: () => void;
    title: string;
}

export function AutocompleteMenu({
    suggestions,
    isOpen,
    selectedIndex,
    position,
    onSelect,
    onHover,
    onClose,
    title
}: AutocompleteMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);

    // auto-dismiss menu when viewport moves or user clicks outside
    useEffect(() => {
        if (!isOpen) return;

        const handleMouseDown = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose?.();
            }
        };

        const handleDismiss = () => {
            onClose?.();
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onClose?.();
            }
        };

        document.addEventListener("mousedown", handleMouseDown, true);
        window.addEventListener("scroll", handleDismiss, true);
        window.addEventListener("resize", handleDismiss);
        window.addEventListener("keydown", handleKeyDown);

        return () => {
            document.removeEventListener("mousedown", handleMouseDown, true);
            window.removeEventListener("scroll", handleDismiss, true);
            window.removeEventListener("resize", handleDismiss);
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [isOpen, onClose]);

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
    const left = Math.min(position.left, typeof window !== "undefined" ? window.innerWidth - 260 : position.left);

    return (
        <div
            ref={menuRef}
            style={{ top: `${top}px`, left: `${left}px` }}
            className="no-print fixed z-50 min-w-[190px] max-w-[260px] bg-[#1e1f23] border border-[#33353a] rounded-xl shadow-2xl shadow-black/80 overflow-hidden text-xs animate-in fade-in zoom-in-95 duration-75 select-none p-1"
        >
            {title && (
                <div className="px-2.5 py-1 text-[10px] uppercase font-semibold tracking-wider text-zinc-500 font-sans flex items-center justify-between border-b border-[#2b2d33] mb-1">
                    <span>{title}</span>
                    <span className="text-[9px] text-zinc-600 font-mono lowercase">tab or ↵</span>
                </div>
            )}

            <div className="max-h-48 overflow-y-auto space-y-0.5 pr-0.5">
                {suggestions.map((item, index) => {
                    const isSelected = index === selectedIndex;
                    return (
                        <button
                            key={`${item}-${index}`}
                            data-suggestion-item
                            type="button"
                            onMouseEnter={() => onHover(index)}
                            onMouseDown={(e) => {
                                // prevent blur so editor maintains focus and selection
                                e.preventDefault();
                            }}
                            onClick={() => onSelect(item)}
                            className={`w-full text-left px-2.5 py-1.5 rounded-lg transition-colors flex items-center justify-between text-xs font-mono uppercase cursor-pointer ${
                                isSelected ? "bg-[#2f3136] text-white font-medium" : "text-zinc-300 hover:bg-[#26282c] hover:text-white"
                            }`}
                        >
                            <span className="truncate">{item}</span>
                            {isSelected && (
                                <span className="text-[10px] text-zinc-400 font-sans normal-case tracking-normal shrink-0 ml-2">↵</span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
