"use client";

import React, { useState, useEffect } from "react";
import { Plus, Trash2, ArrowUp, ArrowDown, ChevronDown, ChevronRight, CornerDownLeft, Search } from "lucide-react";
import type { BeatColumn, BeatCard } from "./BeatBoard";

interface OutlineViewProps {
    scriptId?: string;
    onInsertBeatToScript?: (title: string, synopsis: string) => void;
    onJumpToScene?: (slugline: string) => void;
    sceneHeadings?: string[];
}

const DEFAULT_ACTS: BeatColumn[] = [
    {
        id: "act-1",
        title: "Act I - Setup",
        cards: [
            {
                id: "beat-1",
                title: "Cold Open",
                synopsis: "Establish tone and introduce protagonist in normal world with underlying tension.",
                sceneHeading: "INT. WORKSHOP - NIGHT"
            },
            {
                id: "beat-2",
                title: "Inciting Incident",
                synopsis: "An unexpected discovery disrupts the established status quo.",
                sceneHeading: "EXT. CITY STREET - DAY"
            }
        ]
    },
    {
        id: "act-2",
        title: "Act II - Confrontation",
        cards: [
            {
                id: "beat-3",
                title: "Midpoint Shift",
                synopsis: "The stakes are raised from proactive exploration to existential survival.",
                sceneHeading: "INT. ARCHIVE VAULT - NIGHT"
            },
            {
                id: "beat-4",
                title: "All Is Lost",
                synopsis: "The initial plan collapses. The protagonist confronts severe consequences.",
                sceneHeading: "EXT. ABANDONED PIER - DUSK"
            }
        ]
    },
    {
        id: "act-3",
        title: "Act III - Resolution",
        cards: [
            {
                id: "beat-5",
                title: "Climax",
                synopsis: "Final confrontation testing the core theme, courage, and resolve.",
                sceneHeading: "INT. SUMMIT CHAMBER - NIGHT"
            },
            {
                id: "beat-6",
                title: "Resolution",
                synopsis: "A new normal forms. Lingering questions answer the central dramatic premise.",
                sceneHeading: "EXT. OVERLOOK - DAWN"
            }
        ]
    }
];

const ACT_COLOR_CLASSES = ["border-l-[#4c8aec]", "border-l-amber-500", "border-l-emerald-500", "border-l-purple-500", "border-l-rose-500"];

