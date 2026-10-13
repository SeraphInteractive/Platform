import type { ScriptDocument, Shelf } from "@/types/script";

const STORAGE_KEY = "stairway_screenplay_documents_v2";
const SHELVES_STORAGE_KEY = "stairway_screenplay_shelves_v1";

const DUMMY_SCRIPT_IDS = new Set(["project-stairway-ep1", "project-stairway-exulans", "project-stairway-rebellions"]);
const DUMMY_SHELF_IDS = new Set(["shelf-main-series", "shelf-features", "shelf-shorts"]);

const INITIAL_SHELVES: Shelf[] = [];
const INITIAL_SCRIPTS: ScriptDocument[] = [];

// shelves storage functions
export function getStoredShelves(): Shelf[] {
    if (typeof window === "undefined") return INITIAL_SHELVES;

    try {
        const raw = localStorage.getItem(SHELVES_STORAGE_KEY);
        if (!raw) {
            localStorage.setItem(SHELVES_STORAGE_KEY, JSON.stringify(INITIAL_SHELVES));
            return INITIAL_SHELVES;
        }
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            // strip legacy mock shelves
            const filtered = parsed.filter((s) => s && !DUMMY_SHELF_IDS.has(s.id));
            if (filtered.length !== parsed.length) {
                saveStoredShelves(filtered);
            }
            if (filtered.length === 0) return [];

            // guard against clock collisions when batch creating
            const seenIds = new Set<string>();
            let changed = false;
            const repaired = filtered.map((s, idx) => {
                if (!s.id || seenIds.has(s.id)) {
                    changed = true;
                    const freshId = `shelf-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`;
                    seenIds.add(freshId);
                    return { ...s, id: freshId };
                }
                seenIds.add(s.id);
                return s;
            });
            if (changed) {
                saveStoredShelves(repaired);
            }
            return repaired;
        }
        return INITIAL_SHELVES;
    } catch {
        return INITIAL_SHELVES;
    }
}

export function saveStoredShelves(shelves: Shelf[]): void {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem(SHELVES_STORAGE_KEY, JSON.stringify(shelves));
    } catch {
        // ignore quota errors silently in storage fallback
    }
}

