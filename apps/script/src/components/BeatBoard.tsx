"use client";

import React, { useState, useEffect } from "react";
import { Plus, Trash2, CornerDownLeft, Layers, Bookmark, ArrowLeft, ArrowRight, X, Check, Film } from "lucide-react";

export interface BeatCard {
  id: string;
  title: string;
  synopsis: string;
  sceneHeading?: string;
}

export interface BeatColumn {
  id: string;
  title: string;
  cards: BeatCard[];
}

interface BeatBoardProps {
  scriptId?: string;
  onInsertBeatToScript?: (title: string, synopsis: string) => void;
  sceneHeadings?: string[];
}

const DEFAULT_COLUMNS: BeatColumn[] = [
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

export function BeatBoard({
  scriptId,
  onInsertBeatToScript,
  sceneHeadings = []
}: BeatBoardProps) {
  const storageKey = `stairway_beatboard_${scriptId || "default"}`;

  const [columns, setColumns] = useState<BeatColumn[]>(DEFAULT_COLUMNS);

  // load saved columns from local storage on mount or when scriptId changes
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          setColumns(JSON.parse(saved));
          return;
        }
      } catch {}
      setColumns(DEFAULT_COLUMNS);
    }
  }, [storageKey]);

  // sync columns to local storage on change
  const updateColumnsAndPersist = (newCols: BeatColumn[] | ((prev: BeatColumn[]) => BeatColumn[])) => {
    setColumns((prev) => {
      const resolved = typeof newCols === "function" ? newCols(prev) : newCols;
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(storageKey, JSON.stringify(resolved));
        } catch {}
      }
      return resolved;
    });
  };

  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [cardDraft, setCardDraft] = useState<{ title: string; synopsis: string; sceneHeading: string }>({
    title: "",
    synopsis: "",
    sceneHeading: ""
  });
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [columnTitleDraft, setColumnTitleDraft] = useState("");

  const startEditCard = (card: BeatCard) => {
    setEditingCardId(card.id);
    setCardDraft({
      title: card.title,
      synopsis: card.synopsis,
      sceneHeading: card.sceneHeading || ""
    });
  };

  const saveEditCard = (columnId: string, cardId: string) => {
    updateColumnsAndPersist((prev) =>
      prev.map((col) =>
        col.id === columnId
          ? {
              ...col,
              cards: col.cards.map((c) =>
                c.id === cardId
                  ? {
                      ...c,
                      title: cardDraft.title.trim() || "Untitled Beat",
                      synopsis: cardDraft.synopsis.trim(),
                      sceneHeading: cardDraft.sceneHeading.trim() || undefined
                    }
                  : c
              )
            }
          : col
      )
    );
    setEditingCardId(null);
  };

  const addCard = (columnId: string) => {
    const newCard: BeatCard = {
      id: `beat-${Date.now()}`,
      title: "New Beat",
      synopsis: "Outline story dynamics, stakes, and scene intent here..."
    };

    updateColumnsAndPersist((prev) =>
      prev.map((col) => (col.id === columnId ? { ...col, cards: [...col.cards, newCard] } : col))
    );
    startEditCard(newCard);
  };

  const deleteCard = (columnId: string, cardId: string) => {
    updateColumnsAndPersist((prev) =>
      prev.map((col) =>
        col.id === columnId
          ? {
              ...col,
              cards: col.cards.filter((c) => c.id !== cardId)
            }
          : col
      )
    );
    if (editingCardId === cardId) {
      setEditingCardId(null);
    }
  };

  const moveCard = (sourceColIndex: number, targetColIndex: number, cardId: string) => {
    if (targetColIndex < 0 || targetColIndex >= columns.length) return;

    updateColumnsAndPersist((prev) => {
      const sourceCol = prev[sourceColIndex];
      const targetCol = prev[targetColIndex];
      if (!sourceCol || !targetCol) return prev;
      const card = sourceCol.cards.find((c) => c.id === cardId);
      if (!card) return prev;

      return prev.map((col, idx) => {
        if (idx === sourceColIndex) {
          return { ...col, cards: col.cards.filter((c) => c.id !== cardId) };
        }
        if (idx === targetColIndex) {
          return { ...col, cards: [...col.cards, card] };
        }
        return col;
      });
    });
  };

  const addColumn = () => {
    const actNumber = columns.length + 1;
    const newCol: BeatColumn = {
      id: `act-${Date.now()}`,
      title: `Sequence ${actNumber}`,
      cards: []
    };
    updateColumnsAndPersist((prev) => [...prev, newCol]);
  };

  const startEditColumn = (col: BeatColumn) => {
    setEditingColumnId(col.id);
    setColumnTitleDraft(col.title);
  };

  const saveEditColumn = (colId: string) => {
    if (columnTitleDraft.trim()) {
      updateColumnsAndPersist((prev) =>
        prev.map((col) => (col.id === colId ? { ...col, title: columnTitleDraft.trim() } : col))
      );
    }
    setEditingColumnId(null);
  };

  // allow deleting any column including initial column
  const deleteColumn = (colId: string) => {
    updateColumnsAndPersist((prev) => prev.filter((col) => col.id !== colId));
  };

  const syncScenesAsCards = () => {
    if (sceneHeadings.length === 0) return;
    const syncedCards: BeatCard[] = sceneHeadings.map((slug, idx) => ({
      id: `scene-beat-${idx}-${Date.now()}`,
      title: slug,
      synopsis: `Scene ${idx + 1} imported from script outline.`,
      sceneHeading: slug
    }));

    updateColumnsAndPersist((prev) => [
      {
        id: "synced-scenes",
        title: "Script Scenes",
        cards: syncedCards
      },
      ...prev.filter((c) => c.id !== "synced-scenes")
    ]);
  };

  const totalBeats = columns.reduce((acc, col) => acc + col.cards.length, 0);

  return (
    <div className="flex flex-col h-full bg-[#0d0f14] text-slate-200 select-none">
      {/* Sleek Minimalist Top Header */}
      <div className="flex items-center justify-between px-6 py-2.5 border-b border-[#222533] bg-[#12141c]">
        <div className="flex items-center gap-3">
          <Layers className="w-4 h-4 text-slate-400" />
          <h2 className="text-xs font-semibold tracking-wider text-slate-100 uppercase">
            Plot Board
          </h2>
          <span className="text-[11px] text-slate-500 font-mono">
            {totalBeats} beats across {columns.length} columns
          </span>
        </div>
        <div className="flex items-center gap-2">
          {sceneHeadings.length > 0 && (
            <button
              onClick={syncScenesAsCards}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-[#161822] hover:bg-[#1e2230] border border-[#262a3a] hover:border-slate-500 rounded transition-colors"
            >
              <Bookmark className="w-3.5 h-3.5 text-slate-400" />
              Sync from Script ({sceneHeadings.length})
            </button>
          )}
        </div>
      </div>

      {/* Columns Container */}
      <div className="flex-1 p-6 overflow-x-auto">
        <div className="flex gap-5 min-w-max h-full items-start">
          {columns.map((column, colIndex) => (
            <div
              key={column.id}
              className="flex flex-col w-84 min-w-[21rem] max-w-[21rem] max-h-full bg-[#13151e] border border-[#222533] rounded-lg shadow-xl"
            >
              {/* Column Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#222533] bg-[#171a25] rounded-t-lg">
                {editingColumnId === column.id ? (
                  <div className="flex items-center gap-1 flex-1 mr-2">
                    <input
                      type="text"
                      value={columnTitleDraft}
                      onChange={(e) => setColumnTitleDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEditColumn(column.id);
                        if (e.key === "Escape") setEditingColumnId(null);
                      }}
                      autoFocus
                      className="w-full px-2 py-0.5 text-xs bg-[#0e1017] border border-[#2a2e3f] rounded text-slate-100 font-semibold focus:outline-none"
                    />
                    <button
                      onClick={() => saveEditColumn(column.id)}
                      className="p-1 text-slate-300 hover:text-white"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span
                      onClick={() => startEditColumn(column)}
                      className="text-xs font-semibold text-slate-200 uppercase tracking-wider cursor-pointer hover:text-white truncate"
                      title="Click to rename"
                    >
                      {column.title}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400 px-1.5 py-0.2 rounded bg-[#0e1017] border border-[#222533] shrink-0">
                      {column.cards.length}
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => addCard(column.id)}
                    className="p-1 text-slate-400 hover:text-slate-200 rounded hover:bg-[#1f2230] transition-colors"
                    title="Add beat card"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => deleteColumn(column.id)}
                    className="p-1 text-slate-500 hover:text-red-400 rounded hover:bg-[#1f2230] transition-colors"
                    title="Delete column"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Cards List */}
              <div className="flex-1 p-3 overflow-y-auto space-y-3">
                {column.cards.map((card) => {
                  const isEditing = editingCardId === card.id;

                  return (
                    <div
                      key={card.id}
                      className="group p-4 bg-[#181a26] hover:bg-[#1d2030] border border-[#262938] hover:border-[#383d52] rounded-lg transition-all shadow-sm relative flex flex-col"
                    >
                      {isEditing ? (
                        <div className="space-y-2.5">
                          <div>
                            <label className="block text-[10px] font-mono uppercase text-slate-500 mb-1">
                              Title
                            </label>
                            <input
                              type="text"
                              value={cardDraft.title}
                              onChange={(e) => setCardDraft((prev) => ({ ...prev, title: e.target.value }))}
                              className="w-full px-2.5 py-1.5 text-xs bg-[#0e1017] border border-[#2d3142] rounded text-slate-100 focus:outline-none focus:border-slate-400 font-semibold"
                              placeholder="Beat Title"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-mono uppercase text-slate-500 mb-1">
                              Slugline (Optional)
                            </label>
                            <input
                              type="text"
                              value={cardDraft.sceneHeading}
                              onChange={(e) => setCardDraft((prev) => ({ ...prev, sceneHeading: e.target.value }))}
                              className="w-full px-2.5 py-1 text-[11px] font-mono bg-[#0e1017] border border-[#2d3142] rounded text-slate-300 uppercase focus:outline-none focus:border-slate-400"
                              placeholder="INT. LOCATION - NIGHT"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-mono uppercase text-slate-500 mb-1">
                              Synopsis
                            </label>
                            <textarea
                              value={cardDraft.synopsis}
                              onChange={(e) => setCardDraft((prev) => ({ ...prev, synopsis: e.target.value }))}
                              className="w-full px-2.5 py-1.5 text-xs bg-[#0e1017] border border-[#2d3142] rounded text-slate-200 focus:outline-none focus:border-slate-400 resize-none h-24 leading-relaxed"
                              placeholder="Describe beat events and character decisions..."
                            />
                          </div>

                          <div className="flex items-center justify-end gap-2 pt-1 border-t border-[#262938]">
                            <button
                              onClick={() => setEditingCardId(null)}
                              className="px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => saveEditCard(column.id, card.id)}
                              className="px-3 py-1 text-xs bg-slate-200 hover:bg-white text-slate-900 rounded font-medium transition-colors"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          {/* Scene Slugline */}
                          {card.sceneHeading && (
                            <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1.5 truncate">
                              <Film className="w-3 h-3 text-slate-500 shrink-0" />
                              <span className="truncate">{card.sceneHeading}</span>
                            </div>
                          )}

                          {/* Card Title */}
                          <h4
                            onClick={() => startEditCard(card)}
                            className="text-[13px] font-semibold text-slate-100 group-hover:text-white cursor-pointer tracking-tight leading-snug"
                          >
                            {card.title}
                          </h4>

                          {/* High-Contrast Legible Synopsis */}
                          <p
                            onClick={() => startEditCard(card)}
                            className="mt-2 text-xs text-slate-300 group-hover:text-slate-200 cursor-pointer whitespace-pre-wrap leading-relaxed"
                          >
                            {card.synopsis}
                          </p>

                          {/* Footer Actions */}
                          <div className="flex items-center justify-between pt-3 mt-3 border-t border-[#242738] text-[11px] text-slate-400">
                            {onInsertBeatToScript ? (
                              <button
                                onClick={() => onInsertBeatToScript(card.title, card.synopsis)}
                                className="flex items-center gap-1.5 text-slate-400 hover:text-slate-100 transition-colors font-medium"
                                title="Insert beat to screenplay"
                              >
                                <CornerDownLeft className="w-3 h-3" />
                                Insert to script
                              </button>
                            ) : (
                              <div />
                            )}

                            <div className="flex items-center gap-1">
                              {colIndex > 0 && (
                                <button
                                  onClick={() => moveCard(colIndex, colIndex - 1, card.id)}
                                  className="p-1 text-slate-500 hover:text-slate-200 transition-colors rounded"
                                  title="Move to previous act"
                                >
                                  <ArrowLeft className="w-3 h-3" />
                                </button>
                              )}
                              {colIndex < columns.length - 1 && (
                                <button
                                  onClick={() => moveCard(colIndex, colIndex + 1, card.id)}
                                  className="p-1 text-slate-500 hover:text-slate-200 transition-colors rounded"
                                  title="Move to next act"
                                >
                                  <ArrowRight className="w-3 h-3" />
                                </button>
                              )}
                              <button
                                onClick={() => deleteCard(column.id, card.id)}
                                className="p-1 text-slate-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 rounded ml-1"
                                title="Delete beat"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                <button
                  onClick={() => addCard(column.id)}
                  className="flex items-center justify-center gap-1.5 w-full py-2.5 text-xs font-medium text-slate-400 hover:text-slate-200 bg-[#0e1017]/40 hover:bg-[#161822] border border-dashed border-[#242738] hover:border-slate-500 rounded-md transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Beat
                </button>
              </div>
            </div>
          ))}

          {/* Add Column Button */}
          <button
            onClick={addColumn}
            className="flex items-center justify-center gap-2 w-84 min-w-[21rem] h-28 border border-dashed border-[#242738] hover:border-slate-500 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors bg-[#11131b]/40 hover:bg-[#141620]"
          >
            <Plus className="w-4 h-4" />
            Add Act Column
          </button>
        </div>
      </div>
    </div>
  );
}
