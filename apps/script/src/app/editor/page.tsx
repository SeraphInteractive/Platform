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
import { HardBreakLeafText } from "@/editor/extensions/HardBreakLeafText";
import { extractScriptContext, COMMON_PREFIXES, COMMON_TIMES, COMMON_TRANSITIONS } from "@/editor/extensions/suggestions";
import { exportToFdx, parseFdx } from "@/editor/format/fdx";
import { exportToFountain, parseFountain } from "@/editor/format/fountain";
import { downloadPdf } from "@/editor/format/pdf";

import { ScreenplayToolbar, type ViewLayoutMode } from "@/components/ScreenplayToolbar";
import { SceneNavigator, type SceneItem } from "@/components/SceneNavigator";
import { BeatBoard } from "@/components/BeatBoard";
import { OutlineView } from "@/components/OutlineView";
import { AutocompleteMenu } from "@/components/AutocompleteMenu";
import { CommandPalette } from "@/components/CommandPalette";
import { FindReplaceBar } from "@/components/FindReplaceBar";
import { ArcShortcutDock } from "@/components/ArcShortcutDock";
import { ArcFormattingMenu } from "@/components/ArcFormattingMenu";
import { ArcGutterHandle } from "@/components/ArcGutterHandle";
import { ArcMarginRuler, type MarginSettings } from "@/components/ArcMarginRuler";
import { ArcPasteHandler } from "@/editor/extensions/ArcPasteHandler";
import { ScriptStash, type StashItem } from "@/components/ScriptStash";
import { VersionHistoryDrawer, type VersionSnapshot } from "@/components/VersionHistoryDrawer";
import { TitlePage, type TitlePageData } from "@/components/TitlePage";
import { InsertImageDialog } from "@/components/InsertImageDialog";
import { InviteUserModal } from "@/components/InviteUserModal";
import { AccessGuard, useStudioAuth, canAccessScript } from "@/components/AccessGuard";
import { getScriptById, updateScript, getStoredPageTheme, setStoredPageTheme, type PageTheme } from "@/lib/ScriptStorage";
import { ScriptApiClient } from "@/lib/ScriptApiClient";
import type { ScreenplayVersionDto } from "@platform/contracts";

