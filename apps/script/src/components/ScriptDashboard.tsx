"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  FileText,
  Search,
  Plus,
  RotateCcw,
  MoreHorizontal,
  List,
  LayoutGrid,
  Trash2,
  Copy,
  Archive,
  X,
  ArrowUpRight,
  Edit2,
  PanelLeft,
  ChevronDown,
  Bookmark,
  FolderPlus,
  MoveRight,
  Clock,
  GripVertical,
  Download,
  UserPlus,
  LogOut,
  LayoutDashboard,
  FolderKanban
} from "lucide-react";
import { useStudioAuth } from "@/components/AccessGuard";
import { InviteUserModal } from "@/components/InviteUserModal";
import {
  getStoredScripts,
  getStoredShelves,
  saveStoredShelves,
  createNewScript,
  duplicateScript,
  deleteScript,
  toggleArchiveScript,
  updateScript,
  createShelf,
  renameShelf,
  deleteShelf,
  moveScriptToShelf,
  moveScriptBefore,
  moveScriptAfter
} from "@/lib/ScriptStorage";
import { exportToFdx } from "@/editor/format/fdx";
import { exportToFountain } from "@/editor/format/fountain";
import type { ScriptDocument, Shelf } from "@/types/script";

const DEFAULT_SCRIPT_CONTENT = {
  type: "doc",
  content: [
    {
      type: "sceneHeading",
      content: [{ type: "text", text: "INT. STUDIO - DAY" }]
    }
  ]
};

