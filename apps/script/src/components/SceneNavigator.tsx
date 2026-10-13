"use client";

import React, { useState } from "react";
import { Film, ChevronLeft, ChevronRight, Search, Plus, ArrowUp, ArrowDown, Trash2 } from "lucide-react";

export interface SceneItem {
  id: string;
  number: number;
  slugline: string;
  pos: number;
  page?: number;
}

interface SceneNavigatorProps {
  scenes: SceneItem[];
  scenePages?: Record<number, number>;
  characters?: string[];
  isOpen: boolean;
  setIsOpen: (val: boolean) => void;
  onSelectScene: (pos: number) => void;
  onAddScene?: () => void;
  onDeleteScene?: (pos: number) => void;
  onMoveSceneUp?: (index: number) => void;
  onMoveSceneDown?: (index: number) => void;
  totalPages: number;
}

export function SceneNavigator({
  scenes,
  scenePages,
  isOpen,
  setIsOpen,
  onSelectScene,
  onAddScene,
  onDeleteScene,
  onMoveSceneUp,
  onMoveSceneDown,
  totalPages
}: SceneNavigatorProps) {
  const [filterQuery, setFilterQuery] = useState("");

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="no-print absolute left-3 top-12 z-20 p-2 bg-[#12141a] hover:bg-[#181a24] border border-[#262933] rounded text-slate-300 hover:text-white transition-colors shadow-md"
        title="Open Scenes Outline"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    );
  }

  const filteredScenes = scenes.filter((s) =>
    s.slugline.toLowerCase().includes(filterQuery.toLowerCase())
  );

  return (
    <aside className="no-print flex flex-col w-72 h-[calc(100vh-40px)] bg-[#12141a] border-r border-[#262933] text-xs select-none shrink-0 z-20">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#262933] bg-[#0e1015]">
        <div className="flex items-center gap-2 font-medium text-slate-200 uppercase tracking-wider text-xs">
          <Film className="w-4 h-4 text-slate-400" />
          <span>Scenes ({scenes.length})</span>
        </div>
        <div className="flex items-center gap-1">
          {onAddScene && (
            <button
              onClick={onAddScene}
              className="text-slate-400 hover:text-slate-200 p-1.5 rounded hover:bg-[#1c1f2b] transition-colors"
              title="Add Scene Heading"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => setIsOpen(false)}
            className="text-slate-500 hover:text-slate-300 p-1.5 rounded hover:bg-[#1c1f2b] transition-colors"
            title="Collapse Outline"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Telemetry info */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#262933] bg-[#0e1015]/40 text-xs font-mono text-slate-400">
        <span>{totalPages} {totalPages === 1 ? "page" : "pages"} (~{totalPages} min)</span>
        <span>{scenes.length} {scenes.length === 1 ? "scene" : "scenes"}</span>
      </div>

      {/* Filter Input */}
      <div className="p-2.5 border-b border-[#262933]">
        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-[#0e1015] border border-[#262933] rounded text-slate-300">
          <Search className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <input
            id="filterScenes"
            name="filterScenes"
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Filter scenes..."
            className="w-full bg-transparent text-xs placeholder-slate-500 focus:outline-none font-mono"
          />
        </div>
      </div>

      {/* Scene Headings List with Arc Studio page markers */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filteredScenes.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-xs font-mono">
            {filterQuery ? "No matching scenes" : "No scenes yet."}
          </div>
        ) : (
          filteredScenes.map((scene, idx) => {
            const pageNum = scene.page || scenePages?.[scene.pos] || 1;
            const prevScene = idx > 0 ? filteredScenes[idx - 1] : null;
            const prevPageNum = prevScene ? prevScene.page || scenePages?.[prevScene.pos] || 1 : 1;
            const isNewPage = idx === 0 ? false : pageNum > prevPageNum;

            return (
              <React.Fragment key={scene.id}>
                {isNewPage && (
                  <div className="flex items-center gap-2 py-1.5 px-1.5 my-1.5 border-t border-dashed border-[#262933] text-[11px] font-mono text-slate-400">
                    <span className="bg-[#12141a] pr-1 uppercase tracking-widest">
                      p. {pageNum}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between w-full px-2.5 py-2 rounded hover:bg-[#181a24] border border-transparent hover:border-[#262933] transition-colors group">
                  <button
                    onClick={() => onSelectScene(scene.pos)}
                    className="flex items-start gap-2.5 text-left flex-1 min-w-0"
                  >
                    <span className="font-mono text-xs text-slate-400 group-hover:text-slate-200 pt-0.5 shrink-0">
                      {String(scene.number).padStart(2, "0")}
                    </span>
                    <span className="text-[13px] text-slate-200 group-hover:text-white uppercase tracking-tight truncate font-mono font-medium">
                      {scene.slugline}
                    </span>
                  </button>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-1.5">
                    {onMoveSceneUp && idx > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onMoveSceneUp(idx);
                        }}
                        className="p-1 text-slate-400 hover:text-slate-200 hover:bg-[#252838] rounded transition-colors"
                        title="Move up"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {onMoveSceneDown && idx < filteredScenes.length - 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onMoveSceneDown(idx);
                        }}
                        className="p-1 text-slate-400 hover:text-slate-200 hover:bg-[#252838] rounded transition-colors"
                        title="Move down"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {onDeleteScene && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteScene(scene.pos);
                        }}
                        className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
                        title="Delete scene"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </React.Fragment>
            );
          })
        )}
      </div>
    </aside>
  );
}
