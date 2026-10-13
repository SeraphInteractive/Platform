"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import type { Editor } from "@tiptap/react";
import {
    Home,
    FileText,
    Layers,
    Columns,
    Download,
    Upload,
    Printer,
    Maximize2,
    Minimize2,
    Search,
    Command,
    Archive,
    History,
    ImagePlus,
    Menu,
    ChevronDown,
    Sun,
    Moon
} from "lucide-react";

export type ViewLayoutMode = "script" | "split" | "beatboard";

interface ScreenplayToolbarProps {
    editor: Editor | null;
    scriptTitle: string;
    setScriptTitle: (title: string) => void;
    layoutMode: ViewLayoutMode;
    setLayoutMode: (mode: ViewLayoutMode) => void;
    isFocusMode: boolean;
    setIsFocusMode: (val: boolean) => void;
    isNavOpen: boolean;
    setIsNavOpen: (val: boolean) => void;
    isStashOpen: boolean;
    setIsStashOpen: (val: boolean) => void;
    isHistoryOpen: boolean;
    setIsHistoryOpen: (val: boolean) => void;
    pageTheme?: "dark" | "light";
    onTogglePageTheme?: () => void;
    onOpenCommandPalette: () => void;
    onOpenFindReplace: () => void;
    onInsertImageModal: () => void;
    onExportFdx: () => void;
    onExportFountain: () => void;
    onImportFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function ScreenplayToolbar({
    editor,
    scriptTitle,
    setScriptTitle,
    layoutMode,
    setLayoutMode,
    isFocusMode,
    setIsFocusMode,
    isNavOpen,
    setIsNavOpen,
    isStashOpen,
    setIsStashOpen,
    isHistoryOpen,
    setIsHistoryOpen,
    pageTheme = "dark",
    onTogglePageTheme,
    onOpenCommandPalette,
    onOpenFindReplace,
    onInsertImageModal,
    onExportFdx,
    onExportFountain,
    onImportFile
}: ScreenplayToolbarProps) {
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [isEditingTitle, setIsEditingTitle] = useState(false);

    useEffect(() => {
        if (!showExportMenu) return;
        const handleOutside = () => setShowExportMenu(false);
        window.addEventListener("click", handleOutside);
        return () => window.removeEventListener("click", handleOutside);
    }, [showExportMenu]);

    const handlePrint = () => {
        if (typeof window !== "undefined") {
            window.print();
        }
    };

    if (isFocusMode) {
        return (
            <div className="no-print fixed top-3 right-5 z-40 opacity-20 hover:opacity-100 transition-opacity select-none">
                <button
                    onClick={() => setIsFocusMode(false)}
                    className="p-1.5 bg-[#18181b] hover:bg-[#252529] border border-[#28282e] rounded-full text-zinc-300 shadow-xl"
                    title="Exit Focus Mode (F11 or Esc)"
                >
                    <Minimize2 className="w-4 h-4 text-[#818cf8]" />
                </button>
            </div>
        );
    }

    return (
        <header className="no-print h-[42px] flex items-center justify-between px-3 bg-[#18181b] border-b border-[#242429] text-xs text-zinc-300 select-none shrink-0 z-30">
            {/* Left: Home, Outline Toggle & Title */}
            <div className="flex items-center gap-2">
                <Link
                    href="/"
                    className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-[#242429] rounded-lg transition-colors"
                    title="Back to Dashboard"
                >
                    <Home className="w-3.5 h-3.5" />
                </Link>

                <button
                    onClick={() => setIsNavOpen(!isNavOpen)}
                    className={`p-1.5 rounded-lg transition-colors ${
                        isNavOpen
                            ? "bg-[#252529] text-zinc-100 border border-[#2e2e34]"
                            : "text-zinc-400 hover:text-zinc-100 hover:bg-[#242429]"
                    }`}
                    title="Toggle Scenes Outline (Cmd+B)"
                >
                    <Menu className="w-3.5 h-3.5" />
                </button>

                <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#6366f1]" />
                    {isEditingTitle ? (
                        <input
                            type="text"
                            value={scriptTitle}
                            autoFocus
                            onBlur={() => setIsEditingTitle(false)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === "Escape") setIsEditingTitle(false);
                            }}
                            onChange={(e) => setScriptTitle(e.target.value)}
                            className="bg-[#202024] border border-[#383842] rounded-lg px-2 py-0.5 text-xs text-zinc-100 font-medium focus:outline-none focus:border-[#6366f1]"
                        />
                    ) : (
                        <span
                            onClick={() => setIsEditingTitle(true)}
                            className="font-medium text-zinc-200 hover:text-white cursor-pointer truncate max-w-[240px] tracking-wide"
                            title="Click to rename"
                        >
                            {scriptTitle}
                        </span>
                    )}
                </div>
            </div>

            {/* Center: Arc Studio Slim View Segment Switcher */}
            <div className="flex items-center bg-[#202024] p-0.5 rounded-lg border border-[#28282e]">
                <button
                    onClick={() => setLayoutMode("script")}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                        layoutMode === "script" ? "bg-[#28282e] text-white shadow-xs" : "text-zinc-400 hover:text-zinc-200"
                    }`}
                    title="Script"
                >
                    <FileText className="w-3 h-3" />
                    <span>Script</span>
                </button>

                <button
                    onClick={() => setLayoutMode("split")}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                        layoutMode === "split" ? "bg-[#28282e] text-white shadow-xs" : "text-zinc-400 hover:text-zinc-200"
                    }`}
                    title="Split View"
                >
                    <Columns className="w-3 h-3" />
                    <span>Split</span>
                </button>

                <button
                    onClick={() => setLayoutMode("beatboard")}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                        layoutMode === "beatboard" ? "bg-[#28282e] text-white shadow-xs" : "text-zinc-400 hover:text-zinc-200"
                    }`}
                    title="Plot Board"
                >
                    <Layers className="w-3 h-3" />
                    <span>Board</span>
                </button>
            </div>

            {/* Right: Micro Tools (Zero Text Bloat) */}
            <div className="flex items-center gap-1">
                {/* Command Palette */}
                <button
                    onClick={onOpenCommandPalette}
                    className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-[#242429] rounded-lg transition-colors"
                    title="Command Palette (Cmd+K)"
                >
                    <Command className="w-3.5 h-3.5" />
                </button>

                {/* Find & Replace */}
                <button
                    onClick={onOpenFindReplace}
                    className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-[#242429] rounded-lg transition-colors"
                    title="Find and Replace (Cmd+F)"
                >
                    <Search className="w-3.5 h-3.5" />
                </button>

                {/* In-script Storyboard Image Embed */}
                <button
                    onClick={onInsertImageModal}
                    className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-[#242429] rounded-lg transition-colors"
                    title="Embed Storyboard Still / Concept Art"
                >
                    <ImagePlus className="w-3.5 h-3.5" />
                </button>

                {/* Version History Drawer */}
                <button
                    onClick={() => {
                        setIsHistoryOpen(!isHistoryOpen);
                        if (isStashOpen) setIsStashOpen(false);
                    }}
                    className={`p-1.5 rounded-lg transition-colors ${
                        isHistoryOpen
                            ? "bg-[#252529] text-zinc-100 border border-[#2e2e34]"
                            : "text-zinc-400 hover:text-zinc-100 hover:bg-[#242429]"
                    }`}
                    title="Version History"
                >
                    <History className="w-3.5 h-3.5" />
                </button>

                {/* The Stash Drawer */}
                <button
                    onClick={() => {
                        setIsStashOpen(!isStashOpen);
                        if (isHistoryOpen) setIsHistoryOpen(false);
                    }}
                    className={`p-1.5 rounded-lg transition-colors ${
                        isStashOpen
                            ? "bg-[#252529] text-zinc-100 border border-[#2e2e34]"
                            : "text-zinc-400 hover:text-zinc-100 hover:bg-[#242429]"
                    }`}
                    title="The Stash (Alt+Backspace)"
                >
                    <Archive className="w-3.5 h-3.5" />
                </button>

                {/* Focus Mode */}
                <button
                    onClick={() => setIsFocusMode(true)}
                    className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-[#242429] rounded-lg transition-colors"
                    title="Focus Mode (F11)"
                >
                    <Maximize2 className="w-3.5 h-3.5" />
                </button>

                {/* Page Theme Toggle (Light / Dark Pages) */}
                {onTogglePageTheme && (
                    <button
                        onClick={onTogglePageTheme}
                        className={`p-1.5 rounded-lg transition-colors ${
                            pageTheme === "light"
                                ? "text-amber-400 bg-[#252529] hover:bg-[#2e2e34]"
                                : "text-zinc-400 hover:text-zinc-100 hover:bg-[#242429]"
                        }`}
                        title={pageTheme === "light" ? "Switch to Dark Page Theme" : "Switch to Light Page Theme"}
                    >
                        {pageTheme === "light" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                    </button>
                )}

                {/* Export / Import Dropdown */}
                <div className="relative ml-1">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowExportMenu(!showExportMenu);
                        }}
                        className="flex items-center gap-1 px-2 py-1 bg-[#202024] hover:bg-[#252529] border border-[#28282e] rounded-lg text-zinc-300 transition-colors text-[11px]"
                        title="Export Screenplay"
                    >
                        <Download className="w-3 h-3 text-[#818cf8]" />
                        <ChevronDown className="w-2.5 h-2.5 text-zinc-500" />
                    </button>

                    {showExportMenu && (
                        <div className="absolute right-0 top-8 z-40 w-44 bg-[#1c1c20] border border-[#28282e] rounded-xl shadow-2xl p-1 text-xs space-y-0.5 animate-in fade-in">
                            <button
                                onClick={() => {
                                    onExportFdx();
                                    setShowExportMenu(false);
                                }}
                                className="w-full px-2.5 py-1.5 text-left rounded-lg hover:bg-[#252529] text-zinc-200"
                            >
                                Final Draft (.fdx)
                            </button>
                            <button
                                onClick={() => {
                                    onExportFountain();
                                    setShowExportMenu(false);
                                }}
                                className="w-full px-2.5 py-1.5 text-left rounded-lg hover:bg-[#252529] text-zinc-200"
                            >
                                Fountain (.fountain)
                            </button>
                            <button
                                onClick={() => {
                                    handlePrint();
                                    setShowExportMenu(false);
                                }}
                                className="w-full px-2.5 py-1.5 text-left rounded-lg hover:bg-[#252529] text-zinc-200"
                            >
                                Print / PDF (.pdf)
                            </button>
                            <div className="border-t border-[#28282e] my-1" />
                            <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-[#252529] text-zinc-200 cursor-pointer">
                                <Upload className="w-3 h-3 text-[#818cf8]" />
                                <span>Import File</span>
                                <input
                                    type="file"
                                    accept=".fdx,.fountain,.txt"
                                    onChange={(e) => {
                                        onImportFile(e);
                                        setShowExportMenu(false);
                                    }}
                                    className="hidden"
                                />
                            </label>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}
