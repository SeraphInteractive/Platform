"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import type { Editor } from "@tiptap/react";
import {
    ArrowLeft,
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
    Moon,
    Check,
    Loader2
} from "lucide-react";

export type ViewLayoutMode = "script" | "split" | "beatboard" | "outline";

interface ScreenplayToolbarProps {
    editor: Editor | null;
    scriptTitle: string;
    setScriptTitle: (title: string) => void;
    isSaving?: boolean;
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
    isAdmin?: boolean;
    isReadOnly?: boolean;
    user?: any;
    onOpenInviteModal?: () => void;
    pageTheme?: "dark" | "light";
    onTogglePageTheme?: () => void;
    onOpenCommandPalette: () => void;
    onOpenFindReplace: () => void;
    onInsertImageModal: () => void;
    onExportPdf?: () => void;
    onExportFdx: () => void;
    onExportFountain: () => void;
    onImportFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function ScreenplayToolbar({
    editor,
    scriptTitle,
    setScriptTitle,
    isSaving = false,
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
    isAdmin: propIsAdmin,
    isReadOnly = false,
    user,
    onOpenInviteModal,
    pageTheme = "dark",
    onTogglePageTheme,
    onOpenCommandPalette,
    onOpenFindReplace,
    onInsertImageModal,
    onExportPdf,
    onExportFdx,
    onExportFountain,
    onImportFile
}: ScreenplayToolbarProps) {
    const isAdmin = propIsAdmin ?? (user?.role === "admin" || user?.role === "super_admin");
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
                    className="p-1.5 bg-[#16171a] hover:bg-[#25262a] border border-[#33353a] rounded-full text-zinc-300 shadow-xl"
                    title="Exit Focus Mode (F11 or Esc)"
                >
                    <Minimize2 className="w-4 h-4 text-[#4c8aec]" />
                </button>
            </div>
        );
    }

    return (
        <header className="no-print h-[42px] flex items-center justify-between px-2 sm:px-3 bg-[#16171a] border-b border-[#33353a] text-xs text-zinc-300 select-none shrink-0 z-30">
            {/* Left: Back to Dashboard, Outline Toggle & Title */}
            <div className="flex items-center gap-1 sm:gap-2 min-w-0">
                <Link
                    href="/"
                    className="p-1 sm:p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-[#25262a] rounded-lg transition-colors shrink-0"
                    title="Back to Dashboard"
                >
                    <ArrowLeft className="w-3.5 h-3.5" />
                </Link>

                <button
                    onClick={() => setIsNavOpen(!isNavOpen)}
                    className={`p-1 sm:p-1.5 rounded-lg transition-colors shrink-0 ${
                        isNavOpen
                            ? "bg-[#25262a] text-zinc-100 border border-[#33353a]"
                            : "text-zinc-400 hover:text-zinc-100 hover:bg-[#25262a]"
                    }`}
                    title="Toggle Scenes Outline (Cmd+B)"
                >
                    <Menu className="w-3.5 h-3.5" />
                </button>

                <div className="flex items-center gap-1.5 min-w-0 truncate">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#4c8aec] shrink-0" />
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
                            className="bg-[#27292c] border border-[#3e4044] rounded-lg px-2 py-0.5 text-xs text-zinc-100 font-medium focus:outline-none focus:border-[#4c8aec] max-w-[120px] sm:max-w-[200px]"
                        />
                    ) : (
                        <span
                            onClick={() => !isReadOnly && setIsEditingTitle(true)}
                            className={`font-medium text-zinc-200 truncate max-w-[110px] sm:max-w-[200px] md:max-w-[240px] tracking-wide ${
                                isReadOnly ? "cursor-default" : "hover:text-white cursor-pointer"
                            }`}
                            title={isReadOnly ? scriptTitle : "Click to rename"}
                        >
                            {scriptTitle}
                        </span>
                    )}

                    {/* Small colourless save indicator (hidden when read-only) */}
                    {!isReadOnly && (
                        <div
                            className="hidden sm:flex items-center gap-1.5 px-1.5 py-0.5 text-zinc-500 font-mono text-[11px] select-none shrink-0"
                            title={isSaving ? "Saving changes..." : "Saved to local storage"}
                        >
                            {isSaving ? (
                                <Loader2 className="w-3 h-3 animate-spin text-zinc-500 shrink-0" />
                            ) : (
                                <Check className="w-3 h-3 text-zinc-500 shrink-0" />
                            )}
                            <span className="hidden md:inline">{isSaving ? "Saving..." : "Saved"}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Center: Arc Studio Tabs (Script | Beats | Outline) */}
            <div className="flex items-center gap-0.5 sm:gap-1 text-xs font-medium shrink-0">
                <button
                    onClick={() => setLayoutMode("script")}
                    className={`px-2 sm:px-2.5 py-1 rounded transition-colors ${
                        layoutMode === "script"
                            ? "text-zinc-100 font-semibold border-b-2 border-[#4c8aec]"
                            : "text-zinc-400 hover:text-zinc-200"
                    }`}
                >
                    Script
                </button>

                <button
                    onClick={() => setLayoutMode("beatboard")}
                    className={`hidden sm:inline-block px-2 sm:px-2.5 py-1 rounded transition-colors ${
                        layoutMode === "beatboard"
                            ? "text-zinc-100 font-semibold border-b-2 border-[#4c8aec]"
                            : "text-zinc-400 hover:text-zinc-200"
                    }`}
                >
                    Beats
                </button>

                <button
                    onClick={() => setLayoutMode("outline")}
                    className={`px-2 sm:px-2.5 py-1 rounded transition-colors ${
                        layoutMode === "outline"
                            ? "text-zinc-100 font-semibold border-b-2 border-[#4c8aec]"
                            : "text-zinc-400 hover:text-zinc-200"
                    }`}
                >
                    Outline
                </button>
            </div>

            {/* Right: Micro Tools (Zero Text Bloat) */}
            <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                {/* Command Palette */}
                <button
                    onClick={onOpenCommandPalette}
                    className="hidden sm:flex p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-[#25262a] rounded-lg transition-colors"
                    title="Command Palette (Cmd+K)"
                >
                    <Command className="w-3.5 h-3.5" />
                </button>

                {/* Find & Replace */}
                <button
                    onClick={onOpenFindReplace}
                    className="p-1 sm:p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-[#25262a] rounded-lg transition-colors"
                    title="Find and Replace (Cmd+F)"
                >
                    <Search className="w-3.5 h-3.5" />
                </button>

                {/* In-script Storyboard Image Embed */}
                <button
                    onClick={onInsertImageModal}
                    className="hidden sm:flex p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-[#25262a] rounded-lg transition-colors"
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
                            ? "bg-[#25262a] text-zinc-100 border border-[#33353a]"
                            : "text-zinc-400 hover:text-zinc-100 hover:bg-[#25262a]"
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
                    className={`hidden md:flex p-1.5 rounded-lg transition-colors ${
                        isStashOpen
                            ? "bg-[#25262a] text-zinc-100 border border-[#33353a]"
                            : "text-zinc-400 hover:text-zinc-100 hover:bg-[#25262a]"
                    }`}
                    title="The Stash (Alt+Backspace)"
                >
                    <Archive className="w-3.5 h-3.5" />
                </button>

                {/* Focus Mode */}
                <button
                    onClick={() => setIsFocusMode(true)}
                    className="hidden md:flex p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-[#25262a] rounded-lg transition-colors"
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
                                ? "text-amber-400 bg-[#25262a] hover:bg-[#33353a]"
                                : "text-zinc-400 hover:text-zinc-100 hover:bg-[#25262a]"
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
                        className="flex items-center gap-1 px-2 py-1 bg-[#27292c] hover:bg-[#25262a] border border-[#33353a] rounded-lg text-zinc-300 transition-colors text-[11px]"
                        title="Export Screenplay"
                    >
                        <Download className="w-3 h-3 text-[#4c8aec]" />
                        <ChevronDown className="w-2.5 h-2.5 text-zinc-500" />
                    </button>

                    {showExportMenu && (
                        <div className="absolute right-0 top-8 z-40 w-44 bg-[#212326] border border-[#33353a] rounded-xl shadow-2xl p-1 text-xs space-y-0.5 animate-in fade-in">
                            <button
                                onClick={() => {
                                    if (onExportPdf) onExportPdf();
                                    setShowExportMenu(false);
                                }}
                                className="w-full px-2.5 py-1.5 text-left rounded-lg hover:bg-[#25262a] text-zinc-200"
                            >
                                Export PDF (.pdf)
                            </button>
                            <button
                                onClick={() => {
                                    onExportFdx();
                                    setShowExportMenu(false);
                                }}
                                className="w-full px-2.5 py-1.5 text-left rounded-lg hover:bg-[#25262a] text-zinc-200"
                            >
                                Final Draft (.fdx)
                            </button>
                            <button
                                onClick={() => {
                                    onExportFountain();
                                    setShowExportMenu(false);
                                }}
                                className="w-full px-2.5 py-1.5 text-left rounded-lg hover:bg-[#25262a] text-zinc-200"
                            >
                                Fountain (.fountain)
                            </button>
                            <button
                                onClick={() => {
                                    handlePrint();
                                    setShowExportMenu(false);
                                }}
                                className="w-full px-2.5 py-1.5 text-left rounded-lg hover:bg-[#25262a] text-zinc-200"
                            >
                                Print Screenplay
                            </button>
                            {isAdmin && (
                                <>
                                    <div className="border-t border-[#33353a] my-1" />
                                    <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-[#25262a] text-zinc-200 cursor-pointer">
                                        <Upload className="w-3 h-3 text-[#4c8aec]" />
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
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* Invite Collaborator / Avatar matching Arc Studio */}
                {onOpenInviteModal && isAdmin && (
                    <button
                        onClick={onOpenInviteModal}
                        className="relative p-0.5 rounded-full hover:ring-2 hover:ring-[#4c8aec]/50 transition-all ml-1 group cursor-pointer"
                        title="Invite collaborators to Studio"
                    >
                        {user?.avatarUrl ? (
                            <img src={user.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
                        ) : (
                            <div className="w-6 h-6 rounded-full bg-[#27292c] border border-[#3e4044] text-[#4c8aec] flex items-center justify-center font-bold text-[10px] uppercase">
                                {(user?.globalName || user?.username || "PS").slice(0, 2)}
                            </div>
                        )}
                        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[#4c8aec] text-white rounded-full flex items-center justify-center text-[9px] font-bold border border-[#16171a]">
                            +
                        </span>
                    </button>
                )}
            </div>
        </header>
    );
}
