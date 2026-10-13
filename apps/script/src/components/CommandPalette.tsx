"use client";

import React, { useEffect, useState } from "react";
import { Search, FileText, Layers, Download, Upload, Printer, Columns, Maximize2, Film, Sparkles, Sun, Moon, X } from "lucide-react";

interface CommandItem {
    id: string;
    title: string;
    shortcut?: string;
    category: "Formatting" | "Navigation" | "Export & Files" | "View";
    icon: React.ReactNode;
    action: () => void;
}

interface CommandPaletteProps {
    isOpen: boolean;
    onClose: () => void;
    onSetElement: (type: string) => void;
    onInsertPageBreak?: () => void;
    onJumpToScene: (pos: number) => void;
    scenes: Array<{ slugline: string; pos: number; number: number }>;
    onExportFdx: () => void;
    onExportFountain: () => void;
    onPrintPdf: () => void;
    onTogglePageView: () => void;
    onToggleSplitView: () => void;
    onToggleFocusMode: () => void;
    pageTheme?: "dark" | "light";
    onTogglePageTheme?: () => void;
}

export function CommandPalette({
    isOpen,
    onClose,
    onSetElement,
    onInsertPageBreak,
    onJumpToScene,
    scenes,
    onExportFdx,
    onExportFountain,
    onPrintPdf,
    onTogglePageView,
    onToggleSplitView,
    onToggleFocusMode,
    pageTheme = "dark",
    onTogglePageTheme
}: CommandPaletteProps) {
    const [query, setQuery] = useState("");

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
                e.preventDefault();
                if (isOpen) onClose();
            } else if (e.key === "Escape" && isOpen) {
                onClose();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const baseCommands: CommandItem[] = [
        {
            id: "elem-page-break",
            title: "Insert Page Break",
            shortcut: "⌘↵",
            category: "Formatting",
            icon: <FileText className="w-4 h-4 text-zinc-400" />,
            action: () => {
                onInsertPageBreak?.();
                onClose();
            }
        },
        {
            id: "elem-scene",
            title: "Set to Scene Heading",
            shortcut: "⌘1",
            category: "Formatting",
            icon: <Film className="w-4 h-4 text-zinc-400" />,
            action: () => {
                onSetElement("sceneHeading");
                onClose();
            }
        },
        {
            id: "elem-action",
            title: "Set to Action",
            shortcut: "⌘2",
            category: "Formatting",
            icon: <FileText className="w-4 h-4 text-zinc-400" />,
            action: () => {
                onSetElement("action");
                onClose();
            }
        },
        {
            id: "elem-char",
            title: "Set to Character",
            shortcut: "⌘3",
            category: "Formatting",
            icon: <Sparkles className="w-4 h-4 text-zinc-400" />,
            action: () => {
                onSetElement("character");
                onClose();
            }
        },
        {
            id: "elem-dialogue",
            title: "Set to Dialogue",
            shortcut: "⌘4",
            category: "Formatting",
            icon: <FileText className="w-4 h-4 text-zinc-400" />,
            action: () => {
                onSetElement("dialogue");
                onClose();
            }
        },
        {
            id: "elem-paren",
            title: "Set to Parenthetical",
            shortcut: "⌘5",
            category: "Formatting",
            icon: <FileText className="w-4 h-4 text-zinc-400" />,
            action: () => {
                onSetElement("parenthetical");
                onClose();
            }
        },
        {
            id: "elem-trans",
            title: "Set to Transition",
            shortcut: "⌘6",
            category: "Formatting",
            icon: <FileText className="w-4 h-4 text-zinc-400" />,
            action: () => {
                onSetElement("transition");
                onClose();
            }
        },
        {
            id: "view-split",
            title: "Toggle Side-by-Side Outline View",
            category: "View",
            icon: <Columns className="w-4 h-4 text-zinc-400" />,
            action: () => {
                onToggleSplitView();
                onClose();
            }
        },
        {
            id: "view-focus",
            title: "Toggle Zen Focus Mode",
            shortcut: "F11",
            category: "View",
            icon: <Maximize2 className="w-4 h-4 text-zinc-400" />,
            action: () => {
                onToggleFocusMode();
                onClose();
            }
        },
        {
            id: "view-page",
            title: "Toggle Page View vs Continuous View",
            category: "View",
            icon: <FileText className="w-4 h-4 text-zinc-400" />,
            action: () => {
                onTogglePageView();
                onClose();
            }
        },
        {
            id: "view-page-theme",
            title: pageTheme === "light" ? "Switch to Dark Page Theme" : "Switch to Light Page Theme",
            shortcut: "⌥T",
            category: "View",
            icon: pageTheme === "light" ? <Moon className="w-4 h-4 text-zinc-400" /> : <Sun className="w-4 h-4 text-zinc-400" />,
            action: () => {
                onTogglePageTheme?.();
                onClose();
            }
        },
        {
            id: "export-fdx",
            title: "Export Final Draft (.fdx)",
            category: "Export & Files",
            icon: <Download className="w-4 h-4 text-zinc-400" />,
            action: () => {
                onExportFdx();
                onClose();
            }
        },
        {
            id: "export-fountain",
            title: "Export Fountain (.fountain)",
            category: "Export & Files",
            icon: <Download className="w-4 h-4 text-zinc-400" />,
            action: () => {
                onExportFountain();
                onClose();
            }
        },
        {
            id: "export-pdf",
            title: "Print / Export to PDF",
            shortcut: "⌘P",
            category: "Export & Files",
            icon: <Printer className="w-4 h-4 text-zinc-400" />,
            action: () => {
                onPrintPdf();
                onClose();
            }
        }
    ];

    // Dynamic scene search items
    const sceneCommands: CommandItem[] = scenes.map((s) => ({
        id: `scene-jump-${s.pos}`,
        title: `Jump to Scene ${s.number}: ${s.slugline}`,
        category: "Navigation",
        icon: <Film className="w-4 h-4 text-zinc-400" />,
        action: () => {
            onJumpToScene(s.pos);
            onClose();
        }
    }));

    const allItems = [...baseCommands, ...sceneCommands];
    const filtered = allItems.filter(
        (item) => item.title.toLowerCase().includes(query.toLowerCase()) || item.category.toLowerCase().includes(query.toLowerCase())
    );

    return (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-start justify-center pt-24 p-4 animate-in fade-in duration-100">
            <div className="w-full max-w-xl bg-[#141721] border border-[#272d42] rounded-lg shadow-2xl overflow-hidden flex flex-col text-slate-200">
                <div className="flex items-center px-4 py-3 border-b border-[#272d42] bg-[#1b1f2e]">
                    <Search className="w-4 h-4 text-slate-400 mr-3 shrink-0" />
                    <input
                        id="commandQuery"
                        name="commandQuery"
                        type="text"
                        autoFocus
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Type a command or scene name (e.g. Scene 2, Export FDX, Dialogue)..."
                        className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
                    />
                    <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-200 rounded">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="max-h-80 overflow-y-auto p-2 space-y-1">
                    {filtered.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-500">No matching commands or scenes found.</div>
                    ) : (
                        filtered.map((item) => (
                            <button
                                key={item.id}
                                onClick={item.action}
                                className="flex items-center justify-between w-full px-3 py-2 text-xs rounded hover:bg-[#1b1f2e] transition-colors group text-left"
                            >
                                <div className="flex items-center gap-3">
                                    <span className="shrink-0">{item.icon}</span>
                                    <span className="font-medium text-slate-200 group-hover:text-slate-100">{item.title}</span>
                                    <span className="text-[10px] text-slate-500 font-mono">[{item.category}]</span>
                                </div>
                                {item.shortcut && (
                                    <span className="text-[10px] font-mono text-slate-500 bg-[#0b0d13] px-1.5 py-0.5 rounded border border-[#272d42]">
                                        {item.shortcut}
                                    </span>
                                )}
                            </button>
                        ))
                    )}
                </div>

                <div className="px-4 py-2 border-t border-[#272d42] bg-[#0b0d13] flex items-center justify-between text-[11px] font-mono text-slate-500">
                    <span>Navigate with mouse or click</span>
                    <span>ESC to close</span>
                </div>
            </div>
        </div>
    );
}
