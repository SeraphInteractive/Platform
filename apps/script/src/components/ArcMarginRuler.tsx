"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { AlignLeft, AlignCenter, AlignRight, ChevronLeft, ChevronRight, ChevronDown, X } from "lucide-react";

export interface MarginSettings {
    left: number; // in inches, e.g. 2.5
    width: number; // in inches, e.g. 3.5
    right: number; // in inches, e.g. 1.2
    alignment: "left" | "center" | "right";
    spacingBefore: number; // in lines: 0, 1, 1.5, 2
}

export interface ArcMarginRulerProps {
    isOpen: boolean;
    onClose: () => void;
    elementType: string;
    margins: MarginSettings;
    onUpdateMargins: (margins: MarginSettings) => void;
    totalWidthInches?: number; // default 6.0 inches (60 characters)
}

const SPACING_OPTIONS = [
    { label: "0 lines", value: 0 },
    { label: "1 line", value: 1 },
    { label: "1½ lines", value: 1.5 },
    { label: "2 lines", value: 2 }
];

export function ArcMarginRuler({ isOpen, onClose, elementType, margins, onUpdateMargins, totalWidthInches = 6.0 }: ArcMarginRulerProps) {
    const [isSpacingDropdownOpen, setIsSpacingDropdownOpen] = useState(false);
    const rulerRef = useRef<HTMLDivElement>(null);
    const draggingDividerRef = useRef<"left" | "right" | null>(null);
    const startXRef = useRef<number>(0);
    const startLeftRef = useRef<number>(0);
    const startWidthRef = useRef<number>(0);

    const safeLeft = Math.max(0, Math.min(margins.left, totalWidthInches - 1));
    const safeWidth = Math.max(1, Math.min(margins.width, totalWidthInches - safeLeft));
    const safeRight = Math.max(0, +(totalWidthInches - safeLeft - safeWidth).toFixed(2));

    const leftPct = (safeLeft / totalWidthInches) * 100;
    const widthPct = (safeWidth / totalWidthInches) * 100;
    const rightPct = Math.max(0, 100 - leftPct - widthPct);

    const charCount = Math.round(safeWidth * 10);

    const handleNudgeLeft = (deltaInches: number) => {
        const newLeft = Math.max(0, +(safeLeft + deltaInches).toFixed(2));
        const maxAllowedLeft = totalWidthInches - safeWidth;
        const clampedLeft = Math.min(newLeft, maxAllowedLeft);
        onUpdateMargins({
            ...margins,
            left: clampedLeft,
            right: +(totalWidthInches - clampedLeft - safeWidth).toFixed(2)
        });
    };

    const handleNudgeWidth = (deltaInches: number) => {
        const newWidth = Math.max(1, +(safeWidth + deltaInches).toFixed(2));
        const maxAllowedWidth = totalWidthInches - safeLeft;
        const clampedWidth = Math.min(newWidth, maxAllowedWidth);
        onUpdateMargins({
            ...margins,
            width: clampedWidth,
            right: +(totalWidthInches - safeLeft - clampedWidth).toFixed(2)
        });
    };

    const handleNudgeRight = (deltaInches: number) => {
        const newRight = Math.max(0, +(safeRight + deltaInches).toFixed(2));
        const newWidth = Math.max(1, +(totalWidthInches - safeLeft - newRight).toFixed(2));
        onUpdateMargins({
            ...margins,
            width: newWidth,
            right: +(totalWidthInches - safeLeft - newWidth).toFixed(2)
        });
    };

    const handleMouseDownDivider = (divider: "left" | "right", e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        draggingDividerRef.current = divider;
        startXRef.current = e.clientX;
        startLeftRef.current = safeLeft;
        startWidthRef.current = safeWidth;
    };

    const handlePointerMove = useCallback(
        (e: MouseEvent) => {
            if (!draggingDividerRef.current || !rulerRef.current) return;

            const rect = rulerRef.current.getBoundingClientRect();
            if (rect.width <= 0) return;

            const pxPerInch = rect.width / totalWidthInches;
            const deltaInches = (e.clientX - startXRef.current) / pxPerInch;

            if (draggingDividerRef.current === "left") {
                const newLeft = Math.max(0, Math.min(+(startLeftRef.current + deltaInches).toFixed(2), totalWidthInches - 1));
                const maxAvailableWidth = totalWidthInches - newLeft;
                const newWidth = Math.min(startWidthRef.current, maxAvailableWidth);
                onUpdateMargins({
                    ...margins,
                    left: newLeft,
                    width: newWidth,
                    right: +(totalWidthInches - newLeft - newWidth).toFixed(2)
                });
            } else if (draggingDividerRef.current === "right") {
                const newWidth = Math.max(1, Math.min(+(startWidthRef.current + deltaInches).toFixed(2), totalWidthInches - safeLeft));
                onUpdateMargins({
                    ...margins,
                    width: newWidth,
                    right: +(totalWidthInches - safeLeft - newWidth).toFixed(2)
                });
            }
        },
        [margins, onUpdateMargins, safeLeft, totalWidthInches]
    );

    const handlePointerUp = useCallback(() => {
        draggingDividerRef.current = null;
    }, []);

    useEffect(() => {
        window.addEventListener("mousemove", handlePointerMove);
        window.addEventListener("mouseup", handlePointerUp);
        return () => {
            window.removeEventListener("mousemove", handlePointerMove);
            window.removeEventListener("mouseup", handlePointerUp);
        };
    }, [handlePointerMove, handlePointerUp]);

    if (!isOpen) return null;

    const currentSpacingLabel = SPACING_OPTIONS.find((s) => s.value === margins.spacingBefore)?.label || `${margins.spacingBefore} lines`;

    return (
        <div className="relative w-full my-2 select-none z-[1001] animate-in fade-in duration-100">
            {/* Floating Top Toolbar Pill */}
            <div className="flex justify-center mb-1">
                <div className="flex items-center gap-3 px-2 py-1 bg-[#1d1f21] border border-white/15 rounded-lg shadow-xl text-xs text-zinc-300">
                    {/* Alignment Segmented Control */}
                    <div className="flex items-center bg-[#282830] p-0.5 rounded border border-white/10">
                        <button
                            type="button"
                            title="Align Left"
                            onClick={() => onUpdateMargins({ ...margins, alignment: "left" })}
                            className={`p-1 rounded transition-colors ${
                                margins.alignment === "left" ? "bg-[#6366f1] text-white" : "text-zinc-400 hover:text-white"
                            }`}
                        >
                            <AlignLeft className="w-3.5 h-3.5" />
                        </button>
                        <button
                            type="button"
                            title="Align Center"
                            onClick={() => onUpdateMargins({ ...margins, alignment: "center" })}
                            className={`p-1 rounded transition-colors ${
                                margins.alignment === "center" ? "bg-[#6366f1] text-white" : "text-zinc-400 hover:text-white"
                            }`}
                        >
                            <AlignCenter className="w-3.5 h-3.5" />
                        </button>
                        <button
                            type="button"
                            title="Align Right"
                            onClick={() => onUpdateMargins({ ...margins, alignment: "right" })}
                            className={`p-1 rounded transition-colors ${
                                margins.alignment === "right" ? "bg-[#6366f1] text-white" : "text-zinc-400 hover:text-white"
                            }`}
                        >
                            <AlignRight className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    {/* Spacing Above Dropdown */}
                    <div className="relative flex items-center gap-1.5 text-xs">
                        <span className="text-zinc-400">Spacing above</span>
                        <button
                            type="button"
                            onClick={() => setIsSpacingDropdownOpen((v) => !v)}
                            className="flex items-center justify-between gap-1.5 px-2 py-0.5 bg-[#282830] border border-white/10 rounded hover:bg-[#32323c] text-zinc-200 min-w-[70px]"
                        >
                            <span>{currentSpacingLabel}</span>
                            <ChevronDown className="w-3 h-3 text-zinc-400 shrink-0" />
                        </button>

                        {isSpacingDropdownOpen && (
                            <div className="absolute top-full left-0 mt-1 w-32 bg-[#1d1f21] border border-white/15 rounded-lg shadow-2xl py-1 z-50">
                                {SPACING_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.label}
                                        type="button"
                                        onClick={() => {
                                            onUpdateMargins({ ...margins, spacingBefore: opt.value });
                                            setIsSpacingDropdownOpen(false);
                                        }}
                                        className={`flex items-center justify-between w-full px-2.5 py-1 text-left text-xs ${
                                            margins.spacingBefore === opt.value
                                                ? "bg-[#6366f1]/20 text-[#818cf8] font-medium"
                                                : "text-zinc-300 hover:bg-[#282830]"
                                        }`}
                                    >
                                        <span>{opt.label}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Close Margin Mode Button */}
                    <button
                        type="button"
                        onClick={onClose}
                        title="Close margin settings"
                        className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* 3-Segment Visual Margin Banner */}
            <div
                ref={rulerRef}
                className="relative flex items-center h-7 w-full overflow-hidden rounded font-mono text-[11px] border border-white/10"
            >
                {/* 1. Left Margin (Orange) */}
                <div
                    style={{ width: `${leftPct}%` }}
                    className="relative flex items-center justify-end h-full bg-[#ea580c]/20 text-[#fdba74] transition-all pr-1 border-r border-[#ea580c]/30"
                >
                    {leftPct > 6 && (
                        <span className="mr-1.5 select-none font-sans font-medium text-[11px] opacity-90 truncate">
                            {safeLeft.toFixed(2)}&quot;
                        </span>
                    )}
                    {/* Nudge/Drag Right Handle */}
                    <button
                        type="button"
                        title="Drag or nudge left margin"
                        onMouseDown={(e) => handleMouseDownDivider("left", e)}
                        onClick={() => handleNudgeLeft(0.1)}
                        className="flex items-center justify-center w-4 h-4 rounded-full bg-[#ea580c] hover:bg-[#c2410c] text-white shrink-0 cursor-ew-resize shadow"
                    >
                        <ChevronRight className="w-3 h-3" />
                    </button>
                </div>

                {/* 2. Text Width (Blue) */}
                <div
                    style={{ width: `${widthPct}%` }}
                    className="relative flex items-center justify-between h-full bg-[#2563eb]/20 text-[#93c5fd] transition-all px-1 border-r border-[#2563eb]/30"
                >
                    {/* Contract Left Handle */}
                    <button
                        type="button"
                        title="Decrease text block width"
                        onClick={() => handleNudgeWidth(-0.1)}
                        className="flex items-center justify-center w-4 h-4 rounded-full bg-[#2563eb] hover:bg-[#1d4ed8] text-white shrink-0 cursor-pointer shadow"
                    >
                        <ChevronLeft className="w-3 h-3" />
                    </button>

                    {/* Width and Character Count */}
                    <span className="px-1 text-center font-sans font-medium text-[11px] truncate opacity-90">
                        {safeWidth.toFixed(2)}&quot; / {charCount} characters
                    </span>

                    {/* Expand Right Handle */}
                    <button
                        type="button"
                        title="Increase text block width"
                        onMouseDown={(e) => handleMouseDownDivider("right", e)}
                        onClick={() => handleNudgeWidth(0.1)}
                        className="flex items-center justify-center w-4 h-4 rounded-full bg-[#2563eb] hover:bg-[#1d4ed8] text-white shrink-0 cursor-ew-resize shadow"
                    >
                        <ChevronRight className="w-3 h-3" />
                    </button>
                </div>

                {/* 3. Right Margin (Orange) */}
                <div
                    style={{ width: `${rightPct}%` }}
                    className="relative flex items-center h-full bg-[#ea580c]/20 text-[#fdba74] transition-all pl-1"
                >
                    {/* Contract Right Handle */}
                    <button
                        type="button"
                        title="Contract right margin"
                        onClick={() => handleNudgeRight(-0.1)}
                        className="flex items-center justify-center w-4 h-4 rounded-full bg-[#ea580c] hover:bg-[#c2410c] text-white shrink-0 cursor-pointer shadow"
                    >
                        <ChevronLeft className="w-3 h-3" />
                    </button>

                    {rightPct > 6 && (
                        <span className="ml-1.5 select-none font-sans font-medium text-[11px] opacity-90 truncate">
                            {safeRight.toFixed(2)}&quot;
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
