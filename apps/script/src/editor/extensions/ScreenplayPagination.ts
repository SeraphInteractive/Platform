import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";

// A4 international standard line budget (58 lines at 6 lines per inch)
export const SCREENPLAY_PAGE_BUDGET_LINES = 58;

export interface PageBoundary {
    pos: number;
    pageNumber: number;
    isManual: boolean;
}

export interface PaginationStorage {
    totalPages: number;
    currentPage: number;
    scenePages: Record<number, number>;
    pageBoundaries: PageBoundary[];
}

export const ScreenplayPaginationPluginKey = new PluginKey("screenplayPagination");

// estimates physical line consumption of a screenplay block
function estimateBlockLines(node: PMNode): number {
    const type = node.type.name;
    const text = node.textContent.trim();

    if (type === "pageBreak") {
        return SCREENPLAY_PAGE_BUDGET_LINES; // forces immediate page break
    }

    if (type === "scriptImage") {
        return 12; // approximate height equivalent of storyboard still
    }

    if (type === "sceneHeading") {
        // 1 line text + top margin (1.5em) + bottom margin (0.5em)
        return 3;
    }

    if (type === "action") {
        // standard 60 char width per action line + margin
        const lines = Math.max(1, Math.ceil(text.length / 60));
        return lines + 1;
    }

    if (type === "character") {
        // character cue + top margin
        return 2;
    }

    if (type === "parenthetical") {
        return 1;
    }

    if (type === "dialogue") {
        // dialogue column is ~35 characters wide
        const lines = Math.max(1, Math.ceil(text.length / 35));
        return lines + 1;
    }

    if (type === "transition") {
        return 3;
    }

    return 2;
}

export const ScreenplayPagination = Extension.create<Record<string, never>, PaginationStorage>({
    name: "screenplayPagination",

    addStorage() {
        return {
            totalPages: 1,
            currentPage: 1,
            scenePages: {},
            pageBoundaries: []
        };
    },

    addProseMirrorPlugins() {
        return [
            new Plugin({
                key: ScreenplayPaginationPluginKey,
                state: {
                    init: (_, state) => {
                        return computePagination(state.doc, this.storage);
                    },
                    apply: (tr, oldPluginState, _, newState) => {
                        if (tr.docChanged) {
                            return computePagination(newState.doc, this.storage);
                        }
                        return oldPluginState;
                    }
                },
                props: {
                    decorations(state) {
                        const pluginState = ScreenplayPaginationPluginKey.getState(state);
                        return pluginState?.decorations || DecorationSet.empty;
                    }
                }
            })
        ];
    },

    onSelectionUpdate() {
        const { selection } = this.editor.state;
        const cursorPos = selection.from;
        const boundaries = this.storage.pageBoundaries;

        let activePage = 1;
        for (const b of boundaries) {
            if (cursorPos >= b.pos) {
                activePage = b.pageNumber;
            } else {
                break;
            }
        }

        this.storage.currentPage = activePage;
    }
});

// computes page boundaries, telemetry, and automatic page break widget decorations
function computePagination(doc: PMNode, storage?: PaginationStorage) {
    const decorations: Decoration[] = [];
    const boundaries: PageBoundary[] = [];
    const scenePages: Record<number, number> = {};

    let currentPage = 1;
    let currentLinesOnPage = 0;

    // page 1 starts at document beginning
    boundaries.push({ pos: 0, pageNumber: 1, isManual: false });

    doc.forEach((childNode, offset) => {
        const nodeLines = estimateBlockLines(childNode);
        const nodeType = childNode.type.name;

        // manual page break node explicitly advances page
        if (nodeType === "pageBreak") {
            currentPage += 1;
            currentLinesOnPage = 0;
            boundaries.push({ pos: offset, pageNumber: currentPage, isManual: true });
            return;
        }

        // record scene page number for outline sync
        if (nodeType === "sceneHeading") {
            scenePages[offset] = currentPage;
        }

        // screenplay orphan prevention:
        // push scene heading or character to next page if too close to bottom margin
        const isOrphanRisk =
            (nodeType === "sceneHeading" && currentLinesOnPage > SCREENPLAY_PAGE_BUDGET_LINES - 4) ||
            (nodeType === "character" && currentLinesOnPage > SCREENPLAY_PAGE_BUDGET_LINES - 3);

        if (currentLinesOnPage + nodeLines > SCREENPLAY_PAGE_BUDGET_LINES || isOrphanRisk) {
            // create automatic page break at this block boundary
            currentPage += 1;
            currentLinesOnPage = nodeLines;

            boundaries.push({ pos: offset, pageNumber: currentPage, isManual: false });
            if (nodeType === "sceneHeading") {
                scenePages[offset] = currentPage;
            }

            // construct visual widget decoration
            const targetPageNum = currentPage;
            const widget = Decoration.widget(
                offset,
                () => {
                    const isContinuous = typeof document !== "undefined" && !!document.querySelector(".screenplay-continuous-mode");

                    const container = document.createElement("div");
                    container.className = "screenplay-auto-page-break select-none no-print";
                    container.setAttribute("data-auto-page-break", "true");
                    container.setAttribute("data-page-number", String(targetPageNum));

                    if (isContinuous) {
                        // arc studio continuous view: sleek horizontal divider line
                        container.innerHTML = `
              <div class="relative my-8 select-none">
                <div class="relative flex items-center justify-between border-t border-dashed border-[#26282d] pt-3">
                  <div class="flex items-center gap-2">
                    <span class="text-[10px] font-mono uppercase tracking-widest text-zinc-500 bg-[#16171a] px-2">
                      Page ${targetPageNum}
                    </span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="font-mono text-xs text-zinc-400 font-semibold bg-[#16171a] px-2">
                      ${targetPageNum}.
                    </span>
                  </div>
                </div>
              </div>
            `;
                    } else {
                        // physical page view: 1.0in bottom margin buffer, 48px desk gap, 0.5in top clearance
                        container.innerHTML = `
              <div class="relative select-none -ml-[1.5in] -mr-[1.0in] my-0">
                <div class="h-[1.0in] bg-transparent"></div>
                <div class="h-12 bg-[#141618] flex items-center justify-center relative border-y border-[#26282d] shadow-inner">
                  <div class="flex items-center gap-2 text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                    <span>End of Page ${targetPageNum - 1}</span>
                    <span class="text-zinc-600">-</span>
                    <span>Page ${targetPageNum}</span>
                  </div>
                </div>
                <div class="pl-[1.5in] pr-[1.0in] pt-[0.5in] pb-[0.5in] flex justify-end items-center font-mono text-xs text-zinc-400">
                  <span class="font-semibold text-[12pt]">${targetPageNum}.</span>
                </div>
              </div>
            `;
                    }

                    return container;
                },
                { side: -1 }
            );

            decorations.push(widget);
        } else {
            currentLinesOnPage += nodeLines;
        }
    });

    // sync storage telemetry
    if (storage) {
        storage.totalPages = Math.max(1, currentPage);
        storage.scenePages = scenePages;
        storage.pageBoundaries = boundaries;
    }

    return {
        decorations: DecorationSet.create(doc, decorations),
        totalPages: Math.max(1, currentPage),
        scenePages,
        boundaries
    };
}
