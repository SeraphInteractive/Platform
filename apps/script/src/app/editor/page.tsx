"use client";

import React, { useEffect, useMemo, useState, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";

import { SceneHeading, Action, Character, Dialogue, Parenthetical, Transition, ScriptImage, PageBreak } from "@/editor/nodes";
import { UnderlineMark, HighlightMark } from "@/editor/marks";
import { ScreenplayKeymap } from "@/editor/extensions/ScreenplayKeymap";
import { ScreenplayPagination } from "@/editor/extensions/ScreenplayPagination";
import { extractScriptContext, COMMON_PREFIXES, COMMON_TIMES, COMMON_TRANSITIONS } from "@/editor/extensions/suggestions";
import { exportToFdx, parseFdx } from "@/editor/format/fdx";
import { exportToFountain, parseFountain } from "@/editor/format/fountain";

import { ScreenplayToolbar, type ViewLayoutMode } from "@/components/ScreenplayToolbar";
import { SceneNavigator, type SceneItem } from "@/components/SceneNavigator";
import { BeatBoard } from "@/components/BeatBoard";
import { AutocompleteMenu } from "@/components/AutocompleteMenu";
import { CommandPalette } from "@/components/CommandPalette";
import { FindReplaceBar } from "@/components/FindReplaceBar";
import { ArcShortcutDock } from "@/components/ArcShortcutDock";
import { ArcFormattingMenu } from "@/components/ArcFormattingMenu";
import { ScriptStash, type StashItem } from "@/components/ScriptStash";
import { VersionHistoryDrawer, type VersionSnapshot } from "@/components/VersionHistoryDrawer";
import { TitlePage, type TitlePageData } from "@/components/TitlePage";
import { InsertImageDialog } from "@/components/InsertImageDialog";
import { AccessGuard } from "@/components/AccessGuard";
import { getScriptById, updateScript, getStoredPageTheme, setStoredPageTheme, type PageTheme } from "@/lib/ScriptStorage";

const DEFAULT_SCRIPT_CONTENT = {
    type: "doc",
    content: [
        {
            type: "sceneHeading",
            content: [{ type: "text", text: "INT. PRODUCTION VAULT - NIGHT" }]
        },
        {
            type: "action",
            content: [
                {
                    type: "text",
                    text: "A bank of workstation monitors illuminates the dark studio. Rows of Blender viewport renders churn through the queue."
                }
            ]
        },
        {
            type: "character",
            content: [{ type: "text", text: "LEAD ARTIST" }]
        },
        {
            type: "dialogue",
            content: [
                {
                    type: "text",
                    text: "The sequence cache completed ahead of schedule. We are ready for layout review."
                }
            ]
        },
        {
            type: "character",
            content: [{ type: "text", text: "DIRECTOR" }]
        },
        {
            type: "parenthetical",
            content: [{ type: "text", text: "(studying the telemetry)" }]
        },
        {
            type: "dialogue",
            content: [
                {
                    type: "text",
                    text: "Push the scene files into production and notify the department leads."
                }
            ]
        },
        {
            type: "transition",
            content: [{ type: "text", text: "CUT TO:" }]
        },
        {
            type: "sceneHeading",
            content: [{ type: "text", text: "EXT. CITY OUTPOST - DAWN" }]
        },
        {
            type: "action",
            content: [
                {
                    type: "text",
                    text: "Sunrise pierces through the industrial skyline. The day begins."
                }
            ]
        }
    ]
};

const DEFAULT_TITLE_PAGE: TitlePageData = {
    title: "PROJECT STAIRWAY",
    author: "Creative Division",
    basedOn: "Original Cinematic Story Arc",
    contact: "studio@projectstairway.net\nDiscord: /project-stairway",
    draftInfo: "Production Draft 1"
};

const STASH_STORAGE_KEY = "stairway_screenplay_stash_v1";
const VERSIONS_STORAGE_KEY = "stairway_screenplay_versions_v1";

function ScreenplayEditorContent() {
    const searchParams = useSearchParams();
    const scriptId = searchParams.get("id");

    const [mounted, setMounted] = useState(false);
    const [layoutMode, setLayoutMode] = useState<ViewLayoutMode>("script");
    const [isPageView, setIsPageView] = useState(true);
    const [pageTheme, setPageTheme] = useState<PageTheme>("dark");
    const [isFocusMode, setIsFocusMode] = useState(false);
    const [isNavOpen, setIsNavOpen] = useState(true);
    const [isStashOpen, setIsStashOpen] = useState(false);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [insertImageOpen, setInsertImageOpen] = useState(false);
    const [scriptTitle, setScriptTitle] = useState("Project Stairway - Episode 1");
    const [titlePageData, setTitlePageData] = useState<TitlePageData>(DEFAULT_TITLE_PAGE);

    const handleTogglePageTheme = useCallback(() => {
        setPageTheme((prev) => {
            const next = prev === "light" ? "dark" : "light";
            setStoredPageTheme(next);
            return next;
        });
    }, []);

    const [scenes, setScenes] = useState<SceneItem[]>([]);
    const [characters, setCharacters] = useState<string[]>([]);
    const [wordCount, setWordCount] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [scenePages, setScenePages] = useState<Record<number, number>>({});
    const [stashItems, setStashItems] = useState<StashItem[]>([]);
    const [versions, setVersions] = useState<VersionSnapshot[]>([]);
    const [activePreviewId, setActivePreviewId] = useState<string | null>(null);

    // Modal / drawer states
    const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
    const [findReplaceOpen, setFindReplaceOpen] = useState(false);
    const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
    const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);

    // Autocomplete state
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [suggestionTitle, setSuggestionTitle] = useState("");
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [suggestionIndex, setSuggestionIndex] = useState(0);
    const [suggestionCoords, setSuggestionCoords] = useState<{ top: number; left: number } | null>(null);

    const suggestionsStateRef = useRef<{
        isOpen: boolean;
        items: string[];
        index: number;
        title: string;
        coords: { top: number; left: number } | null;
        userInteracted?: boolean;
    }>({
        isOpen: false,
        items: [],
        index: 0,
        title: "",
        coords: null,
        userInteracted: false
    });

    const handleSelectSuggestionRef = useRef<(item: string) => void>(() => {});
    const analyzeScriptRef = useRef<(ed: any) => void>(() => {});
    const updateActiveSuggestionsRef = useRef<(ed: any) => void>(() => {});

    const lastSnapshotTime = useRef<number>(Date.now());

    const currentStorageKey = useMemo(() => {
        return scriptId ? `stairway_script_doc_${scriptId}` : "stairway_screenplay_draft_v1";
    }, [scriptId]);

    // Load script metadata when scriptId changes
    useEffect(() => {
        if (!scriptId) return;
        const doc = getScriptById(scriptId);
        if (doc) {
            setScriptTitle(doc.title);
            setTitlePageData((prev) => ({
                ...prev,
                title: doc.title,
                author: doc.author || prev.author
            }));
        }
    }, [scriptId]);

    // Editor instantiation
    const editor = useEditor({
        immediatelyRender: false,
        extensions: [
            StarterKit.configure({
                paragraph: false,
                heading: false,
                codeBlock: false,
                bulletList: false,
                orderedList: false,
                listItem: false,
                blockquote: false,
                horizontalRule: false
            }),
            UnderlineMark,
            HighlightMark,
            SceneHeading,
            Action,
            Character,
            Dialogue,
            Parenthetical,
            Transition,
            ScriptImage,
            PageBreak,
            ScreenplayPagination,
            ScreenplayKeymap,
            Placeholder.configure({
                placeholder: ({ node }) => {
                    if (node.type.name === "sceneHeading") return "INT. LOCATION - TIME";
                    if (node.type.name === "character") return "CHARACTER NAME";
                    if (node.type.name === "parenthetical") return "(direction)";
                    if (node.type.name === "dialogue") return "Dialogue...";
                    if (node.type.name === "transition") return "CUT TO:";
                    return "Action description...";
                }
            }),
            CharacterCount
        ],
        content: DEFAULT_SCRIPT_CONTENT,
        editorProps: {
            attributes: {
                class: "screenplay-container focus:outline-none"
            },
            handleKeyDown: (_view, event) => {
                if (suggestionsStateRef.current.isOpen && suggestionsStateRef.current.items.length > 0) {
                    if (event.key === "ArrowDown") {
                        event.preventDefault();
                        const nextIdx = (suggestionsStateRef.current.index + 1) % suggestionsStateRef.current.items.length;
                        suggestionsStateRef.current.index = nextIdx;
                        suggestionsStateRef.current.userInteracted = true;
                        setSuggestionIndex(nextIdx);
                        return true;
                    }
                    if (event.key === "ArrowUp") {
                        event.preventDefault();
                        const prevIdx =
                            (suggestionsStateRef.current.index - 1 + suggestionsStateRef.current.items.length) %
                            suggestionsStateRef.current.items.length;
                        suggestionsStateRef.current.index = prevIdx;
                        suggestionsStateRef.current.userInteracted = true;
                        setSuggestionIndex(prevIdx);
                        return true;
                    }
                    if (event.key === "Tab") {
                        event.preventDefault();
                        const selectedItem = suggestionsStateRef.current.items[suggestionsStateRef.current.index];
                        if (selectedItem) {
                            handleSelectSuggestionRef.current(selectedItem);
                        }
                        return true;
                    }
                    if (event.key === "Enter") {
                        if (suggestionsStateRef.current.userInteracted) {
                            event.preventDefault();
                            const selectedItem = suggestionsStateRef.current.items[suggestionsStateRef.current.index];
                            if (selectedItem) {
                                handleSelectSuggestionRef.current(selectedItem);
                            }
                            return true;
                        }
                        // avoid hijacking standard enter if writer did not navigate suggestions
                        suggestionsStateRef.current.isOpen = false;
                        setShowSuggestions(false);
                        return false;
                    }
                    if (event.key === "Escape") {
                        event.preventDefault();
                        suggestionsStateRef.current.isOpen = false;
                        setShowSuggestions(false);
                        return true;
                    }
                }
                return false;
            }
        },
        onUpdate: ({ editor: ed }) => {
            try {
                const json = ed.getJSON();
                localStorage.setItem(currentStorageKey, JSON.stringify(json));

                // Sync metadata back to ScriptStorage
                if (scriptId) {
                    const words = ed.storage.characterCount?.words?.() || 0;
                    updateScript(scriptId, {
                        wordCount: words,
                        sceneCount: scenes.length
                    });
                }

                // Auto-checkpoint version history every 5 minutes
                const now = Date.now();
                if (now - lastSnapshotTime.current > 5 * 60 * 1000) {
                    lastSnapshotTime.current = now;
                    const words = ed.storage.characterCount?.words?.() || 0;
                    const autoSnapshot: VersionSnapshot = {
                        id: `snap-${now}`,
                        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                        isoDate: new Date().toISOString(),
                        author: "Admin",
                        wordCount: words,
                        sceneCount: scenes.length,
                        content: json
                    };
                    setVersions((prev) => {
                        const updated = [autoSnapshot, ...prev].slice(0, 30);
                        try {
                            localStorage.setItem(VERSIONS_STORAGE_KEY, JSON.stringify(updated));
                        } catch {}
                        return updated;
                    });
                }
            } catch {}
            analyzeScriptRef.current(ed);
            updateActiveSuggestionsRef.current(ed);
        },
        onSelectionUpdate: ({ editor: ed }) => {
            updateActiveSuggestionsRef.current(ed);
            const pStorage = (ed.storage as any).screenplayPagination;
            if (pStorage) {
                setCurrentPage(pStorage.currentPage || 1);
            }
        }
    });

    const analyzeScript = useCallback((ed: typeof editor) => {
        if (!ed) return;

        const pStorage = (ed.storage as any).screenplayPagination;
        const computedScenePages = pStorage?.scenePages || {};
        if (pStorage) {
            setTotalPages(pStorage.totalPages || 1);
            setCurrentPage(pStorage.currentPage || 1);
            setScenePages(computedScenePages);
        }

        const detectedScenes: SceneItem[] = [];
        let sceneCounter = 1;

        ed.state.doc.descendants((node, pos) => {
            if (node.type.name === "sceneHeading") {
                const slug = node.textContent.trim();
                // filter out bare prefixes that are not yet established scenes
                const normalized = slug.toUpperCase().replace(/\.$/, "");
                const isBarePrefix = COMMON_PREFIXES.map((p) => p.toUpperCase().replace(/\.$/, "")).includes(normalized);
                if (slug && !isBarePrefix) {
                    detectedScenes.push({
                        id: `scene-${pos}`,
                        number: sceneCounter++,
                        slugline: slug,
                        pos,
                        page: computedScenePages[pos] || 1
                    });
                }
            }
        });

        setScenes(detectedScenes);
        const ctx = extractScriptContext(ed);
        setCharacters(ctx.characters);
        setWordCount(ed.storage.characterCount?.words?.() || 0);
    }, []);

    const getCursorCoords = (ed: NonNullable<typeof editor>) => {
        try {
            const { selection } = ed.state;
            const coords = ed.view.coordsAtPos(selection.from);
            return {
                top: coords.bottom + 6,
                left: Math.max(20, coords.left)
            };
        } catch {
            return null;
        }
    };

    const updateActiveSuggestions = useCallback((ed: typeof editor) => {
        if (!ed) return;
        const { selection } = ed.state;
        const currentParent = selection.$from.parent;
        const currentType = currentParent.type.name;
        const rawText = currentParent.textContent.toUpperCase();
        const text = rawText.trim();

        let newItems: string[] = [];
        let newTitle = "";

        if (currentType === "sceneHeading") {
            newTitle = "Scene Heading";
            if (!text || text.length <= 4) {
                newItems = COMMON_PREFIXES.filter((p) => !text || p.startsWith(text));
                if (newItems.length === 0) newItems = COMMON_PREFIXES;
            } else if (rawText.includes("-")) {
                newTitle = "Time of Day";
                const parts = rawText.split(/-+/);
                const afterDash = (parts[parts.length - 1] ?? "").trim();
                newItems = COMMON_TIMES.filter((t) => (!afterDash || t.startsWith(afterDash)) && t !== afterDash);
                if (newItems.length === 0 && !afterDash) newItems = COMMON_TIMES;
            } else {
                const ctx = extractScriptContext(ed);
                newItems = ctx.sluglines.filter((s) => s.includes(text) && s !== text).slice(0, 5);
            }
        } else if (currentType === "character") {
            newTitle = "Character";
            const ctx = extractScriptContext(ed);
            if (!text) {
                newItems = ctx.characters.slice(0, 6);
            } else {
                newItems = ctx.characters.filter((c) => c.startsWith(text) && c !== text);
                if (newItems.length === 0) {
                    const exactMatch = ctx.characters.find((c) => c === text);
                    if (exactMatch || text.length >= 2) {
                        newItems = ["(V.O.)", "(O.S.)", "(CONT'D)"];
                        newTitle = "Extension";
                    }
                }
            }
        } else if (currentType === "transition") {
            newTitle = "Transition";
            newItems = COMMON_TRANSITIONS.filter((t) => (!text || t.startsWith(text)) && t !== text);
        } else if (currentType === "parenthetical") {
            newTitle = "Direction";
            const commonDirs = [
                "(beat)",
                "(pause)",
                "(whispering)",
                "(laughing)",
                "(to himself)",
                "(shouting)",
                "(quietly)",
                "(sarcastic)"
            ];
            newItems = commonDirs.filter(
                (d) => (!text || d.toLowerCase().includes(text.toLowerCase())) && d.toLowerCase() !== text.toLowerCase()
            );
        }

        if (newItems.length > 0) {
            const coords = getCursorCoords(ed);
            if (coords) {
                suggestionsStateRef.current = {
                    isOpen: true,
                    items: newItems,
                    index: 0,
                    title: newTitle,
                    coords,
                    userInteracted: false
                };
                setSuggestions(newItems);
                setSuggestionTitle(newTitle);
                setSuggestionIndex(0);
                setSuggestionCoords(coords);
                setShowSuggestions(true);
                return;
            }
        }

        suggestionsStateRef.current.isOpen = false;
        setShowSuggestions(false);
    }, []);

    const handleSelectSuggestion = useCallback(
        (item: string) => {
            if (!editor) return;
            const { state } = editor;
            const { selection } = state;
            const parentNode = selection.$from.parent;
            const currentType = parentNode.type.name;
            const start = selection.$from.start();
            const end = selection.$from.end();
            const currentText = parentNode.textContent;

            const replaceTextAndAdvance = (newText: string, advanceToType?: string) => {
                const tr = editor.state.tr;
                tr.replaceWith(start, end, editor.state.schema.text(newText));
                editor.view.dispatch(tr);
                if (advanceToType) {
                    editor.commands.splitBlock();
                    editor.commands.setNode(advanceToType);
                }
                setShowSuggestions(false);
                suggestionsStateRef.current.isOpen = false;
            };

            if (currentType === "sceneHeading") {
                if (COMMON_PREFIXES.includes(item)) {
                    replaceTextAndAdvance(`${item} `);
                } else if (COMMON_TIMES.includes(item)) {
                    const parts = currentText.split(/-+/);
                    const loc = (parts[0] ?? "").trim();
                    replaceTextAndAdvance(`${loc} - ${item}`, "action");
                } else {
                    replaceTextAndAdvance(item, "action");
                }
            } else if (currentType === "character") {
                if (item.startsWith("(")) {
                    replaceTextAndAdvance(`${currentText.trim()} ${item}`, "dialogue");
                } else {
                    replaceTextAndAdvance(item, "dialogue");
                }
            } else if (currentType === "transition") {
                replaceTextAndAdvance(item, "sceneHeading");
            } else if (currentType === "parenthetical") {
                replaceTextAndAdvance(item, "dialogue");
            } else {
                replaceTextAndAdvance(item);
            }
        },
        [editor]
    );

    useEffect(() => {
        analyzeScriptRef.current = analyzeScript;
    }, [analyzeScript]);

    useEffect(() => {
        updateActiveSuggestionsRef.current = updateActiveSuggestions;
    }, [updateActiveSuggestions]);

    useEffect(() => {
        handleSelectSuggestionRef.current = handleSelectSuggestion;
    }, [handleSelectSuggestion]);

    useEffect(() => {
        if (typeof window !== "undefined") {
            (window as any).__screenplayEditor = editor;
        }
    }, [editor]);

    // Stash cut handler
    const handleStashCut = useCallback(() => {
        if (!editor) return;
        const { state } = editor;
        const { from, to, empty } = state.selection;

        let textToStash = "";
        let itemType: StashItem["type"] = "action";
        let characterName: string | undefined;

        if (!empty) {
            textToStash = state.doc.textBetween(from, to, " ");
            const parentNode = state.selection.$from.parent;
            itemType = parentNode.type.name as StashItem["type"];
            if (itemType === "character" || itemType === "dialogue") {
                characterName = parentNode.type.name === "character" ? textToStash : undefined;
            }
            editor.chain().focus().deleteRange({ from, to }).run();
        } else {
            const parent = state.selection.$from.parent;
            textToStash = parent.textContent.trim();
            if (!textToStash) return;
            itemType = parent.type.name as StashItem["type"];
            const start = state.selection.$from.start();
            const end = state.selection.$from.end();
            editor.chain().focus().deleteRange({ from: start, to: end }).run();
        }

        if (!textToStash.trim()) return;

        const newItem: StashItem = {
            id: `stash-${Date.now()}`,
            title: textToStash.slice(0, 32) + (textToStash.length > 32 ? "..." : ""),
            text: textToStash,
            type: itemType || "action",
            characterName,
            createdAt: "Just now"
        };

        setStashItems((prev) => {
            const updated = [newItem, ...prev];
            try {
                localStorage.setItem(STASH_STORAGE_KEY, JSON.stringify(updated));
            } catch {}
            return updated;
        });

        setIsStashOpen(true);
    }, [editor]);

    // Restore item from Stash into editor at cursor
    const handleRestoreStashItem = useCallback(
        (item: StashItem) => {
            if (!editor) return;
            editor
                .chain()
                .focus()
                .insertContent({
                    type: item.type === "note" ? "action" : item.type,
                    content: [{ type: "text", text: item.text }]
                })
                .run();
        },
        [editor]
    );

    const handleDeleteStashItem = useCallback((id: string) => {
        setStashItems((prev) => {
            const updated = prev.filter((i) => i.id !== id);
            try {
                localStorage.setItem(STASH_STORAGE_KEY, JSON.stringify(updated));
            } catch {}
            return updated;
        });
    }, []);

    const handleAddManualStashNote = useCallback((title: string, text: string) => {
        const newItem: StashItem = {
            id: `stash-${Date.now()}`,
            title,
            text,
            type: "note",
            createdAt: "Just now"
        };
        setStashItems((prev) => {
            const updated = [newItem, ...prev];
            try {
                localStorage.setItem(STASH_STORAGE_KEY, JSON.stringify(updated));
            } catch {}
            return updated;
        });
    }, []);

    // Version History: Create named milestone snapshot
    const handleCreateNamedVersion = useCallback(
        (name: string) => {
            if (!editor) return;
            const snapshot: VersionSnapshot = {
                id: `milestone-${Date.now()}`,
                name,
                timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                isoDate: new Date().toISOString(),
                author: "Admin",
                wordCount: wordCount,
                sceneCount: scenes.length,
                content: editor.getJSON()
            };

            setVersions((prev) => {
                const updated = [snapshot, ...prev];
                try {
                    localStorage.setItem(VERSIONS_STORAGE_KEY, JSON.stringify(updated));
                } catch {}
                return updated;
            });
        },
        [editor, wordCount, scenes.length]
    );

    // Version History: Restore previous snapshot
    const handleRestoreVersion = useCallback(
        (snapshot: VersionSnapshot) => {
            if (!editor) return;
            const currentJson = editor.getJSON();
            const backup: VersionSnapshot = {
                id: `auto-backup-${Date.now()}`,
                name: `Pre-restore Backup (${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})`,
                timestamp: "Just now",
                isoDate: new Date().toISOString(),
                author: "Admin",
                wordCount: wordCount,
                sceneCount: scenes.length,
                content: currentJson
            };

            editor.commands.setContent(snapshot.content as object);
            setActivePreviewId(null);
            setIsHistoryOpen(false);

            setVersions((prev) => {
                const updated = [backup, ...prev];
                try {
                    localStorage.setItem(VERSIONS_STORAGE_KEY, JSON.stringify(updated));
                } catch {}
                return updated;
            });
        },
        [editor, wordCount, scenes.length]
    );

    const handlePreviewVersion = useCallback(
        (snapshot: VersionSnapshot | null) => {
            if (!editor) return;
            if (snapshot) {
                setActivePreviewId(snapshot.id);
                editor.commands.setContent(snapshot.content as object);
            } else {
                setActivePreviewId(null);
                try {
                    const saved = localStorage.getItem(currentStorageKey);
                    if (saved) {
                        editor.commands.setContent(JSON.parse(saved));
                    }
                } catch {}
            }
        },
        [editor, currentStorageKey]
    );

    // Image embed handler
    const handleInsertImage = useCallback(
        (src: string, caption?: string) => {
            if (!editor) return;
            const { state } = editor;
            const { selection } = state;
            const parentNode = selection.$from.parent;
            const isEmpty = parentNode.isBlock && parentNode.textContent.trim().length === 0;
            const start = selection.$from.start();
            const end = selection.$from.end();

            const contentToInsert = [
                {
                    type: "scriptImage",
                    attrs: { src, caption: caption || "" }
                },
                {
                    type: "action",
                    content: []
                }
            ];

            if (isEmpty) {
                editor.chain().focus().deleteRange({ from: start, to: end }).insertContent(contentToInsert).run();
            } else {
                editor.chain().focus().insertContent(contentToInsert).run();
            }
        },
        [editor]
    );

    // Global key bindings
    useEffect(() => {
        const handleGlobalKey = (e: KeyboardEvent) => {
            if (e.altKey && e.key === "Backspace") {
                e.preventDefault();
                handleStashCut();
                return;
            }

            if (e.altKey && e.key.toLowerCase() === "t") {
                e.preventDefault();
                handleTogglePageTheme();
                return;
            }

            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
                e.preventDefault();
                setFindReplaceOpen(true);
            } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
                e.preventDefault();
                setCommandPaletteOpen(true);
            } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
                e.preventDefault();
                setIsNavOpen((prev) => !prev);
            } else if (e.key === "F11") {
                e.preventDefault();
                setIsFocusMode((prev) => !prev);
            } else if (e.key === "Escape") {
                if (findReplaceOpen) setFindReplaceOpen(false);
                if (commandPaletteOpen) setCommandPaletteOpen(false);
                if (insertImageOpen) setInsertImageOpen(false);
                if (isFocusMode) setIsFocusMode(false);
            }
        };

        window.addEventListener("keydown", handleGlobalKey);
        return () => window.removeEventListener("keydown", handleGlobalKey);
    }, [findReplaceOpen, commandPaletteOpen, insertImageOpen, isFocusMode, handleStashCut, handleTogglePageTheme]);

    // Initial mount & hydration
    useEffect(() => {
        setMounted(true);
        setPageTheme(getStoredPageTheme());
        if (!editor) return;

        try {
            const saved = localStorage.getItem(currentStorageKey);
            if (saved) {
                editor.commands.setContent(JSON.parse(saved));
            }
            const savedStash = localStorage.getItem(STASH_STORAGE_KEY);
            if (savedStash) {
                setStashItems(JSON.parse(savedStash));
            }
            const savedVersions = localStorage.getItem(VERSIONS_STORAGE_KEY);
            if (savedVersions) {
                setVersions(JSON.parse(savedVersions));
            }
        } catch {}

        analyzeScript(editor);
    }, [editor, analyzeScript, currentStorageKey]);

    const handleUpdateTitlePage = (updates: Partial<TitlePageData>) => {
        setTitlePageData((prev) => ({ ...prev, ...updates }));
    };

    const handleSelectScene = (pos: number) => {
        if (!editor) return;
        editor.chain().focus().setTextSelection(pos).run();
    };

    const handleDeleteScene = useCallback(
        (scenePos: number) => {
            if (!editor) return;
            const { doc } = editor.state;
            let targetPos: number | null = null;
            let targetSize = 0;

            const directNode = doc.nodeAt(scenePos);
            if (directNode && directNode.type.name === "sceneHeading") {
                targetPos = scenePos;
                targetSize = directNode.nodeSize;
            } else {
                doc.descendants((n, p) => {
                    if (targetPos !== null) return false;
                    if (n.type.name === "sceneHeading" && (p === scenePos || Math.abs(p - scenePos) <= 2)) {
                        targetPos = p;
                        targetSize = n.nodeSize;
                        return false;
                    }
                });
            }

            if (targetPos !== null) {
                if (doc.childCount <= 1) {
                    editor.commands.setContent([{ type: "action", content: [] }]);
                } else {
                    const tr = editor.state.tr.delete(targetPos, targetPos + targetSize);
                    editor.view.dispatch(tr);
                }
                editor.commands.focus();
                analyzeScript(editor);
            }
        },
        [editor, analyzeScript]
    );

    const handleAddScene = () => {
        if (!editor) return;
        editor
            .chain()
            .focus()
            .insertContent([
                {
                    type: "sceneHeading",
                    content: [{ type: "text", text: "INT. NEW LOCATION - DAY" }]
                },
                {
                    type: "action",
                    content: [{ type: "text", text: "" }]
                }
            ])
            .run();
    };

    const handleInsertBeat = (title: string, synopsis: string) => {
        if (!editor) return;
        editor
            .chain()
            .focus()
            .insertContent([
                {
                    type: "sceneHeading",
                    content: [{ type: "text", text: `INT. ${title.toUpperCase()} - CONTINUOUS` }]
                },
                {
                    type: "action",
                    content: [{ type: "text", text: synopsis }]
                }
            ])
            .run();
    };

    const handleExportFdx = () => {
        if (!editor) return;
        const xml = exportToFdx(editor.getJSON(), scriptTitle, titlePageData.author);
        const blob = new Blob([xml], { type: "application/xml" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${scriptTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.fdx`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleExportFountain = () => {
        if (!editor) return;
        const text = exportToFountain(editor.getJSON(), scriptTitle, titlePageData.author);
        const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${scriptTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.fountain`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !editor) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            if (!content) return;

            if (file.name.endsWith(".fdx")) {
                const json = parseFdx(content);
                editor.commands.setContent(json);
                setScriptTitle(file.name.replace(/\.fdx$/i, ""));
            } else {
                const json = parseFountain(content);
                editor.commands.setContent(json);
                setScriptTitle(file.name.replace(/\.(fountain|txt)$/i, ""));
            }
        };
        reader.readAsText(file);
    };

    const handleTitleChange = (newTitle: string) => {
        setScriptTitle(newTitle);
        if (scriptId) {
            updateScript(scriptId, { title: newTitle });
        }
    };

    if (!mounted) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-[#0e1015] text-slate-500 font-mono text-xs select-none">
                Initializing Studio...
            </div>
        );
    }

    return (
        <AccessGuard>
            <div className="flex flex-col h-screen overflow-hidden bg-[#0e1015] script-editor-page">
                {/* Arc Studio Pure Minimalist Header */}
                <ScreenplayToolbar
                    editor={editor}
                    scriptTitle={scriptTitle}
                    setScriptTitle={handleTitleChange}
                    layoutMode={layoutMode}
                    setLayoutMode={setLayoutMode}
                    isFocusMode={isFocusMode}
                    setIsFocusMode={setIsFocusMode}
                    isNavOpen={isNavOpen}
                    setIsNavOpen={setIsNavOpen}
                    isStashOpen={isStashOpen}
                    setIsStashOpen={setIsStashOpen}
                    isHistoryOpen={isHistoryOpen}
                    setIsHistoryOpen={setIsHistoryOpen}
                    pageTheme={pageTheme}
                    onTogglePageTheme={handleTogglePageTheme}
                    onOpenCommandPalette={() => setCommandPaletteOpen(true)}
                    onOpenFindReplace={() => setFindReplaceOpen(true)}
                    onInsertImageModal={() => setInsertImageOpen(true)}
                    onExportFdx={handleExportFdx}
                    onExportFountain={handleExportFountain}
                    onImportFile={handleImportFile}
                />

                <div className="flex flex-1 overflow-hidden relative">
                    {/* Left Scenes Outline Navigator */}
                    {!isFocusMode && layoutMode !== "beatboard" && (
                        <SceneNavigator
                            scenes={scenes}
                            characters={characters}
                            isOpen={isNavOpen}
                            setIsOpen={setIsNavOpen}
                            onSelectScene={handleSelectScene}
                            onAddScene={handleAddScene}
                            onDeleteScene={handleDeleteScene}
                            totalPages={totalPages}
                            scenePages={scenePages}
                        />
                    )}

                    {/* Center Main Stage */}
                    {layoutMode === "beatboard" && !isFocusMode ? (
                        <main className="flex-1 overflow-hidden">
                            <BeatBoard
                                scriptId={scriptId || undefined}
                                onInsertBeatToScript={handleInsertBeat}
                                sceneHeadings={scenes.map((s) => s.slugline)}
                            />
                        </main>
                    ) : layoutMode === "split" && !isFocusMode ? (
                        <div className="flex flex-1 overflow-hidden">
                            {/* Left half: Screenplay Canvas */}
                            <main
                                onContextMenu={(e) => {
                                    e.preventDefault();
                                    setContextMenuPos({ x: e.clientX, y: e.clientY });
                                    setIsContextMenuOpen(true);
                                }}
                                className="flex-1 overflow-y-auto relative bg-[#131315] border-r border-[#242429]"
                            >
                                {isPageView ? (
                                    <div className="flex flex-col items-center pt-8 pb-72 md:pb-[55vh] px-4 space-y-8 select-text">
                                        <div className={`screenplay-page-sheet ${pageTheme === "light" ? "screenplay-page-light" : ""}`}>
                                            <TitlePage
                                                data={titlePageData}
                                                onChange={handleUpdateTitlePage}
                                                isContinuous={false}
                                                theme={pageTheme}
                                            />
                                        </div>
                                        <div className={`screenplay-page-sheet ${pageTheme === "light" ? "screenplay-page-light" : ""}`}>
                                            <EditorContent editor={editor} />
                                        </div>
                                    </div>
                                ) : (
                                    <div className={`screenplay-continuous-mode ${pageTheme === "light" ? "screenplay-page-light" : ""}`}>
                                        <TitlePage
                                            data={titlePageData}
                                            onChange={handleUpdateTitlePage}
                                            isContinuous={true}
                                            theme={pageTheme}
                                        />
                                        <div
                                            className={`relative my-8 border-t flex items-center justify-center ${
                                                pageTheme === "light" ? "border-zinc-300" : "border-[#242429]"
                                            }`}
                                        >
                                            <span
                                                className={`px-3 text-[10px] font-mono uppercase tracking-widest ${
                                                    pageTheme === "light" ? "bg-white text-zinc-500" : "bg-[#131315] text-zinc-500"
                                                }`}
                                            >
                                                Screenplay Start - Page 1
                                            </span>
                                        </div>
                                        <EditorContent editor={editor} />
                                    </div>
                                )}
                            </main>

                            {/* Right half: Arc Studio Plot Board */}
                            <aside className="w-1/2 overflow-hidden bg-[#18181b]">
                                <BeatBoard
                                    scriptId={scriptId || undefined}
                                    onInsertBeatToScript={handleInsertBeat}
                                    sceneHeadings={scenes.map((s) => s.slugline)}
                                />
                            </aside>
                        </div>
                    ) : (
                        /* Script Full Mode */
                        <main
                            onContextMenu={(e) => {
                                e.preventDefault();
                                setContextMenuPos({ x: e.clientX, y: e.clientY });
                                setIsContextMenuOpen(true);
                            }}
                            className="flex-1 overflow-y-auto relative bg-[#131315]"
                        >
                            {activePreviewId && (
                                <div className="no-print sticky top-0 z-20 flex items-center justify-between px-4 py-2 bg-[#18181b] border-b border-[#242429] text-zinc-300 text-xs backdrop-blur-md font-mono">
                                    <span>Viewing historical snapshot preview (Read-only)</span>
                                    <button
                                        onClick={() => handlePreviewVersion(null)}
                                        className="px-2.5 py-0.5 bg-[#252529] hover:bg-[#2e2e34] border border-[#303036] text-zinc-200 rounded text-[11px]"
                                    >
                                        Exit Preview
                                    </button>
                                </div>
                            )}

                            {isPageView ? (
                                <div className="flex flex-col items-center pt-8 pb-72 md:pb-[55vh] px-4 space-y-8 select-text">
                                    <div className={`screenplay-page-sheet ${pageTheme === "light" ? "screenplay-page-light" : ""}`}>
                                        <TitlePage
                                            data={titlePageData}
                                            onChange={handleUpdateTitlePage}
                                            isContinuous={false}
                                            theme={pageTheme}
                                        />
                                    </div>
                                    <div className={`screenplay-page-sheet ${pageTheme === "light" ? "screenplay-page-light" : ""}`}>
                                        <EditorContent editor={editor} />
                                    </div>
                                </div>
                            ) : (
                                <div className={`screenplay-continuous-mode ${pageTheme === "light" ? "screenplay-page-light" : ""}`}>
                                    <TitlePage
                                        data={titlePageData}
                                        onChange={handleUpdateTitlePage}
                                        isContinuous={true}
                                        theme={pageTheme}
                                    />
                                    <div
                                        className={`relative my-8 border-t flex items-center justify-center ${
                                            pageTheme === "light" ? "border-zinc-300" : "border-[#242429]"
                                        }`}
                                    >
                                        <span
                                            className={`px-3 text-[10px] font-mono uppercase tracking-widest ${
                                                pageTheme === "light" ? "bg-white text-zinc-500" : "bg-[#131315] text-zinc-500"
                                            }`}
                                        >
                                            Screenplay Start - Page 1
                                        </span>
                                    </div>
                                    <EditorContent editor={editor} />
                                </div>
                            )}

                            {/* Floating Arc Studio Format Dock (Always visible in Script Mode) */}
                            <ArcShortcutDock
                                editor={editor}
                                isPageView={isPageView}
                                onTogglePageView={() => setIsPageView((v) => !v)}
                                pageTheme={pageTheme}
                                onTogglePageTheme={handleTogglePageTheme}
                                onOpenImageModal={() => setInsertImageOpen(true)}
                                onStashSelection={handleStashCut}
                                onTogglePlotBoard={() => setLayoutMode((m) => (m === "beatboard" ? "script" : "beatboard"))}
                                onToggleStash={() => setIsStashOpen((v) => !v)}
                            />

                            {/* Right-click Context Menu */}
                            <ArcFormattingMenu
                                editor={editor}
                                isOpen={isContextMenuOpen}
                                onClose={() => setIsContextMenuOpen(false)}
                                onOpenBeatBoard={() => setLayoutMode("beatboard")}
                                onOpenComments={() => setIsStashOpen(true)}
                                position={contextMenuPos}
                                align="context"
                            />
                        </main>
                    )}

                    {/* Autocomplete Popup */}
                    <AutocompleteMenu
                        suggestions={suggestions}
                        title={suggestionTitle}
                        isOpen={showSuggestions}
                        selectedIndex={suggestionIndex}
                        position={suggestionCoords}
                        onHover={(idx) => {
                            setSuggestionIndex(idx);
                            suggestionsStateRef.current.index = idx;
                            suggestionsStateRef.current.userInteracted = true;
                        }}
                        onSelect={handleSelectSuggestion}
                    />

                    {/* Right Drawers */}
                    {!isFocusMode && (
                        <VersionHistoryDrawer
                            versions={versions}
                            isOpen={isHistoryOpen}
                            onClose={() => setIsHistoryOpen(false)}
                            activePreviewId={activePreviewId}
                            onPreviewVersion={handlePreviewVersion}
                            onRestoreVersion={handleRestoreVersion}
                            onCreateNamedVersion={handleCreateNamedVersion}
                        />
                    )}

                    {!isFocusMode && (
                        <ScriptStash
                            items={stashItems}
                            isOpen={isStashOpen}
                            onClose={() => setIsStashOpen(false)}
                            isPinned={false}
                            onTogglePin={() => {}}
                            onRestore={handleRestoreStashItem}
                            onDelete={handleDeleteStashItem}
                            onAddManualNote={handleAddManualStashNote}
                        />
                    )}

                    {/* In-script Storyboard Image Dialog */}
                    <InsertImageDialog isOpen={insertImageOpen} onClose={() => setInsertImageOpen(false)} onInsert={handleInsertImage} />

                    {/* Find & Replace Drawer */}
                    {layoutMode !== "beatboard" && (
                        <FindReplaceBar
                            editor={editor}
                            isOpen={findReplaceOpen}
                            onClose={() => setFindReplaceOpen(false)}
                            drawerOffset={isHistoryOpen || isStashOpen}
                        />
                    )}

                    {/* Command Palette Modal (Cmd+K) */}
                    <CommandPalette
                        isOpen={commandPaletteOpen}
                        onClose={() => setCommandPaletteOpen(false)}
                        onSetElement={(t) => editor?.chain().focus().setNode(t).run()}
                        onInsertPageBreak={() => editor?.chain().focus().setPageBreak().run()}
                        onJumpToScene={handleSelectScene}
                        scenes={scenes}
                        onExportFdx={handleExportFdx}
                        onExportFountain={handleExportFountain}
                        onPrintPdf={() => typeof window !== "undefined" && window.print()}
                        onTogglePageView={() => setIsPageView((v) => !v)}
                        onToggleSplitView={() => setLayoutMode((m) => (m === "split" ? "script" : "split"))}
                        onToggleFocusMode={() => setIsFocusMode((f) => !f)}
                        pageTheme={pageTheme}
                        onTogglePageTheme={handleTogglePageTheme}
                    />

                    {/* Arc Studio Bottom-Right Status Telemetry Capsule */}
                    {!isFocusMode && layoutMode !== "beatboard" && (
                        <div className="no-print fixed bottom-6 right-6 z-30 flex items-center gap-2 px-3 py-1.5 bg-[#18181b]/95 hover:bg-[#202024] border border-[#28282e] rounded-full text-xs font-mono text-zinc-400 shadow-xl backdrop-blur-md select-none transition-colors">
                            <span>{wordCount} words</span>
                            <span className="text-zinc-600">|</span>
                            <span className="text-zinc-200 font-semibold">
                                Page {currentPage} / {totalPages}
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </AccessGuard>
    );
}

export default function ScreenplayEditorPage() {
    return (
        <Suspense
            fallback={
                <div className="flex items-center justify-center min-h-screen bg-[#131315] text-zinc-500 font-mono text-xs select-none">
                    Loading Screenplay Editor...
                </div>
            }
        >
            <ScreenplayEditorContent />
        </Suspense>
    );
}