export function createShelf(name: string): Shelf {
    const shelves = getStoredShelves();
    const newShelf: Shelf = {
        id: `shelf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: name.trim() || "Untitled Shelf",
        createdAt: Date.now()
    };
    const updated = [...shelves, newShelf];
    saveStoredShelves(updated);
    return newShelf;
}

export function renameShelf(id: string, name: string): void {
    const shelves = getStoredShelves();
    const updated = shelves.map((s) => (s.id === id ? { ...s, name: name.trim() } : s));
    saveStoredShelves(updated);
}

export function deleteShelf(id: string): void {
    const shelves = getStoredShelves();
    const updatedShelves = shelves.filter((s) => s.id !== id);
    saveStoredShelves(updatedShelves);

    // unassign shelf from scripts
    const scripts = getStoredScripts();
    const updatedScripts = scripts.map((s) => (s.shelfId === id ? { ...s, shelfId: null } : s));
    saveStoredScripts(updatedScripts);
}

export function moveScriptToShelf(scriptId: string, shelfId: string | null): void {
    const scripts = getStoredScripts();
    const updated = scripts.map((s) => (s.id === scriptId ? { ...s, shelfId, lastModified: Date.now() } : s));
    saveStoredScripts(updated);
}

export function moveScriptBefore(draggedId: string, targetId: string, targetShelfId: string | null): void {
    const scripts = getStoredScripts();
    const dragged = scripts.find((s) => s.id === draggedId);
    if (!dragged) return;

    const updatedDragged = { ...dragged, shelfId: targetShelfId, lastModified: Date.now() };
    const withoutDragged = scripts.filter((s) => s.id !== draggedId);
    const targetIdx = withoutDragged.findIndex((s) => s.id === targetId);

    if (targetIdx !== -1) {
        withoutDragged.splice(targetIdx, 0, updatedDragged);
    } else {
        withoutDragged.push(updatedDragged);
    }

    saveStoredScripts(withoutDragged);
}

export function moveScriptAfter(draggedId: string, targetId: string, targetShelfId: string | null): void {
    const scripts = getStoredScripts();
    const dragged = scripts.find((s) => s.id === draggedId);
    if (!dragged) return;

    const updatedDragged = { ...dragged, shelfId: targetShelfId, lastModified: Date.now() };
    const withoutDragged = scripts.filter((s) => s.id !== draggedId);
    const targetIdx = withoutDragged.findIndex((s) => s.id === targetId);

    if (targetIdx !== -1) {
        withoutDragged.splice(targetIdx + 1, 0, updatedDragged);
    } else {
        withoutDragged.push(updatedDragged);
    }

    saveStoredScripts(withoutDragged);
}

// script storage functions
export function getStoredScripts(): ScriptDocument[] {
    if (typeof window === "undefined") return INITIAL_SCRIPTS;

    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_SCRIPTS));
            return INITIAL_SCRIPTS;
        }
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            // purge legacy mock/simulated scripts and prune their doc keys
            let changed = false;
            const filtered = parsed
                .filter((s) => {
                    if (s && DUMMY_SCRIPT_IDS.has(s.id)) {
                        try {
                            localStorage.removeItem(`stairway_script_doc_${s.id}`);
                        } catch {}
                        return false;
                    }
                    return true;
                })
                .map((s) => {
                    if (s && s.author === "Creative Division") {
                        changed = true;
                        return { ...s, author: "" };
                    }
                    return s;
                });
            if (changed || filtered.length !== parsed.length) {
                saveStoredScripts(filtered);
            }
            return filtered;
        }
        return INITIAL_SCRIPTS;
    } catch {
        return INITIAL_SCRIPTS;
    }
}

export function saveStoredScripts(scripts: ScriptDocument[]): void {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(scripts));
    } catch {
        // ignore quota errors silently in storage fallback
    }
}

export function getScriptById(id: string): ScriptDocument | undefined {
    if (DUMMY_SCRIPT_IDS.has(id)) return undefined;
    const scripts = getStoredScripts();
    return scripts.find((s) => s.id === id);
}

export function createNewScript(title = "Untitled Screenplay", shelfId?: string | null): ScriptDocument {
    const scripts = getStoredScripts();
    const newScript: ScriptDocument = {
        id: `script-${Date.now()}`,
        title,
        author: "",
        lastModified: Date.now(),
        shelfId: shelfId || null,
        category: "mine"
    };

    const updated = [newScript, ...scripts];
    saveStoredScripts(updated);
    return newScript;
}

export function updateScript(id: string, updates: Partial<ScriptDocument>): void {
    const scripts = getStoredScripts();
    const updated = scripts.map((s) => (s.id === id ? { ...s, ...updates, lastModified: Date.now() } : s));
    saveStoredScripts(updated);
}

export function duplicateScript(id: string): ScriptDocument | null {
    const scripts = getStoredScripts();
    const existing = scripts.find((s) => s.id === id);
    if (!existing) return null;

    // copy content from document storage if available
    const existingContentKey = `stairway_script_doc_${id}`;
    const newId = `script-${Date.now()}`;
    if (typeof window !== "undefined") {
        try {
            const savedDoc = localStorage.getItem(existingContentKey);
            if (savedDoc) {
                localStorage.setItem(`stairway_script_doc_${newId}`, savedDoc);
            }
        } catch {}
    }

    const duplicated: ScriptDocument = {
        ...existing,
        id: newId,
        title: `${existing.title} (Copy)`,
        lastModified: Date.now(),
        category: "mine"
    };

    const updated = [duplicated, ...scripts];
    saveStoredScripts(updated);
    return duplicated;
}

export function deleteScript(id: string): void {
    const scripts = getStoredScripts();
    const updated = scripts.filter((s) => s.id !== id);
    saveStoredScripts(updated);

    if (typeof window !== "undefined") {
        try {
            localStorage.removeItem(`stairway_script_doc_${id}`);
        } catch {}
    }
}

export function toggleArchiveScript(id: string): void {
    const scripts = getStoredScripts();
    const updated = scripts.map((s) => {
        if (s.id !== id) return s;
        return {
            ...s,
            category: (s.category === "archived" ? "mine" : "archived") as ScriptDocument["category"],
            lastModified: Date.now()
        };
    });
    saveStoredScripts(updated);
}

const PAGE_THEME_STORAGE_KEY = "stairway_screenplay_page_theme";

export type PageTheme = "dark" | "light";

export function getStoredPageTheme(): PageTheme {
    if (typeof window === "undefined") return "dark";
    try {
        const val = localStorage.getItem(PAGE_THEME_STORAGE_KEY);
        return val === "light" ? "light" : "dark";
    } catch {
        return "dark";
    }
}

export function setStoredPageTheme(theme: PageTheme): void {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem(PAGE_THEME_STORAGE_KEY, theme);
    } catch {}
}
