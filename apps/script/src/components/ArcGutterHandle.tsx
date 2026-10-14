"use client";

import React, { useState } from "react";
import type { Editor } from "@tiptap/react";
import { SCREENPLAY_ELEMENT_ITEMS } from "./ArcElementMenu";
import { MessageSquareQuote } from "lucide-react";

export interface ArcGutterHandleProps {
    editor: Editor | null;
    nodeType: string;
    nodePos: number;
    top: number;
    left: number;
    visible: boolean;
    onOpenMenu: (coords: { x: number; y: number }) => void;
    onMoveBlock?: (sourcePos: number, targetPos: number) => void;
}

export function ArcGutterHandle({ editor, nodeType, nodePos, top, left, visible, onOpenMenu }: ArcGutterHandleProps) {
    const [isDragging, setIsDragging] = useState(false);

    if (!visible || !editor) return null;

    const currentItem =
        SCREENPLAY_ELEMENT_ITEMS.find((item) => item.id === nodeType || item.targetNode === nodeType) || SCREENPLAY_ELEMENT_ITEMS[4];
    const ElementIcon = currentItem.icon || MessageSquareQuote;

    const handleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        onOpenMenu({
            x: rect.right + 8,
            y: rect.top
        });
    };

    const handleDragStart = (e: React.DragEvent) => {
        setIsDragging(true);
        e.dataTransfer.setData("text/plain", `screenplay-node:${nodePos}`);
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDragEnd = () => {
        setIsDragging(false);
    };

    return (
        <div
            style={{
                position: "absolute",
                top: `${top}px`,
                left: `${left}px`,
                transform: "translate(-100%, 0)",
                zIndex: 35
            }}
            className="no-print flex items-center pr-2"
        >
            <button
                type="button"
                draggable
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onClick={handleClick}
                title={`${currentItem.label} (Drag to reorder, click for menu)`}
                className={`flex items-center justify-center w-6 h-6 rounded-md transition-all cursor-grab active:cursor-grabbing ${
                    isDragging
                        ? "bg-[#3b82f6] text-white ring-2 ring-blue-400 opacity-60"
                        : "bg-[#1d1f21]/80 hover:bg-[#282830] text-zinc-400 hover:text-white border border-white/10 hover:border-white/20 shadow-sm"
                }`}
            >
                <ElementIcon className="w-3.5 h-3.5" />
            </button>
        </div>
    );
}