export function ScriptDashboard() {
  const router = useRouter();
  const { user, isAdmin, logout } = useStudioAuth();
  const [scripts, setScripts] = useState<ScriptDocument[]>([]);
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilterId, setActiveFilterId] = useState<string>("all");
  const [isGridView, setIsGridView] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // user profile menu & invite modal states
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  // drag and drop visual reordering states
  const [draggedScriptId, setDraggedScriptId] = useState<string | null>(null);
  const [dragOverShelfId, setDragOverShelfId] = useState<string | null>(null);
  const [dragOverScriptId, setDragOverScriptId] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<"before" | "after" | null>(null);

  // dialog & menu states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [targetShelfIdForCreate, setTargetShelfIdForCreate] = useState<string>("");

  // shelf management dialogs
  const [isCreateShelfOpen, setIsCreateShelfOpen] = useState(false);
  const [newShelfName, setNewShelfName] = useState("");
  const [renamingShelf, setRenamingShelf] = useState<Shelf | null>(null);
  const [renameShelfValue, setRenameShelfValue] = useState("");
  const [shelfMenuOpenId, setShelfMenuOpenId] = useState<string | null>(null);

  // script move to shelf dialog
  const [movingScript, setMovingScript] = useState<ScriptDocument | null>(null);

  // script context menu & rename
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renamingScript, setRenamingScript] = useState<ScriptDocument | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const refreshData = () => {
    const loadedScripts = getStoredScripts();
    const loadedShelves = getStoredShelves();

    // deduplicate shelves strictly by name and id
    const seenNames = new Set<string>();
    const seenIds = new Set<string>();
    const uniqueShelves: Shelf[] = [];
    for (const s of loadedShelves) {
      const nameKey = s.name.trim().toLowerCase();
      if (!seenNames.has(nameKey) && !seenIds.has(s.id)) {
        seenNames.add(nameKey);
        seenIds.add(s.id);
        uniqueShelves.push(s);
      }
    }
    if (uniqueShelves.length !== loadedShelves.length) {
      saveStoredShelves(uniqueShelves);
    }

    setScripts(loadedScripts);
    setShelves(uniqueShelves);
  };

  useEffect(() => {
    refreshData();
  }, []);

  // auto close context menus on outside click
  useEffect(() => {
    if (!menuOpenId && !shelfMenuOpenId && !isProfileMenuOpen) return;
    const handleOutsideClick = () => {
      setMenuOpenId(null);
      setShelfMenuOpenId(null);
      setIsProfileMenuOpen(false);
    };
    window.addEventListener("click", handleOutsideClick);
    return () => window.removeEventListener("click", handleOutsideClick);
  }, [menuOpenId, shelfMenuOpenId, isProfileMenuOpen]);

  const handleOpenScript = (id: string) => {
    router.push(`/editor?id=${encodeURIComponent(id)}`);
  };

  const handleCreateScript = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const title = newTitle.trim() || "Untitled Screenplay";
    const targetShelf = targetShelfIdForCreate || null;
    const created = createNewScript(title, targetShelf);
    setIsCreateOpen(false);
    setNewTitle("");
    setTargetShelfIdForCreate("");
    handleOpenScript(created.id);
  };

  const openCreateForShelf = (shelfId: string) => {
    setTargetShelfIdForCreate(shelfId);
    setNewTitle("");
    setIsCreateOpen(true);
  };

  const handleDuplicateScript = (id: string) => {
    duplicateScript(id);
    refreshData();
    setMenuOpenId(null);
  };

  const handleDeleteScript = (id: string) => {
    deleteScript(id);
    refreshData();
    setMenuOpenId(null);
  };

  const handleToggleArchiveScript = (id: string) => {
    toggleArchiveScript(id);
    refreshData();
    setMenuOpenId(null);
  };

  const handleSaveRenameScript = (e: React.FormEvent) => {
    e.preventDefault();
    if (!renamingScript) return;
    const trimmed = renameValue.trim();
    if (trimmed) {
      updateScript(renamingScript.id, { title: trimmed });
      refreshData();
    }
    setRenamingScript(null);
  };

  // shelf actions
  const handleCreateShelf = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newShelfName.trim();
    if (trimmed) {
      createShelf(trimmed);
      refreshData();
      setNewShelfName("");
      setIsCreateShelfOpen(false);
    }
  };

  const handleSaveRenameShelf = (e: React.FormEvent) => {
    e.preventDefault();
    if (!renamingShelf) return;
    const trimmed = renameShelfValue.trim();
    if (trimmed) {
      renameShelf(renamingShelf.id, trimmed);
      refreshData();
    }
    setRenamingShelf(null);
  };

  const handleDeleteShelf = (shelfId: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    deleteShelf(shelfId);
    if (activeFilterId === shelfId) {
      setActiveFilterId("all");
    }
    refreshData();
    setShelfMenuOpenId(null);
  };

  const handleExportScriptFdx = (script: ScriptDocument) => {
    const content = script.content || DEFAULT_SCRIPT_CONTENT;
    const xml = exportToFdx(content, script.title, script.author);
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${script.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.fdx`;
    a.click();
    URL.revokeObjectURL(url);
    setMenuOpenId(null);
  };

  const handleExportScriptFountain = (script: ScriptDocument) => {
    const content = script.content || DEFAULT_SCRIPT_CONTENT;
    const text = exportToFountain(content, script.title, script.author);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${script.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.fountain`;
    a.click();
    URL.revokeObjectURL(url);
    setMenuOpenId(null);
  };

  const handleMoveToShelf = (targetShelfId: string | null) => {
    if (!movingScript) return;
    moveScriptToShelf(movingScript.id, targetShelfId);
    refreshData();
    setMovingScript(null);
  };

  // drag and drop handlers for visual reordering
  const handleDragStart = (e: React.DragEvent, scriptId: string) => {
    e.dataTransfer.setData("text/plain", scriptId);
    e.dataTransfer.effectAllowed = "move";
    setDraggedScriptId(scriptId);
  };

  const handleDragEnd = () => {
    setDraggedScriptId(null);
    setDragOverShelfId(null);
    setDragOverScriptId(null);
    setDragPosition(null);
  };

  const handleShelfDragOver = (e: React.DragEvent, shelfId: string | null) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const key = shelfId || "unfiled";
    if (dragOverShelfId !== key) {
      setDragOverShelfId(key);
    }
  };

  const handleScriptDragOver = (e: React.DragEvent, scriptId: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";

    if (draggedScriptId === scriptId) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const isBefore = offsetY < rect.height / 2;
    const pos = isBefore ? "before" : "after";

    if (dragOverScriptId !== scriptId || dragPosition !== pos) {
      setDragOverScriptId(scriptId);
      setDragPosition(pos);
    }
  };

  const handleDropOnShelfContainer = (e: React.DragEvent, targetShelfId: string | null) => {
    e.preventDefault();
    if (!draggedScriptId) return;

    moveScriptToShelf(draggedScriptId, targetShelfId);
    refreshData();
    handleDragEnd();
  };

  const handleDropOnScript = (
    e: React.DragEvent,
    targetScriptId: string,
    targetShelfId: string | null
  ) => {
    e.preventDefault();
    e.stopPropagation();

    if (!draggedScriptId || draggedScriptId === targetScriptId) {
      handleDragEnd();
      return;
    }

    if (dragPosition === "before") {
      moveScriptBefore(draggedScriptId, targetScriptId, targetShelfId);
    } else {
      moveScriptAfter(draggedScriptId, targetScriptId, targetShelfId);
    }

    refreshData();
    handleDragEnd();
  };

  // shelf map for quick lookups
  const shelfMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of shelves) {
      map.set(s.id, s.name);
    }
    return map;
  }, [shelves]);

  // script counts per shelf
  const shelfCountMap = useMemo(() => {
    const counts: Record<string, number> = { all: 0, unfiled: 0, archived: 0 };
    for (const s of shelves) {
      counts[s.id] = 0;
    }
    for (const sc of scripts) {
      if (sc.category === "archived") {
        counts.archived = (counts.archived || 0) + 1;
      } else {
        counts.all = (counts.all || 0) + 1;
        if (sc.shelfId && counts[sc.shelfId] !== undefined) {
          counts[sc.shelfId] = (counts[sc.shelfId] || 0) + 1;
        } else {
          counts.unfiled = (counts.unfiled || 0) + 1;
        }
      }
    }
    return counts;
  }, [scripts, shelves]);

  // filter scripts by search query
  const searchFilteredScripts = useMemo(() => {
    if (!searchQuery.trim()) return scripts;
    const q = searchQuery.toLowerCase();
    return scripts.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        (s.logline && s.logline.toLowerCase().includes(q))
    );
  }, [scripts, searchQuery]);

  // active shelves to display: either all shelves, or single selected shelf
  const displayShelves = useMemo(() => {
    if (activeFilterId === "all") return shelves;
    return shelves.filter((s) => s.id === activeFilterId);
  }, [shelves, activeFilterId]);

  const unfiledScripts = useMemo(() => {
    return searchFilteredScripts.filter((s) => s.category !== "archived" && !s.shelfId);
  }, [searchFilteredScripts]);

  const archivedScripts = useMemo(() => {
    return searchFilteredScripts.filter((s) => s.category === "archived");
  }, [searchFilteredScripts]);

  const recentlyEditedScripts = useMemo(() => {
    return [...searchFilteredScripts]
      .filter((s) => s.category !== "archived")
      .sort((a, b) => b.lastModified - a.lastModified)
      .slice(0, 4);
  }, [searchFilteredScripts]);

  const formatTimestamp = (timestamp: number) => {
    const diffSec = Math.floor((Date.now() - timestamp) / 1000);
    if (diffSec < 60) return "Just now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return new Date(timestamp).toLocaleDateString([], {
      month: "short",
      day: "numeric"
    });
  };

  return (
    <div className="script-dashboard flex flex-col h-screen bg-[#131315] text-zinc-200 select-none overflow-hidden font-[family-name:var(--font-nunito)] text-[15px]">
      {/* Top Application Header */}
      <header className="h-[48px] px-4 bg-[#18181b] border-b border-[#242429] flex items-center justify-between text-sm text-zinc-300 shrink-0 z-30">
        <div className="flex items-center gap-3.5">
          <div className="flex items-center text-zinc-400">
            <button
              onClick={() => setIsSidebarOpen((prev) => !prev)}
              className={`p-1.5 rounded-lg transition-colors ${
                isSidebarOpen ? "text-white bg-[#252529]" : "hover:text-white hover:bg-[#252529]"
              }`}
              title="Toggle Sidebar"
            >
              <PanelLeft className="w-4 h-4" />
            </button>
          </div>

          <div className="h-4 w-px bg-[#28282e]" />

          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#6366f1]" />
            <span className="font-semibold text-zinc-100 tracking-wide text-sm">
              Studio
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={refreshData}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-[#242429] rounded-lg transition-colors"
            title="Refresh"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              setTargetShelfIdForCreate("");
              setIsCreateOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#6366f1] hover:bg-[#5254e0] text-white rounded-lg text-xs font-semibold transition-colors shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Screenplay</span>
          </button>
        </div>
      </header>

      {/* Main Layout: Left Sidebar + Center Stage */}
      <div className="flex flex-1 overflow-hidden">
        {/* Minimalist Left Navigation */}
        {isSidebarOpen && (
          <aside className="w-60 bg-[#18181b] border-r border-[#242429] flex flex-col justify-between shrink-0 p-3">
          <div className="space-y-4">
            {/* User Profile - seamless, unboxed */}
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsProfileMenuOpen((prev) => !prev);
                }}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-[#222226] cursor-pointer transition-colors group text-left"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {user?.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt=""
                      className="w-7 h-7 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-[#6366f1]/20 text-[#a5b4fc] flex items-center justify-center font-bold text-xs shrink-0 uppercase">
                      {(user?.globalName || user?.username || "PS").slice(0, 2)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-zinc-200 group-hover:text-white truncate">
                      {user?.globalName || user?.username || "Studio"}
                    </div>
                    <div className="text-[11px] text-zinc-500 capitalize">
                      {user?.role === "super_admin"
                        ? "Super Admin"
                        : user?.role === "admin"
                        ? "Administrator"
                        : user?.isInvited
                        ? "Invited Editor"
                        : user?.role || "Member"}
                    </div>
                  </div>
                </div>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-300 transition-transform ${
                    isProfileMenuOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {/* Profile Dropdown Menu */}
              {isProfileMenuOpen && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute left-0 top-full mt-1.5 w-60 bg-[#1c1c20] border border-[#2e2e34] rounded-xl shadow-2xl p-1.5 z-50 text-xs animate-in fade-in slide-in-from-top-1 select-none"
                >
                  <div className="px-2.5 py-2 border-b border-[#28282e]">
                    <div className="font-semibold text-zinc-100 truncate">
                      {user?.globalName || user?.username}
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-zinc-500 font-mono mt-0.5">
                      <span className="truncate">ID: {user?.discordId || user?.id}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const idToCopy = user?.discordId || user?.id || "";
                          if (idToCopy) {
                            navigator.clipboard.writeText(idToCopy);
                            setCopiedId(true);
                            setTimeout(() => setCopiedId(false), 2000);
                          }
                        }}
                        className="text-[10px] text-[#818cf8] hover:text-[#a5b4fc] ml-1 shrink-0"
                      >
                        {copiedId ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>

                  <div className="py-1">
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsProfileMenuOpen(false);
                          setIsInviteModalOpen(true);
                        }}
                        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-zinc-300 hover:text-white hover:bg-[#252529] transition-colors text-left"
                      >
                        <UserPlus className="w-3.5 h-3.5 text-[#818cf8]" />
                        <span>Invite User</span>
                      </button>
                    )}
                  </div>

                  <div className="pt-1 border-t border-[#28282e]">
                    <button
                      type="button"
                      onClick={() => logout()}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors text-left"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Primary Navigation Links (Matching Arc Studio media_1791875444451.png) */}
            <nav className="space-y-1">
              <button
                onClick={() => setActiveFilterId("all")}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeFilterId === "all"
                    ? "bg-[#252529] text-[#818cf8]"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-[#202024]"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <LayoutDashboard className={`w-4 h-4 ${activeFilterId === "all" ? "text-[#818cf8]" : "text-zinc-400"}`} />
                  <span>Dashboard</span>
                </div>
              </button>

              <div
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors group ${
                  activeFilterId === "unfiled"
                    ? "bg-[#252529] text-white"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-[#202024]"
                }`}
              >
                <button
                  onClick={() => setActiveFilterId("unfiled")}
                  className="flex items-center gap-2.5 flex-1 text-left"
                >
                  <FileText className="w-4 h-4 text-zinc-400" />
                  <span>Scripts</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setTargetShelfIdForCreate("");
                    setIsCreateOpen(true);
                  }}
                  className="p-1 rounded text-zinc-500 hover:text-white hover:bg-[#28282e] transition-colors"
                  title="New Screenplay"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                onClick={() => setActiveFilterId("all")}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:bg-[#202024] transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <FolderKanban className="w-4 h-4 text-zinc-400" />
                  <span>Projects</span>
                </div>
                <span className="text-xs font-mono text-zinc-500">
                  {shelves.length}
                </span>
              </button>
            </nav>

            <div className="h-px bg-[#242429] my-2" />

            {/* Custom Shelves List in Sidebar with Drop Targets */}
            <div>
              <div className="flex items-center justify-between px-2.5 mb-2 text-xs text-zinc-400">
                <span className="font-semibold uppercase tracking-wider text-zinc-500">
                  Shelves
                </span>
                <button
                  onClick={() => setIsCreateShelfOpen(true)}
                  className="p-1 rounded hover:bg-[#252529] hover:text-white transition-colors"
                  title="Create Shelf"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-1">
                {shelves.map((shelf) => {
                  const isDropHover = dragOverShelfId === shelf.id;

                  return (
                    <div
                      key={shelf.id}
                      onClick={() => setActiveFilterId(shelf.id)}
                      onDragOver={(e) => handleShelfDragOver(e, shelf.id)}
                      onDragLeave={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                          setDragOverShelfId(null);
                        }
                      }}
                      onDrop={(e) => handleDropOnShelfContainer(e, shelf.id)}
                      className={`group flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all ${
                        activeFilterId === shelf.id
                          ? "bg-[#252529] text-white"
                          : isDropHover
                          ? "bg-[#6366f1]/20 text-white ring-1 ring-[#6366f1]"
                          : "text-zinc-400 hover:text-zinc-200 hover:bg-[#202024]"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Bookmark className="w-4 h-4 text-[#818cf8] shrink-0" />
                        <span className="truncate">{shelf.name}</span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-mono text-zinc-500">
                          {shelfCountMap[shelf.id] || 0}
                        </span>

                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity"
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setRenamingShelf(shelf);
                              setRenameShelfValue(shelf.name);
                            }}
                            className="p-0.5 text-zinc-500 hover:text-zinc-200"
                            title="Rename shelf"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => handleDeleteShelf(shelf.id, e)}
                            className="p-0.5 text-zinc-500 hover:text-red-400"
                            title="Delete shelf"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="h-px bg-[#242429] my-2" />

            {/* Archive Link */}
            <nav className="space-y-0.5">
              <button
                onClick={() => setActiveFilterId("archived")}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeFilterId === "archived"
                    ? "bg-[#252529] text-white"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-[#202024]"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Archive className="w-4 h-4 text-zinc-500" />
                  <span>Archived</span>
                </div>
                <span className="text-xs font-mono text-zinc-500">
                  {shelfCountMap.archived || 0}
                </span>
              </button>
            </nav>
          </div>

          {/* Quick Create Shelf button in sidebar footer */}
          <div className="pt-3 border-t border-[#242429]">
            <button
              onClick={() => setIsCreateShelfOpen(true)}
              className="w-full py-2 px-3.5 bg-[#202024] hover:bg-[#28282e] border border-[#2c2c32] text-zinc-300 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              <FolderPlus className="w-4 h-4 text-[#818cf8]" />
              <span>New Shelf</span>
            </button>
          </div>
        </aside>
        )}

        {/* Center Main Stage */}
        <main className="flex-1 bg-[#131315] overflow-y-auto px-8 py-6 space-y-6">
          <div className="max-w-5xl w-full mx-auto space-y-6">
            {/* Header Row: Title & Actions */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-zinc-100 tracking-tight">
                  Dashboard
                </h1>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsCreateShelfOpen(true)}
                  className="px-3.5 py-1.5 bg-[#202024] hover:bg-[#28282e] border border-[#2e2e34] text-zinc-200 rounded-lg text-xs font-medium transition-colors flex items-center gap-2"
                >
                  <FolderPlus className="w-3.5 h-3.5 text-[#818cf8]" />
                  <span>New Shelf</span>
                </button>

                <div className="flex items-center gap-1 text-zinc-400 bg-[#202024] p-0.5 rounded-lg border border-[#2e2e34]">
                  <button
                    onClick={() => setIsGridView(false)}
                    className={`p-1.5 rounded-md transition-colors ${
                      !isGridView ? "text-white bg-[#28282e]" : "hover:text-zinc-200"
                    }`}
                    title="List View"
                  >
                    <List className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setIsGridView(true)}
                    className={`p-1.5 rounded-md transition-colors ${
                      isGridView ? "text-white bg-[#28282e]" : "hover:text-zinc-200"
                    }`}
                    title="Grid View"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Arc Studio Full-Width Pill Search (media_1791875444451.png) */}
            <div className="w-full flex items-center gap-3.5 px-4.5 py-2.5 bg-[#252529] border border-[#303036] rounded-full focus-within:border-[#6366f1] focus-within:ring-1 focus-within:ring-[#6366f1]/30 transition-all">
              <Search className="w-4 h-4 text-zinc-400 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search scripts..."
                className="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-400 focus:outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="p-0.5 text-zinc-400 hover:text-zinc-200 rounded-full"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Recently Edited Section (media_1791875444451.png) */}
            {activeFilterId !== "archived" && !searchQuery.trim() && recentlyEditedScripts.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-zinc-200">Recently edited</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5">
                  {recentlyEditedScripts.map((script) => (
                    <div
                      key={`recent-${script.id}`}
                      onClick={() => handleOpenScript(script.id)}
                      className="group p-4 bg-[#1c1c20] hover:bg-[#222227] border border-[#28282e] hover:border-[#383842] rounded-xl transition-all cursor-pointer flex flex-col justify-between h-36 relative shadow-xs"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <FileText className="w-4 h-4 text-[#818cf8]" />
                          {script.shelfId && shelfMap.has(script.shelfId) && (
                            <span className="text-[10px] text-zinc-400 bg-[#252529] px-2 py-0.5 rounded-full border border-[#2e2e34] truncate max-w-[100px]">
                              {shelfMap.get(script.shelfId)}
                            </span>
                          )}
                        </div>
                        <h3 className="text-sm font-medium text-zinc-100 group-hover:text-white line-clamp-2">
                          {script.title}
                        </h3>
                      </div>
                      <div className="text-xs text-zinc-500 pt-2 border-t border-[#26262c] flex items-center justify-between">
                        <span>{formatTimestamp(script.lastModified)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Shelves Stacked One Under The Other with Drag & Drop */}
            <div className="space-y-6 pt-1">
              {activeFilterId !== "archived" && (
                <>
                  {displayShelves.map((shelf) => {
                    const shelfScripts = searchFilteredScripts.filter(
                      (s) => s.category !== "archived" && s.shelfId === shelf.id
                    );
                    const isShelfOver = dragOverShelfId === shelf.id;

                    return (
                      <section
                        key={shelf.id}
                        onDragOver={(e) => handleShelfDragOver(e, shelf.id)}
                        onDragLeave={(e) => {
                          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                            setDragOverShelfId(null);
                          }
                        }}
                        onDrop={(e) => handleDropOnShelfContainer(e, shelf.id)}
                        className={`bg-[#1c1c20] border rounded-xl p-4.5 space-y-3 transition-all ${
                          isShelfOver
                            ? "border-[#6366f1] ring-2 ring-[#6366f1]/40 bg-[#6366f1]/5"
                            : "border-[#28282e] hover:border-[#383842]"
                        }`}
                      >
                        {/* Shelf Header */}
                        <div className="flex items-center justify-between pb-2.5 border-b border-[#28282e]">
                          <div className="flex items-center gap-3">
                            <Bookmark className="w-4 h-4 text-[#818cf8]" />
                            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-100">
                              {shelf.name}
                            </h2>
                            {shelfScripts.length > 0 && (
                              <span className="text-xs font-mono text-zinc-400 px-2.5 py-0.5 rounded-full bg-[#18181b] border border-[#28282e]">
                                {shelfScripts.length}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2.5">
                            <button
                              onClick={() => openCreateForShelf(shelf.id)}
                              className="text-xs text-[#818cf8] hover:text-white px-2.5 py-1 rounded-lg hover:bg-[#252529] transition-colors flex items-center gap-1.5 font-medium"
                              title="Add script to this shelf"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Add Script</span>
                            </button>

                            <div className="relative">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShelfMenuOpenId(shelfMenuOpenId === shelf.id ? null : shelf.id);
                                }}
                                className="p-1 text-zinc-500 hover:text-zinc-200 rounded-lg transition-colors"
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </button>

                              {shelfMenuOpenId === shelf.id && (
                                <div
                                  onClick={(e) => e.stopPropagation()}
                                  className="absolute right-0 top-full mt-1 w-36 bg-[#1c1c20] border border-[#2e2e34] rounded-xl shadow-2xl py-1 z-50 text-xs"
                                >
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setRenamingShelf(shelf);
                                      setRenameShelfValue(shelf.name);
                                      setShelfMenuOpenId(null);
                                    }}
                                    className="w-full flex items-center gap-2 text-left px-3.5 py-2 hover:bg-[#252529] text-zinc-200"
                                  >
                                    <Edit2 className="w-3.5 h-3.5 text-zinc-400" />
                                    <span>Rename</span>
                                  </button>
                                  <button
                                    onClick={(e) => handleDeleteShelf(shelf.id, e)}
                                    className="w-full flex items-center gap-2 text-left px-3.5 py-2 hover:bg-[#252529] text-rose-400"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                                    <span>Delete</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Shelf Content */}
                        {shelfScripts.length === 0 ? (
                          <div
                            onDragOver={(e) => handleShelfDragOver(e, shelf.id)}
                            onDrop={(e) => handleDropOnShelfContainer(e, shelf.id)}
                            className={`h-11 rounded-lg border border-dashed flex items-center justify-center transition-colors ${
                              isShelfOver
                                ? "border-[#6366f1] bg-[#6366f1]/10 text-[#818cf8]"
                                : "border-[#28282e] text-zinc-600"
                            }`}
                          >
                            <span className="text-xs">
                              {isShelfOver ? "Drop to add to shelf" : "Drop screenplays here"}
                            </span>
                          </div>
                        ) : isGridView ? (
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                            {shelfScripts.map((script) => {
                              const isDragging = draggedScriptId === script.id;
                              const isHovered = dragOverScriptId === script.id;

                              return (
                                <div
                                  key={script.id}
                                  draggable
                                  onDragStart={(e) => handleDragStart(e, script.id)}
                                  onDragEnd={handleDragEnd}
                                  onDragOver={(e) => handleScriptDragOver(e, script.id)}
                                  onDrop={(e) => handleDropOnScript(e, script.id, shelf.id)}
                                  onClick={() => handleOpenScript(script.id)}
                                  className={`group p-4 bg-[#242429] hover:bg-[#2a2a30] border rounded-lg transition-all cursor-grab active:cursor-grabbing flex flex-col justify-between h-36 relative ${
                                    isDragging
                                      ? "opacity-30 border-dashed border-[#6366f1] scale-[0.98]"
                                      : isHovered
                                      ? "border-[#6366f1] ring-1 ring-[#6366f1]"
                                      : "border-[#2e2e34] hover:border-[#3a3a42]"
                                  }`}
                                >
                                  <div>
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="flex items-center gap-2">
                                        <GripVertical className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400 shrink-0" />
                                        <FileText className="w-4 h-4 text-zinc-400 group-hover:text-[#818cf8]" />
                                      </div>
                                      <div onClick={(e) => e.stopPropagation()}>
                                        <button
                                          onClick={() =>
                                            setMenuOpenId(menuOpenId === script.id ? null : script.id)
                                          }
                                          className="p-1 text-zinc-500 hover:text-zinc-200 rounded-lg"
                                        >
                                          <MoreHorizontal className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </div>
                                    <h3 className="text-sm font-medium text-zinc-200 group-hover:text-white line-clamp-2">
                                      {script.title}
                                    </h3>
                                  </div>

                                  <div className="text-xs text-zinc-500 pt-2 border-t border-[#2c2c34] flex items-center justify-between">
                                    <span>{formatTimestamp(script.lastModified)}</span>
                                  </div>

                                  {/* Menu */}
                                  {menuOpenId === script.id && (
                                    <div
                                      onClick={(e) => e.stopPropagation()}
                                      className="absolute right-3 top-9 w-44 bg-[#1c1c20] border border-[#2e2e34] rounded-xl shadow-2xl py-1 z-50 text-xs text-left"
                                    >
                                      <Link
                                        href={`/editor?id=${encodeURIComponent(script.id)}`}
                                        className="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-[#252529] text-zinc-200"
                                      >
                                        <ArrowUpRight className="w-3.5 h-3.5 text-zinc-400" />
                                        <span>Open</span>
                                      </Link>
                                      <button
                                        onClick={() => {
                                          setMovingScript(script);
                                          setMenuOpenId(null);
                                        }}
                                        className="w-full flex items-center gap-2.5 text-left px-3.5 py-2 hover:bg-[#252529] text-zinc-200"
                                      >
                                        <MoveRight className="w-3.5 h-3.5 text-zinc-400" />
                                        <span>Move to Shelf...</span>
                                      </button>
                                      <button
                                        onClick={() => {
                                          setRenamingScript(script);
                                          setRenameValue(script.title);
                                          setMenuOpenId(null);
                                        }}
                                        className="w-full flex items-center gap-2.5 text-left px-3.5 py-2 hover:bg-[#252529] text-zinc-200"
                                      >
                                        <Edit2 className="w-3.5 h-3.5 text-zinc-400" />
                                        <span>Rename</span>
                                      </button>
                                      <button
                                        onClick={() => handleDuplicateScript(script.id)}
                                        className="w-full flex items-center gap-2.5 text-left px-3.5 py-2 hover:bg-[#252529] text-zinc-200"
                                      >
                                        <Copy className="w-3.5 h-3.5 text-zinc-400" />
                                        <span>Duplicate</span>
                                      </button>
                                      <button
                                        onClick={() => handleToggleArchiveScript(script.id)}
                                        className="w-full flex items-center gap-2.5 text-left px-3.5 py-2 hover:bg-[#252529] text-zinc-200"
                                      >
                                        <Archive className="w-3.5 h-3.5 text-zinc-400" />
                                        <span>Archive</span>
                                      </button>
                                      <div className="border-t border-[#28282e] my-1" />
                                      <button
                                        onClick={() => handleExportScriptFdx(script)}
                                        className="w-full flex items-center gap-2.5 text-left px-3.5 py-2 hover:bg-[#252529] text-zinc-200"
                                      >
                                        <Download className="w-3.5 h-3.5 text-zinc-400" />
                                        <span>Export (.fdx)</span>
                                      </button>
                                      <button
                                        onClick={() => handleExportScriptFountain(script)}
                                        className="w-full flex items-center gap-2.5 text-left px-3.5 py-2 hover:bg-[#252529] text-zinc-200"
                                      >
                                        <Download className="w-3.5 h-3.5 text-zinc-400" />
                                        <span>Export (.fountain)</span>
                                      </button>
                                      <div className="border-t border-[#28282e] my-1" />
                                      <button
                                        onClick={() => handleDeleteScript(script.id)}
                                        className="w-full flex items-center gap-2.5 text-left px-3.5 py-2 hover:bg-[#252529] text-rose-400"
                                      >
                                        <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                                        <span>Delete</span>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          /* Sleek Single-Line Rows */
                          <div className="space-y-1">
                            {shelfScripts.map((script) => {
                              const isDragging = draggedScriptId === script.id;
                              const isHovered = dragOverScriptId === script.id;
                              const isTargetBefore = isHovered && dragPosition === "before";
                              const isTargetAfter = isHovered && dragPosition === "after";

                              return (
                                <div
                                  key={script.id}
                                  draggable
                                  onDragStart={(e) => handleDragStart(e, script.id)}
                                  onDragEnd={handleDragEnd}
                                  onDragOver={(e) => handleScriptDragOver(e, script.id)}
                                  onDrop={(e) => handleDropOnScript(e, script.id, shelf.id)}
                                  onClick={() => handleOpenScript(script.id)}
                                  className={`group flex items-center justify-between px-3.5 py-2 rounded-lg cursor-grab active:cursor-grabbing transition-all relative ${
                                    isDragging
                                      ? "opacity-30 border border-dashed border-[#6366f1] bg-[#6366f1]/10 scale-[0.99]"
                                      : "hover:bg-[#242429]"
                                  } ${
                                    isTargetBefore
                                      ? "before:absolute before:top-0 before:left-2 before:right-2 before:h-0.5 before:bg-[#6366f1] before:rounded-full before:shadow-[0_0_8px_#6366f1]"
                                      : ""
                                  } ${
                                    isTargetAfter
                                      ? "after:absolute after:bottom-0 after:left-2 after:right-2 after:h-0.5 after:bg-[#6366f1] after:rounded-full after:shadow-[0_0_8px_#6366f1]"
                                      : ""
                                  }`}
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <GripVertical className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400 shrink-0 transition-colors" />
                                    <FileText className="w-4 h-4 text-zinc-400 group-hover:text-zinc-200 shrink-0" />
                                    <span className="text-sm font-medium text-zinc-200 group-hover:text-white truncate">
                                      {script.title}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-4 shrink-0">
                                    <span className="text-xs font-mono text-zinc-500 flex items-center gap-1.5">
                                      <Clock className="w-3.5 h-3.5 text-zinc-600" />
                                      <span>{formatTimestamp(script.lastModified)}</span>
                                    </span>

                                    <div onClick={(e) => e.stopPropagation()} className="relative">
                                      <button
                                        onClick={() =>
                                          setMenuOpenId(menuOpenId === script.id ? null : script.id)
                                        }
                                        className="p-1 text-zinc-500 hover:text-zinc-200 rounded-lg transition-colors"
                                      >
                                        <MoreHorizontal className="w-4 h-4" />
                                      </button>

                                      {menuOpenId === script.id && (
                                        <div
                                          onClick={(e) => e.stopPropagation()}
                                          className="absolute right-0 top-full mt-1 w-44 bg-[#1c1c20] border border-[#2e2e34] rounded-xl shadow-2xl py-1 z-50 text-xs"
                                        >
                                          <Link
                                            href={`/editor?id=${encodeURIComponent(script.id)}`}
                                            className="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-[#252529] text-zinc-200"
                                          >
                                            <ArrowUpRight className="w-3.5 h-3.5 text-zinc-400" />
                                            <span>Open</span>
                                          </Link>
                                          <button
                                            onClick={() => {
                                              setMovingScript(script);
                                              setMenuOpenId(null);
                                            }}
                                            className="w-full flex items-center gap-2.5 text-left px-3.5 py-2 hover:bg-[#252529] text-zinc-200"
                                          >
                                            <MoveRight className="w-3.5 h-3.5 text-zinc-400" />
                                            <span>Move to Shelf...</span>
                                          </button>
                                          <button
                                            onClick={() => {
                                              setRenamingScript(script);
                                              setRenameValue(script.title);
                                              setMenuOpenId(null);
                                            }}
                                            className="w-full flex items-center gap-2.5 text-left px-3.5 py-2 hover:bg-[#252529] text-zinc-200"
                                          >
                                            <Edit2 className="w-3.5 h-3.5 text-zinc-400" />
                                            <span>Rename</span>
                                          </button>
                                          <button
                                            onClick={() => handleDuplicateScript(script.id)}
                                            className="w-full flex items-center gap-2.5 text-left px-3.5 py-2 hover:bg-[#252529] text-zinc-200"
                                          >
                                            <Copy className="w-3.5 h-3.5 text-zinc-400" />
                                            <span>Duplicate</span>
                                          </button>
                                          <button
                                            onClick={() => handleToggleArchiveScript(script.id)}
                                            className="w-full flex items-center gap-2.5 text-left px-3.5 py-2 hover:bg-[#252529] text-zinc-200"
                                          >
                                            <Archive className="w-3.5 h-3.5 text-zinc-400" />
                                            <span>Archive</span>
                                          </button>
                                          <div className="border-t border-[#28282e] my-1" />
                                          <button
                                            onClick={() => handleExportScriptFdx(script)}
                                            className="w-full flex items-center gap-2.5 text-left px-3.5 py-2 hover:bg-[#252529] text-zinc-200"
                                          >
                                            <Download className="w-3.5 h-3.5 text-zinc-400" />
                                            <span>Export (.fdx)</span>
                                          </button>
                                          <button
                                            onClick={() => handleExportScriptFountain(script)}
                                            className="w-full flex items-center gap-2.5 text-left px-3.5 py-2 hover:bg-[#252529] text-zinc-200"
                                          >
                                            <Download className="w-3.5 h-3.5 text-zinc-400" />
                                            <span>Export (.fountain)</span>
                                          </button>
                                          <div className="border-t border-[#28282e] my-1" />
                                          <button
                                            onClick={() => handleDeleteScript(script.id)}
                                            className="w-full flex items-center gap-2.5 text-left px-3.5 py-2 hover:bg-[#252529] text-rose-400"
                                          >
                                            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                                            <span>Delete</span>
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </section>
                    );
                  })}

                  {/* Unfiled Shelf */}
                  {(activeFilterId === "all" || activeFilterId === "unfiled") && unfiledScripts.length > 0 && (
                    <section
                      onDragOver={(e) => handleShelfDragOver(e, null)}
                      onDragLeave={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                          setDragOverShelfId(null);
                        }
                      }}
                      onDrop={(e) => handleDropOnShelfContainer(e, null)}
                      className={`bg-[#1c1c20] border rounded-xl p-4.5 space-y-3 shadow-xs transition-all ${
                        dragOverShelfId === "unfiled"
                          ? "border-[#6366f1] ring-2 ring-[#6366f1]/40 bg-[#6366f1]/5"
                          : "border-[#28282e] hover:border-[#383842]"
                      }`}
                    >
                      <div className="flex items-center justify-between pb-2.5 border-b border-[#28282e]">
                        <div className="flex items-center gap-3">
                          <FileText className="w-4 h-4 text-zinc-400" />
                          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-200">
                            Unfiled
                          </h2>
                          <span className="text-xs font-mono text-zinc-400 px-2.5 py-0.5 rounded-full bg-[#18181b] border border-[#28282e]">
                            {unfiledScripts.length}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1">
                        {unfiledScripts.map((script) => {
                          const isDragging = draggedScriptId === script.id;
                          const isHovered = dragOverScriptId === script.id;
                          const isTargetBefore = isHovered && dragPosition === "before";
                          const isTargetAfter = isHovered && dragPosition === "after";

                          return (
                            <div
                              key={script.id}
                              draggable
                              onDragStart={(e) => handleDragStart(e, script.id)}
                              onDragEnd={handleDragEnd}
                              onDragOver={(e) => handleScriptDragOver(e, script.id)}
                              onDrop={(e) => handleDropOnScript(e, script.id, null)}
                              onClick={() => handleOpenScript(script.id)}
                              className={`group flex items-center justify-between px-3.5 py-2 rounded-lg cursor-grab active:cursor-grabbing transition-all relative ${
                                isDragging
                                  ? "opacity-30 border border-dashed border-[#6366f1] bg-[#6366f1]/10 scale-[0.99]"
                                  : "hover:bg-[#242429]"
                              } ${
                                isTargetBefore
                                  ? "before:absolute before:top-0 before:left-2 before:right-2 before:h-0.5 before:bg-[#6366f1] before:rounded-full before:shadow-[0_0_8px_#6366f1]"
                                  : ""
                              } ${
                                isTargetAfter
                                  ? "after:absolute after:bottom-0 after:left-2 after:right-2 after:h-0.5 after:bg-[#6366f1] after:rounded-full after:shadow-[0_0_8px_#6366f1]"
                                  : ""
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <GripVertical className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400 shrink-0 transition-colors" />
                                <FileText className="w-4 h-4 text-zinc-400 group-hover:text-zinc-200 shrink-0" />
                                <span className="text-sm font-medium text-zinc-200 group-hover:text-white truncate">
                                  {script.title}
                                </span>
                              </div>

                              <div className="flex items-center gap-4 shrink-0">
                                <span className="text-xs font-mono text-zinc-500">
                                  {formatTimestamp(script.lastModified)}
                                </span>

                                <div onClick={(e) => e.stopPropagation()} className="relative">
                                  <button
                                    onClick={() =>
                                      setMenuOpenId(menuOpenId === script.id ? null : script.id)
                                    }
                                    className="p-1 text-zinc-500 hover:text-zinc-200 rounded-lg transition-colors"
                                  >
                                    <MoreHorizontal className="w-4 h-4" />
                                  </button>

                                  {menuOpenId === script.id && (
                                    <div
                                      onClick={(e) => e.stopPropagation()}
                                      className="absolute right-0 top-full mt-1 w-44 bg-[#1c1c20] border border-[#2e2e34] rounded-xl shadow-2xl py-1 z-50 text-xs"
                                    >
                                      <Link
                                        href={`/editor?id=${encodeURIComponent(script.id)}`}
                                        className="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-[#252529] text-zinc-200"
                                      >
                                        <ArrowUpRight className="w-3.5 h-3.5 text-zinc-400" />
                                        <span>Open</span>
                                      </Link>
                                      <button
                                        onClick={() => {
                                          setMovingScript(script);
                                          setMenuOpenId(null);
                                        }}
                                        className="w-full flex items-center gap-2.5 text-left px-3.5 py-2 hover:bg-[#252529] text-zinc-200"
                                      >
                                        <MoveRight className="w-3.5 h-3.5 text-zinc-400" />
                                        <span>Move to Shelf...</span>
                                      </button>
                                      <button
                                        onClick={() => {
                                          setRenamingScript(script);
                                          setRenameValue(script.title);
                                          setMenuOpenId(null);
                                        }}
                                        className="w-full flex items-center gap-2.5 text-left px-3.5 py-2 hover:bg-[#252529] text-zinc-200"
                                      >
                                        <Edit2 className="w-3.5 h-3.5 text-zinc-400" />
                                        <span>Rename</span>
                                      </button>
                                      <button
                                        onClick={() => handleDuplicateScript(script.id)}
                                        className="w-full flex items-center gap-2.5 text-left px-3.5 py-2 hover:bg-[#252529] text-zinc-200"
                                      >
                                        <Copy className="w-3.5 h-3.5 text-zinc-400" />
                                        <span>Duplicate</span>
                                      </button>
                                      <button
                                        onClick={() => handleToggleArchiveScript(script.id)}
                                        className="w-full flex items-center gap-2.5 text-left px-3.5 py-2 hover:bg-[#252529] text-zinc-200"
                                      >
                                        <Archive className="w-3.5 h-3.5 text-zinc-400" />
                                        <span>Archive</span>
                                      </button>
                                      <div className="border-t border-[#28282e] my-1" />
                                      <button
                                        onClick={() => handleExportScriptFdx(script)}
                                        className="w-full flex items-center gap-2.5 text-left px-3.5 py-2 hover:bg-[#252529] text-zinc-200"
                                      >
                                        <Download className="w-3.5 h-3.5 text-zinc-400" />
                                        <span>Export (.fdx)</span>
                                      </button>
                                      <button
                                        onClick={() => handleExportScriptFountain(script)}
                                        className="w-full flex items-center gap-2.5 text-left px-3.5 py-2 hover:bg-[#252529] text-zinc-200"
                                      >
                                        <Download className="w-3.5 h-3.5 text-zinc-400" />
                                        <span>Export (.fountain)</span>
                                      </button>
                                      <div className="border-t border-[#28282e] my-1" />
                                      <button
                                        onClick={() => handleDeleteScript(script.id)}
                                        className="w-full flex items-center gap-2.5 text-left px-3.5 py-2 hover:bg-[#252529] text-rose-400"
                                      >
                                        <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                                        <span>Delete</span>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  {/* Add New Shelf Button at the bottom */}
                  {activeFilterId === "all" && (
                    <button
                      onClick={() => setIsCreateShelfOpen(true)}
                      className="w-full py-3.5 border border-dashed border-[#28282e] hover:border-[#6366f1]/60 hover:bg-[#1c1c20] rounded-xl text-xs text-zinc-400 hover:text-white transition-all flex items-center justify-center gap-2"
                    >
                      <Plus className="w-4 h-4 text-[#818cf8]" />
                      <span>Create New Shelf</span>
                    </button>
                  )}
                </>
              )}

              {/* Archived Section */}
              {activeFilterId === "archived" && (
                <section className="bg-[#1c1c20] border border-[#28282e] rounded-xl p-4.5 space-y-3">
                  <div className="flex items-center gap-3 pb-2.5 border-b border-[#28282e]">
                    <Archive className="w-4 h-4 text-zinc-400" />
                    <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-200">
                      Archived
                    </h2>
                    <span className="text-xs font-mono text-zinc-400 px-2.5 py-0.5 rounded-full bg-[#18181b]">
                      {archivedScripts.length}
                    </span>
                  </div>

                  {archivedScripts.length === 0 ? (
                    <div className="py-8 text-center text-xs text-zinc-500">
                      No archived screenplays found.
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {archivedScripts.map((script) => (
                        <div
                          key={script.id}
                          className="flex items-center justify-between px-3.5 py-2 rounded-lg hover:bg-[#242429] transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <FileText className="w-4 h-4 text-zinc-500" />
                            <span className="text-sm text-zinc-300">{script.title}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => handleToggleArchiveScript(script.id)}
                              className="text-xs text-[#818cf8] hover:text-[#a5b4fc]"
                            >
                              Restore
                            </button>
                            <button
                              onClick={() => handleDeleteScript(script.id)}
                              className="text-xs text-rose-400 hover:text-rose-300"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Modal: Create Screenplay */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs">
          <div className="w-[420px] bg-[#1c1c20] border border-[#2e2e34] rounded-2xl shadow-2xl p-6 space-y-5 animate-in fade-in">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-200">
                New Screenplay
              </h3>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="text-zinc-500 hover:text-zinc-300 rounded-lg p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateScript} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1.5">
                  Title
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Project Stairway - Episode 2"
                  autoFocus
                  className="w-full px-3.5 py-2.5 bg-[#18181b] border border-[#2e2e34] rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#6366f1]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1.5">
                  Shelf
                </label>
                <select
                  value={targetShelfIdForCreate}
                  onChange={(e) => setTargetShelfIdForCreate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#18181b] border border-[#2e2e34] rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-[#6366f1]"
                >
                  <option value="">Unfiled (No shelf)</option>
                  {shelves.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#28282e]">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-3.5 py-2 text-xs text-zinc-400 hover:text-zinc-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#6366f1] hover:bg-[#5254e0] text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create Shelf */}
      {isCreateShelfOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs">
          <div className="w-96 bg-[#1c1c20] border border-[#2e2e34] rounded-2xl shadow-2xl p-6 space-y-5 animate-in fade-in">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-200">
                Create Shelf
              </h3>
              <button
                onClick={() => setIsCreateShelfOpen(false)}
                className="text-zinc-500 hover:text-zinc-300 rounded-lg p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateShelf} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1.5">
                  Shelf Name
                </label>
                <input
                  type="text"
                  value={newShelfName}
                  onChange={(e) => setNewShelfName(e.target.value)}
                  placeholder="e.g. Season 1, Feature Drafts"
                  autoFocus
                  className="w-full px-3.5 py-2.5 bg-[#18181b] border border-[#2e2e34] rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#6366f1]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#28282e]">
                <button
                  type="button"
                  onClick={() => setIsCreateShelfOpen(false)}
                  className="px-3.5 py-2 text-xs text-zinc-400 hover:text-zinc-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#6366f1] hover:bg-[#5254e0] text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  Create Shelf
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Rename Shelf */}
      {renamingShelf && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs">
          <div className="w-96 bg-[#1c1c20] border border-[#2e2e34] rounded-2xl shadow-2xl p-6 space-y-5 animate-in fade-in">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-200">
                Rename Shelf
              </h3>
              <button
                onClick={() => setRenamingShelf(null)}
                className="text-zinc-500 hover:text-zinc-300 rounded-lg p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveRenameShelf} className="space-y-4">
              <div>
                <input
                  type="text"
                  value={renameShelfValue}
                  onChange={(e) => setRenameShelfValue(e.target.value)}
                  autoFocus
                  className="w-full px-3.5 py-2.5 bg-[#18181b] border border-[#2e2e34] rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-[#6366f1]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#28282e]">
                <button
                  type="button"
                  onClick={() => setRenamingShelf(null)}
                  className="px-3.5 py-2 text-xs text-zinc-400 hover:text-zinc-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#6366f1] hover:bg-[#5254e0] text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Move Script to Shelf */}
      {movingScript && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs">
          <div className="w-[420px] bg-[#1c1c20] border border-[#2e2e34] rounded-2xl shadow-2xl p-6 space-y-5 animate-in fade-in">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-200">
                  Move to Shelf
                </h3>
                <p className="text-xs text-zinc-400 truncate max-w-[300px] mt-0.5">
                  {movingScript.title}
                </p>
              </div>
              <button
                onClick={() => setMovingScript(null)}
                className="text-zinc-500 hover:text-zinc-300 rounded-lg p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              <button
                onClick={() => handleMoveToShelf(null)}
                className={`w-full flex items-center justify-between px-3.5 py-2 rounded-lg text-xs transition-colors ${
                  !movingScript.shelfId
                    ? "bg-[#6366f1]/20 text-[#818cf8] border border-[#6366f1]/40"
                    : "hover:bg-[#252529] text-zinc-300"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <FileText className="w-4 h-4 text-zinc-400" />
                  <span>Unfiled (Remove from shelf)</span>
                </div>
                {!movingScript.shelfId && <span className="text-[11px] font-bold">Active</span>}
              </button>

              {shelves.map((shelf) => (
                <button
                  key={shelf.id}
                  onClick={() => handleMoveToShelf(shelf.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2 rounded-lg text-xs transition-colors ${
                    movingScript.shelfId === shelf.id
                      ? "bg-[#6366f1]/20 text-[#818cf8] border border-[#6366f1]/40"
                      : "hover:bg-[#252529] text-zinc-300"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Bookmark className="w-4 h-4 text-[#818cf8]" />
                    <span>{shelf.name}</span>
                  </div>
                  {movingScript.shelfId === shelf.id && (
                    <span className="text-[11px] font-bold">Active</span>
                  )}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-end pt-3 border-t border-[#28282e]">
              <button
                onClick={() => setMovingScript(null)}
                className="px-3.5 py-2 text-xs text-zinc-400 hover:text-zinc-200 rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Rename Screenplay */}
      {renamingScript && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs">
          <div className="w-[420px] bg-[#1c1c20] border border-[#2e2e34] rounded-2xl shadow-2xl p-6 space-y-5 animate-in fade-in">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-200">
                Rename Screenplay
              </h3>
              <button
                onClick={() => setRenamingScript(null)}
                className="text-zinc-500 hover:text-zinc-300 rounded-lg p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveRenameScript} className="space-y-4">
              <div>
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  autoFocus
                  className="w-full px-3.5 py-2.5 bg-[#18181b] border border-[#2e2e34] rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-[#6366f1]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#28282e]">
                <button
                  type="button"
                  onClick={() => setRenamingScript(null)}
                  className="px-3.5 py-2 text-xs text-zinc-400 hover:text-zinc-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#6366f1] hover:bg-[#5254e0] text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Invite Registered User Modal */}
      <InviteUserModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
      />
    </div>
  );
}
