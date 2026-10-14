"use client";

import React, { useState } from "react";
import { History, X, Clock, Plus, RotateCcw, Eye } from "lucide-react";

export interface VersionSnapshot {
    id: string;
    name?: string;
    timestamp: string;
    isoDate: string;
    author: string;
    avatarUrl?: string | null;
    wordCount: number;
    sceneCount: number;
    content: unknown;
    color?: string;
}

// formats edit timestamp into clean relative day-grouped label
export function formatRelativeTime(isoDateString?: string, fallbackTimestamp?: string): string {
    if (!isoDateString) return fallbackTimestamp || "Just now";
    const date = new Date(isoDateString);
    if (isNaN(date.getTime())) return fallbackTimestamp || "Just now";

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);

    if (diffSec < 45) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;

    const isToday = now.getDate() === date.getDate() && now.getMonth() === date.getMonth() && now.getFullYear() === date.getFullYear();

    const timeStr = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

    if (isToday) return `Today, ${timeStr}`;

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
        yesterday.getDate() === date.getDate() &&
        yesterday.getMonth() === date.getMonth() &&
        yesterday.getFullYear() === date.getFullYear();

    if (isYesterday) return `Yesterday, ${timeStr}`;

    const isThisYear = now.getFullYear() === date.getFullYear();
    const monthName = date.toLocaleDateString([], { month: "short" });
    const day = date.getDate();

    if (isThisYear) return `${monthName} ${day}, ${timeStr}`;
    return `${monthName} ${day}, ${date.getFullYear()}`;
}

interface VersionHistoryDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    versions: VersionSnapshot[];
    onRestoreVersion: (snapshot: VersionSnapshot) => void;
    onCreateNamedVersion: (name: string) => void;
    onPreviewVersion?: (snapshot: VersionSnapshot | null) => void;
    activePreviewId?: string | null;
}

