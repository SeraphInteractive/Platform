"use client";

import React from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Trash2 } from "lucide-react";
import { Selection } from "@tiptap/pm/state";

export function removePageBreak(editor: NodeViewProps["editor"], getPos: NodeViewProps["getPos"]) {
    if (!editor || typeof getPos !== "function") return;
    const pos = getPos();
    if (typeof pos !== "number") return;

    const { state, view } = editor;
    const { doc } = state;
    const node = doc.nodeAt(pos);
    if (!node) return;

    const tr = state.tr;
    tr.delete(pos, pos + node.nodeSize);

    // place cursor at nearest valid position
    const targetPos = Math.min(pos, tr.doc.content.size);
    try {
        const resolved = tr.doc.resolve(targetPos);
        tr.setSelection(Selection.near(resolved));
    } catch {}

    view.dispatch(tr);
    view.focus();
}

export function PageBreakView({ node, editor, getPos, selected }: NodeViewProps) {
    const pageNumber = node.attrs.pageNumber || 2;
    const isContinuous = typeof document !== "undefined" && !!document.querySelector(".screenplay-continuous-mode");

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        removePageBreak(editor, getPos);
    };

    if (isContinuous) {
        // arc studio continuous view: subtle divider line with right-aligned page marker
        return (
            <NodeViewWrapper
                as="div"
                className={`screenplay-page-break relative my-10 select-none group transition-all ${
                    selected ? "ring-1 ring-blue-500/80" : ""
                }`}
                data-page-break="true"
                data-page-number={pageNumber}
            >
                <div className="relative flex items-center justify-between border-t border-dashed border-[#2e3347] pt-3">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500 bg-[#0e1015] px-2">
                            Page Break - Page {pageNumber}
                        </span>
                    </div>

                    <div className="flex items-center gap-3">
                        <span className="font-mono text-xs text-slate-400 font-semibold bg-[#0e1015] px-2">{pageNumber}.</span>

                        <button
                            onClick={handleDelete}
                            className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 hover:bg-[#1a1d26] rounded transition-all"
                            title="Remove Page Break"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            </NodeViewWrapper>
        );
    }

    // standard page view: physical desk gap between sheets with drop shadows and header
    return (
        <NodeViewWrapper
            as="div"
            className={`screenplay-page-break relative select-none group -ml-[1.5in] -mr-[1.0in] my-0 transition-all ${
                selected ? "ring-1 ring-blue-500/80" : ""
            }`}
            data-page-break="true"
            data-page-number={pageNumber}
        >
            {/* bottom margin of previous sheet (1.0in clearance) */}
            <div className="h-[1.0in] bg-transparent" />

            {/* desk gap between paper sheets (48px) */}
            <div className="h-12 bg-[#141618] flex items-center justify-center relative border-y border-[#26282d] shadow-inner">
                <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                    <span>End of Page {pageNumber - 1}</span>
                    <span className="text-zinc-600">-</span>
                    <span>Page {pageNumber}</span>
                </div>

                <button
                    onClick={handleDelete}
                    className="opacity-0 group-hover:opacity-100 absolute right-6 p-1 text-zinc-500 hover:text-red-400 hover:bg-[#1a1d26] rounded transition-all"
                    title="Remove Page Break"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* top margin for next sheet: page number at 0.5in clearance, then 0.5in to text */}
            <div className="pl-[1.5in] pr-[1.0in] pt-[0.5in] pb-[0.5in] flex justify-end items-center font-mono text-xs text-zinc-400">
                <span className="font-semibold text-[12pt]">{pageNumber}.</span>
            </div>
        </NodeViewWrapper>
    );
}

export interface PageBreakOptions {
    HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        pageBreak: {
            setPageBreak: () => ReturnType;
        };
    }
}

export const PageBreak = Node.create<PageBreakOptions>({
    name: "pageBreak",
    group: "block",
    atom: true,
    selectable: true,
    draggable: false,
    isolating: true,

    addNodeView() {
        return ReactNodeViewRenderer(PageBreakView);
    },

    addAttributes() {
        return {
            pageNumber: {
                default: 2,
                parseHTML: (element) => {
                    const num = element.getAttribute("data-page-number");
                    return num ? parseInt(num, 10) : 2;
                },
                renderHTML: (attributes) => ({
                    "data-page-number": attributes.pageNumber
                })
            },
            manual: {
                default: true,
                parseHTML: (element) => element.getAttribute("data-manual") !== "false",
                renderHTML: (attributes) => ({
                    "data-manual": attributes.manual ? "true" : "false"
                })
            }
        };
    },

    parseHTML() {
        return [
            {
                tag: "div[data-page-break]",
                getAttrs: (dom) => {
                    if (typeof dom === "string") return false;
                    const element = dom as HTMLElement;
                    const pageNum = parseInt(element.getAttribute("data-page-number") || "2", 10);
                    return {
                        pageNumber: isNaN(pageNum) ? 2 : pageNum,
                        manual: element.getAttribute("data-manual") !== "false"
                    };
                }
            }
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return [
            "div",
            mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
                "data-page-break": "true",
                class: "screenplay-page-break"
            })
        ];
    },

    addCommands() {
        return {
            setPageBreak:
                () =>
                ({ chain, state }) => {
                    const { selection } = state;
                    const currentParent = selection.$from.parent;
                    const isEmpty = currentParent.textContent.trim().length === 0;

                    // if currently on an empty line, replace it with page break; otherwise split
                    if (isEmpty) {
                        return chain().insertContent({ type: this.name }).insertContent({ type: "action", content: [] }).run();
                    }

                    return chain().splitBlock().insertContent({ type: this.name }).insertContent({ type: "action", content: [] }).run();
                }
        };
    }
});