function toClientVersionSnapshot(dto: ScreenplayVersionDto): VersionSnapshot {
    return {
        id: dto.id,
        name: dto.name,
        timestamp: new Date(dto.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        isoDate: dto.createdAt,
        author: dto.user?.username || "Writer",
        avatarUrl: dto.user?.avatarUrl || null,
        wordCount: dto.wordCount,
        sceneCount: dto.sceneCount,
        content: dto.content
    };
}

const DEFAULT_SCRIPT_CONTENT = {
    type: "doc",
    content: [
        {
            type: "sceneHeading",
            content: [{ type: "text", text: "INT. SCENE - DAY" }]
        }
    ]
};

const DEFAULT_TITLE_PAGE: TitlePageData = {
    title: "UNTITLED SCREENPLAY",
    author: "",
    basedOn: "",
    contact: "",
    draftInfo: ""
};

const STASH_STORAGE_KEY = "stairway_screenplay_stash_v1";
const VERSIONS_STORAGE_KEY = "stairway_screenplay_versions_v1";

function ScreenplayEditorContent() {
    const searchParams = useSearchParams();
    const scriptId = searchParams.get("id");
    const { user, isAdmin } = useStudioAuth();

    const [serverRole, setServerRole] = useState<"owner" | "editor" | "viewer" | null>(null);

    const userRole = useMemo(() => {
        if (isAdmin) return "admin";
        if (serverRole) return serverRole;
        const invite = user?.acceptedInvites?.find((i: any) => !i.scriptId || i.scriptId === scriptId);
        return invite?.role || (user?.isInvited ? "editor" : "viewer");
    }, [isAdmin, serverRole, user, scriptId]);

    const isReadOnly = !isAdmin && userRole === "viewer";
    const isReadOnlyRef = useRef(isReadOnly);
    useEffect(() => {
        isReadOnlyRef.current = isReadOnly;
    }, [isReadOnly]);

    const userRef = useRef(user);
    useEffect(() => {
        userRef.current = user;
    }, [user]);

    const [mounted, setMounted] = useState(false);
    const [layoutMode, setLayoutMode] = useState<ViewLayoutMode>("script");
    const [isPageView, setIsPageView] = useState(true);
    const [pageTheme, setPageTheme] = useState<PageTheme>("dark");
    const [isFocusMode, setIsFocusMode] = useState(false);
    const [isNavOpen, setIsNavOpen] = useState(true);
    const [isStashOpen, setIsStashOpen] = useState(false);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [insertImageOpen, setInsertImageOpen] = useState(false);
    const [isInviteOpen, setIsInviteOpen] = useState(false);
    const [scriptTitle, setScriptTitle] = useState("Untitled Screenplay");
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

    const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
    const [findReplaceOpen, setFindReplaceOpen] = useState(false);
    const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
    const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);

    const [isMarginModeOpen, setIsMarginModeOpen] = useState(false);
    const [elementFormatting, setElementFormatting] = useState<Record<string, MarginSettings>>({
        sceneHeading: { left: 0, width: 6.0, right: 0, alignment: "left", spacingBefore: 1.5 },
        action: { left: 0, width: 6.0, right: 0, alignment: "left", spacingBefore: 0.75 },
        character: { left: 2.2, width: 3.5, right: 0.3, alignment: "left", spacingBefore: 1.1 },
        parenthetical: { left: 1.6, width: 2.8, right: 1.6, alignment: "left", spacingBefore: 0 },
        dialogue: { left: 1.0, width: 3.6, right: 1.4, alignment: "left", spacingBefore: 0 },
        transition: { left: 4.0, width: 2.0, right: 0, alignment: "right", spacingBefore: 1.5 }
    });

    const defaultMargin: MarginSettings = {
        left: 0,
        width: 6.0,
        right: 0,
        alignment: "left",
        spacingBefore: 1
    };

    const getElementMargins = (nodeType: string): MarginSettings => {
        return elementFormatting[nodeType] || elementFormatting.dialogue || defaultMargin;
    };

    const [gutterPos, setGutterPos] = useState<{
        visible: boolean;
        nodeType: string;
        nodePos: number;
        top: number;
        left: number;
    }>({ visible: false, nodeType: "dialogue", nodePos: 0, top: 0, left: 0 });

    const [activeNodeInfo, setActiveNodeInfo] = useState<{
        pos: number;
        nodeType: string;
    } | null>(null);

    const [dropIndicator, setDropIndicator] = useState<{ top: number; left: number; width: number } | null>(null);
    const updateActiveBlockRef = useRef<(ed: any) => void>(() => {});

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
    const [isSaving, setIsSaving] = useState(false);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const debouncedSaveRef = useRef<NodeJS.Timeout | null>(null);

    const triggerSaveIndicator = useCallback(() => {
        setIsSaving(true);
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
            setIsSaving(false);
        }, 600);
    }, []);

    const scriptIdRef = useRef(scriptId);
    useEffect(() => {
        scriptIdRef.current = scriptId;
    }, [scriptId]);

    const currentStorageKey = useMemo(() => {
        return scriptId ? `stairway_script_doc_${scriptId}` : "stairway_screenplay_draft_v1";
    }, [scriptId]);

    const currentStorageKeyRef = useRef(currentStorageKey);
    useEffect(() => {
        currentStorageKeyRef.current = currentStorageKey;
    }, [currentStorageKey]);

    const isHydratedRef = useRef(false);
    const loadedScriptIdRef = useRef<string | null>(null);

    // sync script metadata when script id changes
    useEffect(() => {
        if (!scriptId) return;
        const doc = getScriptById(scriptId);
        if (doc) {
            setScriptTitle(doc.title);
            if (doc.titlePage) {
                setTitlePageData((prev) => ({
                    ...prev,
                    title: doc.titlePage?.title || doc.title || prev.title,
                    author: doc.titlePage?.author || doc.author || prev.author,
                    basedOn: doc.titlePage?.basedOn ?? prev.basedOn,
                    contact: doc.titlePage?.contact ?? prev.contact,
                    draftInfo: doc.titlePage?.draftInfo ?? prev.draftInfo
                }));
            } else {
                setTitlePageData((prev) => ({
                    ...prev,
                    title: doc.title,
                    author: doc.author || ""
                }));
            }
        }
    }, [scriptId]);

    const initialContent = useMemo(() => {
        if (typeof window === "undefined") return DEFAULT_SCRIPT_CONTENT;
        try {
            const key = scriptId ? `stairway_script_doc_${scriptId}` : "stairway_screenplay_draft_v1";
            const saved = localStorage.getItem(key);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed && typeof parsed === "object" && parsed.type === "doc" && Array.isArray(parsed.content)) {
                    return parsed;
                }
            }
        } catch {}
        return DEFAULT_SCRIPT_CONTENT;
    }, [scriptId]);

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
            HardBreakLeafText,
            ScreenplayPagination,
            ScreenplayKeymap,
            ArcPasteHandler,
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
        content: initialContent,
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
            if (isReadOnlyRef.current || !isHydratedRef.current) return;
            triggerSaveIndicator();
            try {
                const json = ed.getJSON();
                const storageKey = currentStorageKeyRef.current;
                localStorage.setItem(storageKey, JSON.stringify(json));

                const words = ed.storage.characterCount?.words?.() || 0;
                let detectedSceneCount = 0;
                ed.state.doc.descendants((node) => {
                    if (node.type.name === "sceneHeading") detectedSceneCount++;
                });

                // sync metadata back to ScriptStorage
                const activeId = scriptIdRef.current;
                if (activeId) {
                    updateScript(activeId, {
                        wordCount: words,
                        sceneCount: detectedSceneCount
                    });

                    // debounced live auto-save to backend
                    if (debouncedSaveRef.current) clearTimeout(debouncedSaveRef.current);
                    debouncedSaveRef.current = setTimeout(async () => {
                        try {
                            await ScriptApiClient.updateScript(activeId, {
                                content: json,
                                wordCount: words,
                                sceneCount: detectedSceneCount
                            });
                        } catch (err) {
                            console.error("Auto-save to server failed", err);
                        }
                    }, 800);
                }

                // auto-checkpoint version history every 5 minutes
                const now = Date.now();
                if (now - lastSnapshotTime.current > 5 * 60 * 1000) {
                    lastSnapshotTime.current = now;
                    if (activeId) {
                        ScriptApiClient.createVersion(activeId, {
                            name: `Auto-save (${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})`,
                            content: json,
                            wordCount: words,
                            sceneCount: detectedSceneCount
                        })
                            .then(() => ScriptApiClient.listVersions(activeId))
                            .then((dtos) => setVersions(dtos.map(toClientVersionSnapshot)))
                            .catch((err) => console.error("Auto checkpoint failed", err));
                    }
                }
            } catch {}

            // convert action to scene heading on slugline prefix matching Arc Studio
            try {
                const { selection } = ed.state;
                const parentNode = selection.$from.parent;
                if (parentNode.type.name === "action") {
                    const text = parentNode.textContent.trim().toUpperCase();
                    if (
                        text === "INT." ||
                        text === "EXT." ||
                        text === "INT./EXT." ||
                        text === "I/E." ||
                        text.startsWith("INT. ") ||
                        text.startsWith("EXT. ") ||
                        text.startsWith("INT./EXT. ") ||
                        text.startsWith("I/E. ")
                    ) {
                        const sceneHeadingType = ed.state.schema.nodes.sceneHeading;
                        if (sceneHeadingType) {
                            const tr = ed.state.tr;
                            tr.setBlockType(selection.$from.start(), selection.$from.end(), sceneHeadingType, {});
                            ed.view.dispatch(tr);
                        }
                    }
                }
            } catch {}

            analyzeScriptRef.current(ed);
            updateActiveSuggestionsRef.current(ed);
        },
        onSelectionUpdate: ({ editor: ed }) => {
            if (suggestionsStateRef.current.isOpen && !suggestionsStateRef.current.userInteracted) {
                suggestionsStateRef.current.isOpen = false;
                setShowSuggestions(false);
            }
            const pStorage = (ed.storage as any).screenplayPagination;
            if (pStorage) {
                setCurrentPage(pStorage.currentPage || 1);
            }
            updateActiveBlockRef.current(ed);
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
            // only show suggestions when actively typing a location or time of day
            if (rawText.includes("-")) {
                newTitle = "Time of Day";
                const parts = rawText.split(/-+/);
                const afterDash = (parts[parts.length - 1] ?? "").trim();
                newItems = COMMON_TIMES.filter((t) => (!afterDash || t.startsWith(afterDash)) && t !== afterDash);
            } else if (text.length >= 3) {
                const ctx = extractScriptContext(ed);
                newItems = ctx.sluglines.filter((s) => s.includes(text) && s !== text).slice(0, 5);
                if (newItems.length > 0) newTitle = "Location";
            }
        } else if (currentType === "character") {
            if (text.length >= 2) {
                const ctx = extractScriptContext(ed);
                newItems = ctx.characters.filter((c) => c.startsWith(text) && c !== text);
                if (newItems.length > 0) {
                    newTitle = "Character";
                } else if (ctx.characters.includes(text) || text.length >= 3) {
                    newItems = ["(V.O.)", "(O.S.)", "(CONT'D)"];
                    newTitle = "Extension";
                }
            }
        } else if (currentType === "transition") {
            if (text.length >= 2) {
                newTitle = "Transition";
                newItems = COMMON_TRANSITIONS.filter((t) => t.startsWith(text) && t !== text);
            }
        } else if (currentType === "parenthetical") {
            if (text.length >= 2) {
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
                newItems = commonDirs.filter((d) => d.toLowerCase().includes(text.toLowerCase()) && d.toLowerCase() !== text.toLowerCase());
            }
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
                if (advanceToType) {
                    const targetType = editor.state.schema.nodes[advanceToType];
                    if (targetType) {
                        const newPos = start + newText.length;
                        tr.split(newPos, 1, [{ type: targetType, attrs: {} }]);
                    }
                }
                editor.view.dispatch(tr.scrollIntoView());
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

    useEffect(() => {
        if (!editor) return;
        editor.setEditable(!isReadOnly);
    }, [editor, isReadOnly]);

    // move selected text or current paragraph into the stash buffer
    const handleStashCut = useCallback(() => {
        if (isReadOnly || !editor) return;
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
    }, [editor, isReadOnly]);

    // paste stashed item into editor at cursor
    const handleRestoreStashItem = useCallback(
        (item: StashItem) => {
            if (isReadOnly || !editor) return;
            editor
                .chain()
                .focus()
                .insertContent({
                    type: item.type === "note" ? "action" : item.type,
                    content: [{ type: "text", text: item.text }]
                })
                .run();
        },
        [editor, isReadOnly]
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

    const handleAddManualStashNote = useCallback(
        (title: string, text: string) => {
            if (isReadOnly) return;
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
        },
        [isReadOnly]
    );

    // snapshot current canvas state to version history
    const handleCreateNamedVersion = useCallback(
        async (name: string) => {
            if (isReadOnly || !editor) return;
            const activeId = scriptIdRef.current;
            const currentJson = editor.getJSON();

            if (activeId) {
                try {
                    await ScriptApiClient.createVersion(activeId, {
                        name,
                        content: currentJson,
                        wordCount,
                        sceneCount: scenes.length
                    });
                    const dtos = await ScriptApiClient.listVersions(activeId);
                    setVersions(dtos.map(toClientVersionSnapshot));
                    return;
                } catch (e) {
                    console.error("Failed to create named version on server", e);
                }
            }

            const currentUser = userRef.current;
            const authorName = currentUser?.globalName || currentUser?.username || "Admin";
            const avatarUrl = currentUser?.avatarUrl || null;
            const snapshot: VersionSnapshot = {
                id: `milestone-${Date.now()}`,
                name,
                timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                isoDate: new Date().toISOString(),
                author: authorName,
                avatarUrl,
                wordCount: wordCount,
                sceneCount: scenes.length,
                content: currentJson
            };

            setVersions((prev) => {
                const updated = [snapshot, ...prev];
                try {
                    localStorage.setItem(VERSIONS_STORAGE_KEY, JSON.stringify(updated));
                } catch {}
                return updated;
            });
        },
        [editor, wordCount, scenes.length, isReadOnly]
    );

    // restore canvas to selected historical version
    const handleRestoreVersion = useCallback(
        async (snapshot: VersionSnapshot) => {
            if (isReadOnly || !editor) return;
            const activeId = scriptIdRef.current;

            if (
                activeId &&
                !snapshot.id.startsWith("snap-") &&
                !snapshot.id.startsWith("auto-backup-") &&
                !snapshot.id.startsWith("milestone-")
            ) {
                try {
                    const restored = await ScriptApiClient.restoreVersion(activeId, snapshot.id);
                    editor.commands.setContent(restored.content as object, { emitUpdate: false });
                    setActivePreviewId(null);
                    setIsHistoryOpen(false);
                    analyzeScript(editor);
                    const dtos = await ScriptApiClient.listVersions(activeId);
                    setVersions(dtos.map(toClientVersionSnapshot));
                    return;
                } catch (e) {
                    console.error("Failed to restore version from server", e);
                }
            }

            const currentJson = editor.getJSON();
            const currentUser = userRef.current;
            const authorName = currentUser?.globalName || currentUser?.username || "Admin";
            const avatarUrl = currentUser?.avatarUrl || null;
            const backup: VersionSnapshot = {
                id: `auto-backup-${Date.now()}`,
                name: `Pre-restore Backup (${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})`,
                timestamp: "Just now",
                isoDate: new Date().toISOString(),
                author: authorName,
                avatarUrl,
                wordCount: wordCount,
                sceneCount: scenes.length,
                content: currentJson
            };

            editor.commands.setContent(snapshot.content as object);
            setActivePreviewId(null);
            setIsHistoryOpen(false);
            analyzeScript(editor);

            setVersions((prev) => {
                const updated = [backup, ...prev];
                try {
                    localStorage.setItem(VERSIONS_STORAGE_KEY, JSON.stringify(updated));
                } catch {}
                return updated;
            });
        },
        [editor, wordCount, scenes.length, isReadOnly, analyzeScript]
    );

    const handlePreviewVersion = useCallback(
        (snapshot: VersionSnapshot | null) => {
            if (!editor) return;
            if (snapshot) {
                setActivePreviewId(snapshot.id);
                editor.commands.setContent(snapshot.content as object, { emitUpdate: false });
            } else {
                setActivePreviewId(null);
                try {
                    const storageKey = currentStorageKeyRef.current;
                    const saved = localStorage.getItem(storageKey);
                    if (saved) {
                        editor.commands.setContent(JSON.parse(saved), { emitUpdate: false });
                    }
                } catch {}
            }
        },
        [editor]
    );

    // embed storyboard still at cursor
    const handleInsertImage = useCallback(
        (src: string, caption?: string) => {
            if (isReadOnly || !editor) return;
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

            if (e.altKey && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
                e.preventDefault();
                setIsMarginModeOpen((prev) => !prev);
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
                if (isMarginModeOpen) setIsMarginModeOpen(false);
                if (findReplaceOpen) setFindReplaceOpen(false);
                if (commandPaletteOpen) setCommandPaletteOpen(false);
                if (insertImageOpen) setInsertImageOpen(false);
                if (isFocusMode) setIsFocusMode(false);
            }
        };

        window.addEventListener("keydown", handleGlobalKey);
        return () => window.removeEventListener("keydown", handleGlobalKey);
    }, [findReplaceOpen, commandPaletteOpen, insertImageOpen, isFocusMode, handleStashCut, handleTogglePageTheme]);

    // sync element formatting to css variables
    useEffect(() => {
        if (typeof document === "undefined") return;
        const root = document.documentElement;
        Object.entries(elementFormatting).forEach(([key, val]) => {
            const prefix = `--margin-${key.toLowerCase()}`;
            root.style.setProperty(`${prefix}-left`, `${val.left}in`);
            root.style.setProperty(`${prefix}-width`, `${val.width}in`);
            root.style.setProperty(`${prefix}-align`, val.alignment);
            root.style.setProperty(`${prefix}-spacing-before`, String(val.spacingBefore));
        });
    }, [elementFormatting]);

    const updateActiveBlock = useCallback((ed: any) => {
        if (!ed || ed.isDestroyed) return;
        const { selection } = ed.state;
        const { $from } = selection;
        if ($from.depth < 1) return;

        const node = $from.node(1);
        const pos = $from.before(1);
        const nodeType = node.type.name;

        setActiveNodeInfo({ pos, nodeType });

        try {
            const dom = ed.view.nodeDOM(pos) as HTMLElement | null;
            if (dom && dom.getBoundingClientRect) {
                document.querySelectorAll(".is-active-block").forEach((el) => {
                    if (el !== dom) el.classList.remove("is-active-block");
                });
                dom.classList.add("is-active-block");

                const pageSheet = dom.closest(".screenplay-page-sheet, .screenplay-continuous-mode, .ProseMirror");
                if (pageSheet) {
                    const sheetRect = pageSheet.getBoundingClientRect();
                    const domRect = dom.getBoundingClientRect();
                    setGutterPos({
                        visible: true,
                        nodeType,
                        nodePos: pos,
                        top: domRect.top - sheetRect.top + 4,
                        left: domRect.left - sheetRect.left
                    });
                }
            }
        } catch {}
    }, []);

    useEffect(() => {
        updateActiveBlockRef.current = updateActiveBlock;
    }, [updateActiveBlock]);

    const handleEditorMouseMove = useCallback(
        (e: React.MouseEvent) => {
            const target = (e.target as HTMLElement).closest(".screenplay-element") as HTMLElement | null;
            if (!target || !editor) return;

            try {
                const pos = editor.view.posAtDOM(target, 0);
                if (typeof pos !== "number" || pos < 0) return;

                const $pos = editor.state.doc.resolve(pos);
                const node = $pos.node(1) || $pos.parent;
                const startPos = $pos.before(1);

                const pageSheet = target.closest(".screenplay-page-sheet, .screenplay-continuous-mode, .ProseMirror");
                if (pageSheet) {
                    const sheetRect = pageSheet.getBoundingClientRect();
                    const domRect = target.getBoundingClientRect();

                    setGutterPos({
                        visible: true,
                        nodeType: node.type.name,
                        nodePos: startPos,
                        top: domRect.top - sheetRect.top + 4,
                        left: domRect.left - sheetRect.left
                    });
                }
            } catch {}
        },
        [editor]
    );

    const handleMoveBlock = useCallback(
        (sourcePos: number, targetPos: number) => {
            if (!editor) return;
            const { doc } = editor.state;
            const sourceNode = doc.nodeAt(sourcePos);
            if (!sourceNode) return;

            const tr = editor.state.tr;
            tr.delete(sourcePos, sourcePos + sourceNode.nodeSize);
            const adjustedTarget = targetPos > sourcePos ? targetPos - sourceNode.nodeSize : targetPos;
            tr.insert(adjustedTarget, sourceNode);
            editor.view.dispatch(tr);
            setDropIndicator(null);
        },
        [editor]
    );

    const handleDragOver = useCallback(
        (e: React.DragEvent) => {
            if (!e.dataTransfer.types.includes("text/plain")) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";

            const target = (e.target as HTMLElement).closest(".screenplay-element") as HTMLElement | null;
            if (target && editor) {
                const targetRect = target.getBoundingClientRect();
                const pageSheet = target.closest(".screenplay-page-sheet, .screenplay-continuous-mode, .ProseMirror");
                if (pageSheet) {
                    const sheetRect = pageSheet.getBoundingClientRect();
                    const isBottomHalf = e.clientY > targetRect.top + targetRect.height / 2;
                    const top = isBottomHalf ? targetRect.bottom - sheetRect.top : targetRect.top - sheetRect.top;

                    setDropIndicator({
                        top,
                        left: targetRect.left - sheetRect.left,
                        width: targetRect.width
                    });
                }
            }
        },
        [editor]
    );

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            const data = e.dataTransfer.getData("text/plain");
            if (!data.startsWith("screenplay-node:") || !editor) return;
            e.preventDefault();

            const sourcePos = parseInt(data.replace("screenplay-node:", ""), 10);
            const target = (e.target as HTMLElement).closest(".screenplay-element") as HTMLElement | null;
            if (target) {
                const targetPos = editor.view.posAtDOM(target, 0);
                const $targetPos = editor.state.doc.resolve(targetPos);
                const targetRect = target.getBoundingClientRect();
                const isBottomHalf = e.clientY > targetRect.top + targetRect.height / 2;
                const insertPos = isBottomHalf ? $targetPos.after(1) : $targetPos.before(1);

                handleMoveBlock(sourcePos, insertPos);
            }
            setDropIndicator(null);
        },
        [editor, handleMoveBlock]
    );

    // load initial script content from server or local draft on mount
    useEffect(() => {
        setMounted(true);
        setPageTheme(getStoredPageTheme());
        if (!editor) return;

        let isCancelled = false;

        async function initScript() {
            try {
                let targetScriptId = scriptId;

                // fallback to server screenplays or migrate local draft
                if (!targetScriptId) {
                    const serverScripts = await ScriptApiClient.listScripts().catch(() => []);
                    if (!isCancelled && serverScripts.length > 0 && serverScripts[0]) {
                        targetScriptId = serverScripts[0].id;
                        window.history.replaceState(null, "", `?id=${encodeURIComponent(targetScriptId)}`);
                    } else if (!isCancelled) {
                        if (!isAdmin) {
                            window.location.href = "/studio/script";
                            return;
                        }

                        // check if user has existing local draft to migrate
                        let localDraftJson: any = null;
                        try {
                            const saved = localStorage.getItem("stairway_screenplay_draft_v1");
                            if (saved) {
                                const parsed = JSON.parse(saved);
                                if (parsed?.type === "doc" && Array.isArray(parsed?.content) && parsed.content.length > 0) {
                                    localDraftJson = parsed;
                                }
                            }
                        } catch {}

                        try {
                            const created = await ScriptApiClient.createScript({
                                title: localDraftJson ? "Recovered Screenplay" : "Untitled Screenplay",
                                content: localDraftJson ?? undefined
                            });
                            if (!isCancelled && created) {
                                targetScriptId = created.id;
                                window.history.replaceState(null, "", `?id=${encodeURIComponent(targetScriptId)}`);
                            }
                        } catch (e) {
                            console.error("Auto script creation failed", e);
                        }
                    }
                }

                if (isCancelled) return;

                // fetch script and revision log from server
                if (targetScriptId) {
                    loadedScriptIdRef.current = targetScriptId;
                    try {
                        const script = await ScriptApiClient.getScript(targetScriptId);
                        if (!isCancelled && script) {
                            setScriptTitle(script.title);
                            if (script.titlePage) {
                                setTitlePageData((prev) => ({
                                    ...prev,
                                    title: (script.titlePage as any)?.title || script.title || prev.title,
                                    author: (script.titlePage as any)?.author || prev.author,
                                    basedOn: (script.titlePage as any)?.basedOn ?? prev.basedOn,
                                    contact: (script.titlePage as any)?.contact ?? prev.contact,
                                    draftInfo: (script.titlePage as any)?.draftInfo ?? prev.draftInfo
                                }));
                            } else {
                                setTitlePageData((prev) => ({
                                    ...prev,
                                    title: script.title,
                                    author: ""
                                }));
                            }

                            if (script.content && typeof script.content === "object" && (script.content as any).type === "doc") {
                                editor?.commands.setContent(script.content as any, { emitUpdate: false });
                            }

                            if (script.userRole) {
                                setServerRole(script.userRole);
                            }

                            const serverVersions = await ScriptApiClient.listVersions(targetScriptId).catch(() => []);
                            if (!isCancelled && serverVersions.length > 0) {
                                setVersions(serverVersions.map(toClientVersionSnapshot));
                            }
                        }
                    } catch (e) {
                        console.error("Failed to load script from server", e);
                        if (!isAdmin) {
                            window.location.href = "/studio/script";
                            return;
                        }
                        const storageKey = `stairway_script_doc_${targetScriptId}`;
                        const saved = localStorage.getItem(storageKey) || localStorage.getItem("stairway_screenplay_draft_v1");
                        if (saved) {
                            try {
                                const parsed = JSON.parse(saved);
                                if (parsed?.type === "doc") {
                                    editor?.commands.setContent(parsed, { emitUpdate: false });
                                }
                            } catch {}
                        }
                    }
                } else {
                    if (!isAdmin) {
                        window.location.href = "/studio/script";
                        return;
                    }
                    const saved = localStorage.getItem("stairway_screenplay_draft_v1");
                    if (saved) {
                        try {
                            const parsed = JSON.parse(saved);
                            if (parsed?.type === "doc") {
                                editor?.commands.setContent(parsed, { emitUpdate: false });
                            }
                        } catch {}
                    }
                }

                if (!isCancelled) {
                    try {
                        const savedStash = localStorage.getItem(STASH_STORAGE_KEY);
                        if (savedStash) setStashItems(JSON.parse(savedStash));
                    } catch {}

                    isHydratedRef.current = true;
                    analyzeScript(editor);
                }
            } catch (err) {
                console.error("Initialization error", err);
                isHydratedRef.current = true;
            }
        }

        void initScript();

        return () => {
            isCancelled = true;
        };
    }, [editor, scriptId, analyzeScript]);

    const handleUpdateTitlePage = (updates: Partial<TitlePageData>) => {
        if (isReadOnly) return;
        setTitlePageData((prev) => {
            const updated = { ...prev, ...updates };
            const activeId = scriptIdRef.current;
            if (activeId) {
                updateScript(activeId, {
                    title: updated.title,
                    author: updated.author,
                    titlePage: updated
                });
                ScriptApiClient.updateScript(activeId, {
                    title: updated.title,
                    titlePage: updated
                }).catch(() => {});
            }
            return updated;
        });
    };

    const handleSelectScene = (pos: number) => {
        if (!editor) return;
        editor.chain().focus().setTextSelection(pos).run();
    };

    const handleDeleteScene = useCallback(
        (scenePos: number) => {
            if (isReadOnly || !editor) return;
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
        [editor, analyzeScript, isReadOnly]
    );

    const handleAddScene = () => {
        if (isReadOnly || !editor) return;
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
        if (isReadOnly || !editor) return;
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

    const handleExportPdf = () => {
        if (!editor) return;
        downloadPdf(editor.getJSON(), scriptTitle, titlePageData, { includeTitlePage: true });
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
        if (isReadOnly) return;
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
        if (isReadOnly) return;
        setScriptTitle(newTitle);
        triggerSaveIndicator();
        if (scriptId) {
            updateScript(scriptId, { title: newTitle });
        }
    };

    if (!mounted) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-[#1a1c1f] text-zinc-500 font-mono text-xs select-none">
                Initializing Studio...
            </div>
        );
    }

    // verify authorization for individual screenplay if script id is provided
    const isPermittedScript = !scriptId || canAccessScript(user, scriptId);
    if (!isPermittedScript) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-[#0e1015] p-6 text-center select-none text-zinc-300 font-mono">
                <div className="w-12 h-12 rounded-full bg-red-950/40 border border-red-500/30 flex items-center justify-center text-red-400 mb-4 font-semibold text-lg">
                    !
                </div>
                <h1 className="text-sm font-semibold tracking-wider text-zinc-200 uppercase mb-2">Access Restricted</h1>
                <p className="text-xs text-zinc-400 max-w-md mb-6 leading-relaxed">
                    You do not have access to this screenplay. Access to individual scripts requires an administrator role or an explicit
                    invite from the author.
                </p>
                <div className="flex items-center gap-3">
                    <a
                        href="/studio/script"
                        className="px-4 py-2 bg-[#1c1f2b] hover:bg-[#252a3a] border border-[#262933] hover:border-zinc-500 rounded text-xs text-zinc-200 transition-colors"
                    >
                        Return to Dashboard
                    </a>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen overflow-hidden bg-[#1a1c1f] script-editor-page">
            {/* Arc Studio Pure Minimalist Header */}
            <ScreenplayToolbar
                editor={editor}
                scriptTitle={scriptTitle}
                setScriptTitle={handleTitleChange}
                isSaving={isSaving}
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
                isAdmin={isAdmin}
                isReadOnly={isReadOnly}
                user={user}
                onOpenInviteModal={() => setIsInviteOpen(true)}
                pageTheme={pageTheme}
                onTogglePageTheme={handleTogglePageTheme}
                onOpenCommandPalette={() => setCommandPaletteOpen(true)}
                onOpenFindReplace={() => setFindReplaceOpen(true)}
                onInsertImageModal={() => setInsertImageOpen(true)}
                onExportPdf={handleExportPdf}
                onExportFdx={handleExportFdx}
                onExportFountain={handleExportFountain}
                onImportFile={handleImportFile}
            />

            <div className="flex flex-1 overflow-hidden relative">
                {/* Left Scenes Outline Navigator */}
                {!isFocusMode && layoutMode !== "beatboard" && layoutMode !== "outline" && (
                    <SceneNavigator
                        scenes={scenes}
                        characters={characters}
                        isOpen={isNavOpen}
                        setIsOpen={setIsNavOpen}
                        onSelectScene={handleSelectScene}
                        onAddScene={isReadOnly ? undefined : handleAddScene}
                        onDeleteScene={isReadOnly ? undefined : handleDeleteScene}
                        totalPages={totalPages}
                        scenePages={scenePages}
                    />
                )}

                {/* Center Main Stage */}
                {layoutMode === "outline" && !isFocusMode ? (
                    <main className="flex-1 overflow-hidden">
                        <OutlineView
                            scriptId={scriptId || undefined}
                            onInsertBeatToScript={handleInsertBeat}
                            onJumpToScene={(slugline) => {
                                const matched = scenes.find((s) => s.slugline.toLowerCase() === slugline.toLowerCase());
                                setLayoutMode("script");
                                if (matched) setTimeout(() => handleSelectScene(matched.pos), 50);
                            }}
                            sceneHeadings={scenes.map((s) => s.slugline)}
                        />
                    </main>
                ) : layoutMode === "beatboard" && !isFocusMode ? (
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
                        <div className="flex-1 flex flex-col relative overflow-hidden bg-[#1a1c1f] border-r border-[#33353a]">
                            <main
                                onContextMenu={(e) => {
                                    e.preventDefault();
                                    setContextMenuPos({ x: e.clientX, y: e.clientY });
                                    setIsContextMenuOpen(true);
                                }}
                                className="flex-1 overflow-y-auto relative"
                            >
                                {isPageView ? (
                                    <div className="flex flex-col items-center pt-8 pb-[65vh] px-4 space-y-8 select-text">
                                        <div className={`screenplay-page-sheet ${pageTheme === "light" ? "screenplay-page-light" : ""}`}>
                                            <TitlePage
                                                data={titlePageData}
                                                onChange={handleUpdateTitlePage}
                                                isContinuous={false}
                                                theme={pageTheme}
                                                readOnly={isReadOnly}
                                            />
                                        </div>
                                        <div
                                            className={`screenplay-page-sheet relative ${pageTheme === "light" ? "screenplay-page-light" : ""}`}
                                            style={{
                                                minHeight: `calc(${Math.max(1, totalPages)} * 297mm + ${Math.max(0, totalPages - 1)} * 2.5in)`
                                            }}
                                            onMouseMove={handleEditorMouseMove}
                                            onDragOver={handleDragOver}
                                            onDrop={handleDrop}
                                            onClick={(e) => {
                                                // focus editor at end if clicking empty bottom paper space
                                                if (e.target === e.currentTarget && editor) {
                                                    editor.commands.focus("end");
                                                }
                                            }}
                                        >
                                            {/* Left Gutter Handle */}
                                            <ArcGutterHandle
                                                editor={editor}
                                                nodeType={gutterPos.nodeType}
                                                nodePos={gutterPos.nodePos}
                                                top={gutterPos.top}
                                                left={gutterPos.left}
                                                visible={gutterPos.visible && !isReadOnly}
                                                onOpenMenu={({ x, y }) => {
                                                    setContextMenuPos({ x, y });
                                                    setIsContextMenuOpen(true);
                                                }}
                                                onMoveBlock={handleMoveBlock}
                                            />

                                            {/* Drag Drop Insertion Indicator */}
                                            {dropIndicator && (
                                                <div
                                                    className="screenplay-drop-indicator absolute"
                                                    style={{
                                                        top: `${dropIndicator.top}px`,
                                                        left: `${dropIndicator.left}px`,
                                                        width: `${dropIndicator.width}px`
                                                    }}
                                                />
                                            )}

                                            {/* Interactive Visual Margin Ruler */}
                                            {isMarginModeOpen && activeNodeInfo && (
                                                <ArcMarginRuler
                                                    isOpen={isMarginModeOpen}
                                                    onClose={() => setIsMarginModeOpen(false)}
                                                    elementType={activeNodeInfo.nodeType}
                                                    margins={getElementMargins(activeNodeInfo.nodeType)}
                                                    onUpdateMargins={(newMargins) => {
                                                        setElementFormatting((prev) => ({
                                                            ...prev,
                                                            [activeNodeInfo.nodeType]: newMargins
                                                        }));
                                                    }}
                                                />
                                            )}

                                            <EditorContent editor={editor} />
                                        </div>
                                    </div>
                                ) : (
                                    <div
                                        className={`screenplay-continuous-mode relative ${pageTheme === "light" ? "screenplay-page-light" : ""}`}
                                        onMouseMove={handleEditorMouseMove}
                                        onDragOver={handleDragOver}
                                        onDrop={handleDrop}
                                    >
                                        <TitlePage
                                            data={titlePageData}
                                            onChange={handleUpdateTitlePage}
                                            isContinuous={true}
                                            theme={pageTheme}
                                            readOnly={isReadOnly}
                                        />
                                        <div
                                            className={`relative my-8 border-t flex items-center justify-center ${
                                                pageTheme === "light" ? "border-zinc-300" : "border-[#33353a]"
                                            }`}
                                        >
                                            <span
                                                className={`px-3 text-[10px] font-mono uppercase tracking-widest ${
                                                    pageTheme === "light" ? "bg-white text-zinc-500" : "bg-[#1a1c1f] text-zinc-500"
                                                }`}
                                            >
                                                Screenplay Start - Page 1
                                            </span>
                                        </div>

                                        {/* Left Gutter Handle in continuous view */}
                                        <ArcGutterHandle
                                            editor={editor}
                                            nodeType={gutterPos.nodeType}
                                            nodePos={gutterPos.nodePos}
                                            top={gutterPos.top}
                                            left={gutterPos.left}
                                            visible={gutterPos.visible && !isReadOnly}
                                            onOpenMenu={({ x, y }) => {
                                                setContextMenuPos({ x, y });
                                                setIsContextMenuOpen(true);
                                            }}
                                            onMoveBlock={handleMoveBlock}
                                        />

                                        {/* Drag Drop Insertion Indicator */}
                                        {dropIndicator && (
                                            <div
                                                className="screenplay-drop-indicator absolute"
                                                style={{
                                                    top: `${dropIndicator.top}px`,
                                                    left: `${dropIndicator.left}px`,
                                                    width: `${dropIndicator.width}px`
                                                }}
                                            />
                                        )}

                                        {/* Interactive Visual Margin Ruler */}
                                        {isMarginModeOpen && activeNodeInfo && (
                                            <ArcMarginRuler
                                                isOpen={isMarginModeOpen}
                                                onClose={() => setIsMarginModeOpen(false)}
                                                elementType={activeNodeInfo.nodeType}
                                                margins={getElementMargins(activeNodeInfo.nodeType)}
                                                onUpdateMargins={(newMargins) => {
                                                    setElementFormatting((prev) => ({
                                                        ...prev,
                                                        [activeNodeInfo.nodeType]: newMargins
                                                    }));
                                                }}
                                            />
                                        )}

                                        <EditorContent editor={editor} />
                                    </div>
                                )}
                            </main>

                            {/* Floating Arc Studio Format Dock (Centered to screenplay page canvas) */}
                            {!isReadOnly && !isFocusMode && (
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
                            )}

                            {/* Right-click & Gutter Context Menu */}
                            {!isReadOnly && (
                                <ArcFormattingMenu
                                    editor={editor}
                                    isOpen={isContextMenuOpen}
                                    onClose={() => setIsContextMenuOpen(false)}
                                    onOpenBeatBoard={() => setLayoutMode("beatboard")}
                                    onOpenComments={() => setIsStashOpen(true)}
                                    onOpenMargins={() => setIsMarginModeOpen(true)}
                                    position={contextMenuPos}
                                    align="context"
                                    currentFormatting={
                                        activeNodeInfo
                                            ? {
                                                  alignment: elementFormatting[activeNodeInfo.nodeType]?.alignment,
                                                  spacingBefore: elementFormatting[activeNodeInfo.nodeType]?.spacingBefore
                                              }
                                            : undefined
                                    }
                                    onUpdateFormatting={(fmt) => {
                                        if (!activeNodeInfo) return;
                                        setElementFormatting((prev) => {
                                            const curr = prev[activeNodeInfo.nodeType] || prev.dialogue || defaultMargin;
                                            const updated: MarginSettings = {
                                                ...curr,
                                                ...(fmt.alignment ? { alignment: fmt.alignment } : {}),
                                                ...(fmt.spacingBefore !== undefined ? { spacingBefore: fmt.spacingBefore } : {})
                                            };
                                            return {
                                                ...prev,
                                                [activeNodeInfo.nodeType]: updated
                                            };
                                        });
                                    }}
                                />
                            )}
                        </div>

                        {/* Right half: Arc Studio Plot Board */}
                        <aside className="w-1/2 overflow-hidden bg-[#16171a]">
                            <BeatBoard
                                scriptId={scriptId || undefined}
                                onInsertBeatToScript={handleInsertBeat}
                                sceneHeadings={scenes.map((s) => s.slugline)}
                            />
                        </aside>
                    </div>
                ) : (
                    /* Script Full Mode */
                    <div className="flex-1 flex flex-col relative overflow-hidden bg-[#1a1c1f]">
                        <main
                            onContextMenu={(e) => {
                                e.preventDefault();
                                setContextMenuPos({ x: e.clientX, y: e.clientY });
                                setIsContextMenuOpen(true);
                            }}
                            className="flex-1 overflow-y-auto relative"
                        >
                            {activePreviewId && (
                                <div className="no-print sticky top-0 z-20 flex items-center justify-between px-4 py-2 bg-[#16171a] border-b border-[#33353a] text-zinc-300 text-xs backdrop-blur-md font-mono">
                                    <span>Viewing historical snapshot preview (Read-only)</span>
                                    <button
                                        onClick={() => handlePreviewVersion(null)}
                                        className="px-2.5 py-0.5 bg-[#27292c] hover:bg-[#25262a] border border-[#33353a] text-zinc-200 rounded text-[11px]"
                                    >
                                        Exit Preview
                                    </button>
                                </div>
                            )}

                            {isPageView ? (
                                <div className="flex flex-col items-center pt-8 pb-[65vh] px-4 space-y-8 select-text">
                                    <div className={`screenplay-page-sheet ${pageTheme === "light" ? "screenplay-page-light" : ""}`}>
                                        <TitlePage
                                            data={titlePageData}
                                            onChange={handleUpdateTitlePage}
                                            isContinuous={false}
                                            theme={pageTheme}
                                            readOnly={isReadOnly}
                                        />
                                    </div>
                                    <div
                                        className={`screenplay-page-sheet relative ${pageTheme === "light" ? "screenplay-page-light" : ""}`}
                                        style={{
                                            minHeight: `calc(${Math.max(1, totalPages)} * 297mm + ${Math.max(0, totalPages - 1)} * 2.5in)`
                                        }}
                                        onMouseMove={handleEditorMouseMove}
                                        onDragOver={handleDragOver}
                                        onDrop={handleDrop}
                                        onClick={(e) => {
                                            // focus editor at end if clicking empty bottom paper space
                                            if (e.target === e.currentTarget && editor) {
                                                editor.commands.focus("end");
                                            }
                                        }}
                                    >
                                        {/* Left Gutter Handle */}
                                        <ArcGutterHandle
                                            editor={editor}
                                            nodeType={gutterPos.nodeType}
                                            nodePos={gutterPos.nodePos}
                                            top={gutterPos.top}
                                            left={gutterPos.left}
                                            visible={gutterPos.visible && !isReadOnly}
                                            onOpenMenu={({ x, y }) => {
                                                setContextMenuPos({ x, y });
                                                setIsContextMenuOpen(true);
                                            }}
                                            onMoveBlock={handleMoveBlock}
                                        />

                                        {/* Drag Drop Insertion Indicator */}
                                        {dropIndicator && (
                                            <div
                                                className="screenplay-drop-indicator absolute"
                                                style={{
                                                    top: `${dropIndicator.top}px`,
                                                    left: `${dropIndicator.left}px`,
                                                    width: `${dropIndicator.width}px`
                                                }}
                                            />
                                        )}

                                        {/* Interactive Visual Margin Ruler */}
                                        {isMarginModeOpen && activeNodeInfo && (
                                            <ArcMarginRuler
                                                isOpen={isMarginModeOpen}
                                                onClose={() => setIsMarginModeOpen(false)}
                                                elementType={activeNodeInfo.nodeType}
                                                margins={getElementMargins(activeNodeInfo.nodeType)}
                                                onUpdateMargins={(newMargins) => {
                                                    setElementFormatting((prev) => ({
                                                        ...prev,
                                                        [activeNodeInfo.nodeType]: newMargins
                                                    }));
                                                }}
                                            />
                                        )}

                                        <EditorContent editor={editor} />
                                    </div>
                                </div>
                            ) : (
                                <div
                                    className={`screenplay-continuous-mode relative ${pageTheme === "light" ? "screenplay-page-light" : ""}`}
                                    onMouseMove={handleEditorMouseMove}
                                    onDragOver={handleDragOver}
                                    onDrop={handleDrop}
                                >
                                    <TitlePage
                                        data={titlePageData}
                                        onChange={handleUpdateTitlePage}
                                        isContinuous={true}
                                        theme={pageTheme}
                                        readOnly={isReadOnly}
                                    />
                                    <div
                                        className={`relative my-8 border-t flex items-center justify-center ${
                                            pageTheme === "light" ? "border-zinc-300" : "border-[#33353a]"
                                        }`}
                                    >
                                        <span
                                            className={`px-3 text-[10px] font-mono uppercase tracking-widest ${
                                                pageTheme === "light" ? "bg-white text-zinc-500" : "bg-[#1a1c1f] text-zinc-500"
                                            }`}
                                        >
                                            Screenplay Start - Page 1
                                        </span>
                                    </div>

                                    {/* Left Gutter Handle in continuous view */}
                                    <ArcGutterHandle
                                        editor={editor}
                                        nodeType={gutterPos.nodeType}
                                        nodePos={gutterPos.nodePos}
                                        top={gutterPos.top}
                                        left={gutterPos.left}
                                        visible={gutterPos.visible && !isReadOnly}
                                        onOpenMenu={({ x, y }) => {
                                            setContextMenuPos({ x, y });
                                            setIsContextMenuOpen(true);
                                        }}
                                        onMoveBlock={handleMoveBlock}
                                    />

                                    {/* Drag Drop Insertion Indicator */}
                                    {dropIndicator && (
                                        <div
                                            className="screenplay-drop-indicator absolute"
                                            style={{
                                                top: `${dropIndicator.top}px`,
                                                left: `${dropIndicator.left}px`,
                                                width: `${dropIndicator.width}px`
                                            }}
                                        />
                                    )}

                                    {/* Interactive Visual Margin Ruler */}
                                    {isMarginModeOpen && activeNodeInfo && (
                                        <ArcMarginRuler
                                            isOpen={isMarginModeOpen}
                                            onClose={() => setIsMarginModeOpen(false)}
                                            elementType={activeNodeInfo.nodeType}
                                            margins={getElementMargins(activeNodeInfo.nodeType)}
                                            onUpdateMargins={(newMargins) => {
                                                setElementFormatting((prev) => ({
                                                    ...prev,
                                                    [activeNodeInfo.nodeType]: newMargins
                                                }));
                                            }}
                                        />
                                    )}

                                    <EditorContent editor={editor} />
                                </div>
                            )}
                        </main>

                        {/* Floating Arc Studio Format Dock (Centered to screenplay page canvas) */}
                        {!isReadOnly && !isFocusMode && (
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
                        )}

                        {/* Right-click & Gutter Context Menu */}
                        {!isReadOnly && (
                            <ArcFormattingMenu
                                editor={editor}
                                isOpen={isContextMenuOpen}
                                onClose={() => setIsContextMenuOpen(false)}
                                onOpenBeatBoard={() => setLayoutMode("beatboard")}
                                onOpenComments={() => setIsStashOpen(true)}
                                onOpenMargins={() => setIsMarginModeOpen(true)}
                                position={contextMenuPos}
                                align="context"
                                currentFormatting={
                                    activeNodeInfo
                                        ? {
                                              alignment: elementFormatting[activeNodeInfo.nodeType]?.alignment,
                                              spacingBefore: elementFormatting[activeNodeInfo.nodeType]?.spacingBefore
                                          }
                                        : undefined
                                }
                                onUpdateFormatting={(fmt) => {
                                    if (!activeNodeInfo) return;
                                    setElementFormatting((prev) => {
                                        const curr = prev[activeNodeInfo.nodeType] || prev.dialogue || defaultMargin;
                                        const updated: MarginSettings = {
                                            ...curr,
                                            ...(fmt.alignment ? { alignment: fmt.alignment } : {}),
                                            ...(fmt.spacingBefore !== undefined ? { spacingBefore: fmt.spacingBefore } : {})
                                        };
                                        return {
                                            ...prev,
                                            [activeNodeInfo.nodeType]: updated
                                        };
                                    });
                                }}
                            />
                        )}
                    </div>
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

                {/* Invite Collaborator Modal */}
                <InviteUserModal
                    isOpen={isInviteOpen}
                    onClose={() => setIsInviteOpen(false)}
                    scriptId={scriptId || undefined}
                    scriptTitle={titlePageData.title || scriptTitle || "Untitled Screenplay"}
                />

                {/* Find & Replace Drawer */}
                {layoutMode !== "beatboard" && layoutMode !== "outline" && (
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
                    onSetElement={(t) => {
                        if (!isReadOnly) editor?.chain().focus().setNode(t).run();
                    }}
                    onInsertPageBreak={() => {
                        if (!isReadOnly) editor?.chain().focus().setPageBreak().run();
                    }}
                    onJumpToScene={handleSelectScene}
                    scenes={scenes}
                    onExportPdf={handleExportPdf}
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
                {!isFocusMode && layoutMode !== "beatboard" && layoutMode !== "outline" && (
                    <div className="no-print fixed bottom-6 right-6 z-30 flex items-center gap-2 px-3 py-1.5 bg-[#16171a]/95 hover:bg-[#212326] border border-[#33353a] rounded-full text-xs font-mono text-zinc-400 shadow-xl backdrop-blur-md select-none transition-colors">
                        <span>{wordCount} words</span>
                        <span className="text-zinc-600">|</span>
                        <span className="text-zinc-200 font-semibold">
                            Page {currentPage} / {totalPages}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function ScreenplayEditorPage() {
    return (
        <Suspense
            fallback={
                <div className="flex items-center justify-center min-h-screen bg-[#1a1c1f] text-zinc-500 font-mono text-xs select-none">
                    Loading Screenplay Editor...
                </div>
            }
        >
            <AccessGuard>
                <ScreenplayEditorContent />
            </AccessGuard>
        </Suspense>
    );
}