export function VersionHistoryDrawer({
    isOpen,
    onClose,
    versions,
    onRestoreVersion,
    onCreateNamedVersion,
    onPreviewVersion,
    activePreviewId
}: VersionHistoryDrawerProps) {
    const [filterNamedOnly, setFilterNamedOnly] = useState(false);
    const [isCreatingName, setIsCreatingName] = useState(false);
    const [newVersionName, setNewVersionName] = useState("");

    if (!isOpen) return null;

    const displayVersions = filterNamedOnly ? versions.filter((v) => Boolean(v.name)) : versions;

    const handleSaveNamed = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newVersionName.trim()) return;
        onCreateNamedVersion(newVersionName.trim());
        setNewVersionName("");
        setIsCreatingName(false);
    };

    return (
        <aside className="no-print w-80 bg-[#12141a] border-l border-[#262933] flex flex-col h-[calc(100vh-40px)] shrink-0 select-none z-20">
            {/* Header */}
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[#262933] bg-[#0e1015]">
                <div className="flex items-center gap-2">
                    <History className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-medium text-xs text-slate-200 tracking-wider uppercase font-mono">Version History</span>
                </div>
                <button
                    onClick={onClose}
                    className="p-1 text-slate-400 hover:text-slate-200 hover:bg-[#1a1d26] rounded transition-colors"
                    title="Close version history"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* Actions & Filter Bar */}
            <div className="p-3 border-b border-[#262933] space-y-2 bg-[#12141a]">
                <div className="flex items-center justify-between">
                    <button
                        onClick={() => setIsCreatingName(!isCreatingName)}
                        className="flex items-center gap-1.5 px-3 py-1 bg-[#202330] hover:bg-[#282d3d] border border-[#2e3344] text-slate-200 rounded text-[11px] font-mono transition-colors"
                    >
                        <Plus className="w-3 h-3 text-slate-400" />
                        <span>Name Version</span>
                    </button>

                    <label className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono cursor-pointer">
                        <input
                            type="checkbox"
                            checked={filterNamedOnly}
                            onChange={(e) => setFilterNamedOnly(e.target.checked)}
                            className="rounded bg-[#0e1015] border-[#262933] text-slate-400 focus:ring-0"
                        />
                        <span>Named Only</span>
                    </label>
                </div>

                {isCreatingName && (
                    <form onSubmit={handleSaveNamed} className="p-2 bg-[#0e1015] border border-[#262933] rounded space-y-2 mt-2">
                        <input
                            type="text"
                            placeholder="e.g. Table Read Draft"
                            value={newVersionName}
                            onChange={(e) => setNewVersionName(e.target.value)}
                            autoFocus
                            className="w-full bg-[#161820] border border-[#262933] rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-slate-500 font-mono"
                        />
                        <div className="flex justify-end gap-1.5">
                            <button
                                type="button"
                                onClick={() => setIsCreatingName(false)}
                                className="px-2 py-0.5 text-[10px] text-slate-400"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="px-2.5 py-0.5 bg-[#252a3a] hover:bg-[#303548] border border-[#353b50] text-slate-200 rounded text-[10px] font-mono"
                            >
                                Save
                            </button>
                        </div>
                    </form>
                )}
            </div>

            {/* Timeline List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {displayVersions.length === 0 ? (
                    <div className="py-12 text-center text-slate-500 text-xs font-mono">
                        <Clock className="w-6 h-6 mx-auto mb-2 opacity-30 text-slate-400" />
                        <p>No snapshots recorded yet.</p>
                    </div>
                ) : (
                    displayVersions.map((v) => {
                        const isPreviewing = activePreviewId === v.id;
                        const relativeTime = formatRelativeTime(v.isoDate, v.timestamp);
                        const initialLetter = (v.author || "A")[0]?.toUpperCase() || "A";

                        return (
                            <div
                                key={v.id}
                                className={`p-2.5 rounded border transition-all ${
                                    isPreviewing
                                        ? "bg-[#1c202d] border-slate-500 shadow-md"
                                        : "bg-[#161820] hover:bg-[#1a1d26] border-[#262933]"
                                }`}
                            >
                                <div className="flex items-start gap-2.5">
                                    {/* Author Profile Picture / Fallback Badge */}
                                    {v.avatarUrl ? (
                                        <img
                                            src={v.avatarUrl}
                                            alt={v.author}
                                            className="w-6 h-6 rounded-full object-cover border border-[#2e3344] shrink-0 mt-0.5"
                                        />
                                    ) : (
                                        <div className="w-6 h-6 rounded-full bg-[#202432] border border-[#2e3344] text-slate-300 font-semibold text-[10px] flex items-center justify-center shrink-0 uppercase font-mono mt-0.5">
                                            {initialLetter}
                                        </div>
                                    )}

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-1 mb-0.5">
                                            <span className="text-xs font-medium text-slate-200 truncate font-mono">
                                                {v.name || v.author}
                                            </span>
                                            {v.name && (
                                                <span className="px-1.5 py-0.2 rounded bg-[#202432] border border-[#2c3244] text-[9px] font-mono text-slate-300 shrink-0">
                                                    Milestone
                                                </span>
                                            )}
                                        </div>

                                        <div className="text-[10px] text-slate-400 font-mono flex items-center justify-between gap-1">
                                            <span title={v.isoDate ? new Date(v.isoDate).toLocaleString() : v.timestamp}>
                                                {relativeTime}
                                            </span>
                                            {v.name && <span className="text-slate-500 truncate">{v.author}</span>}
                                        </div>

                                        <div className="text-[10px] text-slate-500 font-mono mt-1 flex items-center gap-2">
                                            <span>{v.wordCount} words</span>
                                            <span>-</span>
                                            <span>{v.sceneCount} scenes</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Restore / Preview Actions */}
                                <div className="mt-2 pt-2 border-t border-[#20242f] flex items-center justify-between">
                                    {onPreviewVersion && (
                                        <button
                                            onClick={() => onPreviewVersion(isPreviewing ? null : v)}
                                            className="flex items-center gap-1 text-[10px] font-mono text-slate-400 hover:text-slate-200"
                                        >
                                            <Eye className="w-3 h-3 text-slate-400" />
                                            <span>{isPreviewing ? "Exit Preview" : "Preview"}</span>
                                        </button>
                                    )}

                                    <button
                                        onClick={() => onRestoreVersion(v)}
                                        className="flex items-center gap-1 px-2 py-0.5 bg-[#202432] hover:bg-[#2c3246] text-slate-300 hover:text-white rounded border border-[#2b3042] text-[10px] font-mono ml-auto transition-colors"
                                        title="Restore this version to editor"
                                    >
                                        <RotateCcw className="w-3 h-3 text-slate-400" />
                                        <span>Restore</span>
                                    </button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </aside>
    );
}