export function OutlineView({ scriptId, onInsertBeatToScript, onJumpToScene, sceneHeadings = [] }: OutlineViewProps) {
    const storageKey = `stairway_beatboard_${scriptId || "default"}`;
    const [acts, setActs] = useState<BeatColumn[]>(DEFAULT_ACTS);
    const [filterQuery, setFilterQuery] = useState("");
    const [collapsedActs, setCollapsedActs] = useState<Record<string, boolean>>({});

    // load saved acts from shared storage on mount
    useEffect(() => {
        if (typeof window !== "undefined") {
            try {
                const saved = localStorage.getItem(storageKey);
                if (saved) {
                    setActs(JSON.parse(saved));
                    return;
                }
            } catch {}
            setActs(DEFAULT_ACTS);
        }
    }, [storageKey]);

    // persist updates to storage so beat board and outline share live state
    const updateActs = (newActs: BeatColumn[] | ((prev: BeatColumn[]) => BeatColumn[])) => {
        setActs((prev) => {
            const resolved = typeof newActs === "function" ? newActs(prev) : newActs;
            if (typeof window !== "undefined") {
                try {
                    localStorage.setItem(storageKey, JSON.stringify(resolved));
                } catch {}
            }
            return resolved;
        });
    };

    const toggleCollapse = (actId: string) => {
        setCollapsedActs((prev) => ({ ...prev, [actId]: !prev[actId] }));
    };

    const toggleCollapseAll = () => {
        const allCollapsed = acts.every((a) => collapsedActs[a.id]);
        const next: Record<string, boolean> = {};
        for (const act of acts) {
            next[act.id] = !allCollapsed;
        }
        setCollapsedActs(next);
    };

    const handleAddAct = () => {
        const num = acts.length + 1;
        const newAct: BeatColumn = {
            id: `act-${Date.now()}`,
            title: `Act ${num} - Sequence`,
            cards: []
        };
        updateActs((prev) => [...prev, newAct]);
    };

    const handleDeleteAct = (actId: string) => {
        updateActs((prev) => prev.filter((a) => a.id !== actId));
    };

    const handleUpdateActTitle = (actId: string, title: string) => {
        updateActs((prev) => prev.map((a) => (a.id === actId ? { ...a, title } : a)));
    };

    const handleAddBeat = (actId: string) => {
        const newCard: BeatCard = {
            id: `beat-${Date.now()}`,
            title: "New Beat",
            synopsis: "Describe the narrative beat or turning point...",
            sceneHeading: sceneHeadings[0] || ""
        };
        updateActs((prev) =>
            prev.map((a) => {
                if (a.id !== actId) return a;
                return { ...a, cards: [...a.cards, newCard] };
            })
        );
    };

    const handleDeleteBeat = (actId: string, cardId: string) => {
        updateActs((prev) =>
            prev.map((a) => {
                if (a.id !== actId) return a;
                return { ...a, cards: a.cards.filter((c) => c.id !== cardId) };
            })
        );
    };

    const handleUpdateBeat = (actId: string, cardId: string, updates: Partial<BeatCard>) => {
        updateActs((prev) =>
            prev.map((a) => {
                if (a.id !== actId) return a;
                return {
                    ...a,
                    cards: a.cards.map((c) => (c.id === cardId ? { ...c, ...updates } : c))
                };
            })
        );
    };

    const handleMoveBeat = (actId: string, cardIndex: number, direction: -1 | 1) => {
        updateActs((prev) =>
            prev.map((a) => {
                if (a.id !== actId) return a;
                const targetIdx = cardIndex + direction;
                if (targetIdx < 0 || targetIdx >= a.cards.length) return a;
                const nextCards = [...a.cards];
                const [moved] = nextCards.splice(cardIndex, 1);
                if (!moved) return a;
                nextCards.splice(targetIdx, 0, moved);
                return { ...a, cards: nextCards };
            })
        );
    };

    const totalBeats = acts.reduce((acc, a) => acc + a.cards.length, 0);

    return (
        <div className="flex-1 overflow-y-auto bg-[#1a1c1f] text-zinc-200 select-text">
            {/* Top Outline Controls Sub-toolbar */}
            <div className="no-print sticky top-0 z-20 flex items-center justify-between px-6 py-2.5 bg-[#16171a]/95 border-b border-[#33353a] backdrop-blur-md text-xs font-mono">
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-zinc-500 pointer-events-none" />
                        <input
                            type="text"
                            value={filterQuery}
                            onChange={(e) => setFilterQuery(e.target.value)}
                            placeholder="Filter outline beats..."
                            className="pl-8 pr-3 py-1 bg-[#27292c] border border-[#33353a] rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-[#4c8aec] w-48 sm:w-64 transition-colors"
                        />
                    </div>
                    <span className="text-zinc-500 hidden sm:inline">
                        {acts.length} acts - {totalBeats} beats
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={toggleCollapseAll}
                        className="px-2.5 py-1 rounded bg-[#27292c] hover:bg-[#33353a] border border-[#33353a] text-zinc-300 transition-colors"
                    >
                        Toggle All
                    </button>
                    <button
                        onClick={handleAddAct}
                        className="flex items-center gap-1 px-3 py-1 bg-[#4c8aec] hover:bg-[#3b7be0] text-white rounded font-medium transition-colors"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Act</span>
                    </button>
                </div>
            </div>

            {/* Document Outline Sheet */}
            <div className="max-w-3xl mx-auto py-10 px-6 space-y-8 pb-32">
                {acts.length === 0 ? (
                    <div className="text-center py-20 text-xs font-mono text-zinc-500 space-y-3">
                        <p>No acts or beats in outline.</p>
                        <button
                            onClick={handleAddAct}
                            className="px-3 py-1.5 bg-[#4c8aec] hover:bg-[#3b7be0] text-white rounded text-xs font-medium"
                        >
                            Create First Act
                        </button>
                    </div>
                ) : (
                    acts.map((act, actIndex) => {
                        const isCollapsed = Boolean(collapsedActs[act.id]);
                        const colorClass = ACT_COLOR_CLASSES[actIndex % ACT_COLOR_CLASSES.length];
                        const filteredCards = act.cards.filter((c) => {
                            if (!filterQuery.trim()) return true;
                            const q = filterQuery.toLowerCase();
                            return (
                                c.title.toLowerCase().includes(q) ||
                                c.synopsis.toLowerCase().includes(q) ||
                                (c.sceneHeading && c.sceneHeading.toLowerCase().includes(q))
                            );
                        });

                        return (
                            <section
                                key={act.id}
                                className="bg-[#212326] border border-[#33353a] rounded-2xl shadow-xl overflow-hidden transition-all"
                            >
                                {/* Act Header */}
                                <div className="flex items-center justify-between px-5 py-3.5 bg-[#16171a] border-b border-[#33353a]">
                                    <div className="flex items-center gap-2.5 flex-1 min-w-0 pr-3">
                                        <button
                                            onClick={() => toggleCollapse(act.id)}
                                            className="text-zinc-400 hover:text-zinc-200 p-0.5 rounded transition-colors"
                                            title={isCollapsed ? "Expand Act" : "Collapse Act"}
                                        >
                                            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                        </button>
                                        <input
                                            type="text"
                                            value={act.title}
                                            onChange={(e) => handleUpdateActTitle(act.id, e.target.value)}
                                            className="bg-transparent font-mono font-bold text-sm text-zinc-100 uppercase tracking-wider focus:outline-none focus:bg-[#27292c] px-1.5 py-0.5 rounded truncate flex-1"
                                        />
                                        <span className="text-[10px] font-mono text-zinc-500 px-1.5 py-0.5 rounded bg-[#27292c] shrink-0">
                                            {act.cards.length} beats
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <button
                                            onClick={() => handleAddBeat(act.id)}
                                            className="flex items-center gap-1 px-2.5 py-1 text-xs bg-[#27292c] hover:bg-[#33353a] text-zinc-200 rounded border border-[#33353a] transition-colors"
                                            title="Add beat to this act"
                                        >
                                            <Plus className="w-3 h-3 text-[#4c8aec]" />
                                            <span>Beat</span>
                                        </button>
                                        <button
                                            onClick={() => handleDeleteAct(act.id)}
                                            className="p-1 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
                                            title="Delete act"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>

                                {/* Beats List */}
                                {!isCollapsed && (
                                    <div className="p-4 space-y-3">
                                        {filteredCards.length === 0 ? (
                                            <div className="py-6 text-center text-xs font-mono text-zinc-500">
                                                {filterQuery ? "No matching beats." : "No beats in this act yet."}
                                            </div>
                                        ) : (
                                            filteredCards.map((card, cardIdx) => (
                                                <div
                                                    key={card.id}
                                                    className={`p-3.5 rounded-xl bg-[#27292c] border border-[#33353a] border-l-4 ${colorClass} space-y-2 hover:border-[#4c8aec]/50 transition-colors group`}
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <input
                                                            type="text"
                                                            value={card.title}
                                                            onChange={(e) => handleUpdateBeat(act.id, card.id, { title: e.target.value })}
                                                            placeholder="Beat title..."
                                                            className="bg-transparent font-mono font-bold text-xs text-zinc-100 focus:outline-none focus:bg-[#1a1c1f] px-1 py-0.5 rounded flex-1 truncate"
                                                        />

                                                        {/* Actions Toolbar */}
                                                        <div className="flex items-center gap-1 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
                                                            {onInsertBeatToScript && (
                                                                <button
                                                                    onClick={() => onInsertBeatToScript(card.title, card.synopsis)}
                                                                    className="p-1 text-zinc-400 hover:text-[#4c8aec] hover:bg-[#33353a] rounded transition-colors"
                                                                    title="Insert beat into screenplay"
                                                                >
                                                                    <CornerDownLeft className="w-3 h-3" />
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() => handleMoveBeat(act.id, cardIdx, -1)}
                                                                disabled={cardIdx === 0}
                                                                className="p-1 text-zinc-400 hover:text-zinc-200 disabled:opacity-20 hover:bg-[#33353a] rounded transition-colors"
                                                                title="Move up"
                                                            >
                                                                <ArrowUp className="w-3 h-3" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleMoveBeat(act.id, cardIdx, 1)}
                                                                disabled={cardIdx === act.cards.length - 1}
                                                                className="p-1 text-zinc-400 hover:text-zinc-200 disabled:opacity-20 hover:bg-[#33353a] rounded transition-colors"
                                                                title="Move down"
                                                            >
                                                                <ArrowDown className="w-3 h-3" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteBeat(act.id, card.id)}
                                                                className="p-1 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
                                                                title="Delete beat"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Beat Synopsis */}
                                                    <textarea
                                                        value={card.synopsis}
                                                        onChange={(e) => handleUpdateBeat(act.id, card.id, { synopsis: e.target.value })}
                                                        rows={2}
                                                        placeholder="Describe the beat narrative or character dynamic..."
                                                        className="w-full bg-[#1e2023] border border-[#33353a] focus:border-[#4c8aec] rounded-lg p-2 text-xs font-mono text-zinc-300 placeholder-zinc-500 focus:outline-none resize-none leading-relaxed transition-colors"
                                                    />

                                                    {/* Linked Scene Tag & Jump */}
                                                    <div className="flex items-center justify-between gap-2 pt-1 text-[11px] font-mono text-zinc-400">
                                                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                                            <span className="text-zinc-500 shrink-0">Scene:</span>
                                                            <select
                                                                value={card.sceneHeading || ""}
                                                                onChange={(e) =>
                                                                    handleUpdateBeat(act.id, card.id, { sceneHeading: e.target.value })
                                                                }
                                                                className="bg-[#1e2023] border border-[#33353a] focus:border-[#4c8aec] rounded px-2 py-0.5 text-[11px] text-zinc-200 focus:outline-none truncate max-w-xs"
                                                            >
                                                                <option value="">(Unlinked)</option>
                                                                {sceneHeadings.map((h, i) => (
                                                                    <option key={i} value={h}>
                                                                        {h}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>

                                                        {card.sceneHeading && onJumpToScene && (
                                                            <button
                                                                onClick={() => onJumpToScene(card.sceneHeading!)}
                                                                className="px-2 py-0.5 bg-[#16171a] hover:bg-[#33353a] border border-[#33353a] hover:border-[#4c8aec] text-zinc-300 hover:text-white rounded text-[10px] shrink-0 transition-colors"
                                                            >
                                                                Jump to Scene
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            ))
                                        )}

                                        <button
                                            onClick={() => handleAddBeat(act.id)}
                                            className="w-full py-2 border border-dashed border-[#33353a] hover:border-[#4c8aec] rounded-xl text-xs font-mono text-zinc-500 hover:text-zinc-300 transition-colors flex items-center justify-center gap-1.5"
                                        >
                                            <Plus className="w-3.5 h-3.5" />
                                            <span>Add Beat to {act.title}</span>
                                        </button>
                                    </div>
                                )}
                            </section>
                        );
                    })
                )}
            </div>
        </div>
    );
}
