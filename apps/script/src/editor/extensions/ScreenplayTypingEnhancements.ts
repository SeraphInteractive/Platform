import { Extension, InputRule, markInputRule, markPasteRule } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import Italic from "@tiptap/extension-italic";

const starInputRegex = /(?:^|\s)(\*(?!\s+\*)((?:[^*]+))\*(?!\s+\*))$/;
const starPasteRegex = /(?:^|\s)(\*(?!\s+\*)((?:[^*]+))\*(?!\s+\*))/g;

// custom screenplay italic accepting only *italic* to avoid collision with _underlined_
export const ScreenplayItalic = Italic.extend({
    addInputRules() {
        return [
            markInputRule({
                find: starInputRegex,
                type: this.type
            })
        ];
    },
    addPasteRules() {
        return [
            markPasteRule({
                find: starPasteRegex,
                type: this.type
            })
        ];
    }
});

export const ScreenplayTypingPluginKey = new PluginKey("screenplayTypingEnhancements");

// helper to find text offset of a DOM node within a container element
export function getDomTextOffset(container: Node, targetNode: Node, targetOffset: number): number {
    let offset = 0;
    if (typeof document === "undefined") {
        return targetOffset;
    }
    // if targetNode is container itself, sum length of children up to targetOffset
    if (targetNode === container) {
        for (let i = 0; i < targetOffset && i < container.childNodes.length; i++) {
            offset += container.childNodes[i]?.textContent?.length || 0;
        }
        return offset;
    }
    try {
        const walker = document.createTreeWalker(container, 4 /* NodeFilter.SHOW_TEXT */);
        let current = walker.nextNode();
        while (current) {
            if (current === targetNode) {
                return offset + targetOffset;
            }
            offset += current.textContent?.length || 0;
            current = walker.nextNode();
        }
    } catch {
        // fallback to targetOffset if DOM walker is not supported
    }
    return offset + targetOffset;
}

// helper to find closest occurrence of searchStr in text near targetOffset
export function findClosestSubstringIndex(text: string, searchStr: string, preferredOffset: number): number {
    if (!searchStr || !text) return -1;
    let bestIdx = -1;
    let minDiff = Infinity;
    let idx = text.indexOf(searchStr);
    while (idx !== -1) {
        const diff = Math.abs(idx - preferredOffset);
        if (diff < minDiff) {
            minDiff = diff;
            bestIdx = idx;
        }
        idx = text.indexOf(searchStr, idx + 1);
    }
    return bestIdx;
}

// grammarly, quillbot, languagetool, and browser spellcheck replacement handling via beforeinput
export function handleReplacementBeforeInput(view: EditorView, event: Event): boolean {
    const inputEvent = event as InputEvent;
    const inputType = inputEvent.inputType;
    const isReplacementType = inputType === "insertReplacementText";
    const isInsertText = inputType === "insertText";

    const getRanges = typeof inputEvent.getTargetRanges === "function" ? inputEvent.getTargetRanges() : [];
    const hasTargetRange = Boolean(getRanges && getRanges.length > 0);

    // check if dom selection is non-collapsed inside view.dom (e.g. extension execCommand('insertText'))
    const domSel = typeof window !== "undefined" ? window.getSelection() : null;
    const hasDomSelectionInEditor = Boolean(
        domSel && domSel.rangeCount > 0 && !domSel.isCollapsed && domSel.anchorNode && view.dom?.contains(domSel.anchorNode)
    );

    // if not an explicit replacement, has no target ranges, and has no non-collapsed DOM selection in the editor:
    // let prosemirror handle normal typing
    if (!isReplacementType && !hasTargetRange && (!isInsertText || !hasDomSelectionInEditor)) {
        return false;
    }

    const replacementText = inputEvent.data ?? inputEvent.dataTransfer?.getData("text/plain") ?? "";

    // helper to apply replacement via prosemirror transaction
    const applyReplacement = (from: number, to: number): boolean => {
        // if insertText with collapsed range, let normal prosemirror typing handle it
        if (!isReplacementType && from === to) {
            return false;
        }

        const docSize = view.state?.doc?.content?.size;
        if (typeof from === "number" && typeof to === "number" && from >= 0 && to >= from && (docSize === undefined || to <= docSize)) {
            event.preventDefault();
            const tr = view.state.tr.insertText(replacementText, from, to);
            if (typeof tr?.setSelection === "function" && tr.doc) {
                const endPos = from + replacementText.length;
                tr.setSelection(TextSelection.create(tr.doc, endPos));
            }
            view.dispatch(tr);
            return true;
        }
        return false;
    };

    // 1. Try resolving via getTargetRanges() (standard spellcheck / Grammarly beforeinput)
    if (hasTargetRange) {
        const range = getRanges[0];
        if (range) {
            const startContainer: Node = range.startContainer;
            const startOffset = range.startOffset;
            const endContainer: Node = range.endContainer;
            const endOffset = range.endOffset;

            // extract string from range if possible
            let rangeText = "";
            try {
                if (typeof document !== "undefined") {
                    const domRange = document.createRange();
                    domRange.setStart(startContainer, startOffset);
                    domRange.setEnd(endContainer, endOffset);
                    rangeText = domRange.toString();
                }
            } catch {
                // range creation can fail if nodes are in detached shadow roots
            }

            if (!rangeText && startContainer === endContainer && startContainer.nodeType === 3) {
                rangeText = (startContainer.textContent || "").slice(startOffset, endOffset);
            }

            // find enclosing screenplay block in editor DOM
            let ancestor: Node | null = startContainer;
            while (ancestor && ancestor !== view.dom && !view.dom?.contains(ancestor)) {
                ancestor = ancestor.parentNode;
            }

            const blockEl =
                ancestor && ancestor.nodeType === 1
                    ? (ancestor as Element).closest(".screenplay-element, [data-type]")
                    : ancestor?.parentElement?.closest(".screenplay-element, [data-type]");

            if (blockEl && view.dom?.contains(blockEl)) {
                try {
                    const blockPos =
                        typeof (view as any).docView?.posFromDOM === "function"
                            ? (view as any).docView.posFromDOM(blockEl, 0, 1)
                            : typeof view.posAtDOM === "function"
                              ? view.posAtDOM(blockEl, 0)
                              : -1;

                    if (blockPos >= 0 && view.state?.doc) {
                        const $block = view.state.doc.resolve(blockPos);
                        const blockStart = $block.start();
                        const blockContent = $block.parent.textContent;
                        const charOffset = getDomTextOffset(blockEl, startContainer, startOffset);

                        if (rangeText && blockContent.includes(rangeText)) {
                            const matchIdx = findClosestSubstringIndex(blockContent, rangeText, charOffset);
                            if (matchIdx >= 0) {
                                const from = blockStart + matchIdx;
                                const to = from + rangeText.length;
                                if (applyReplacement(from, to)) return true;
                            }
                        }

                        const from = blockStart + Math.min(charOffset, blockContent.length);
                        const to = rangeText ? Math.min(from + rangeText.length, $block.end()) : from;
                        if (applyReplacement(from, to)) return true;
                    }
                } catch {
                    // fall through to docView.posFromDOM
                }
            }

            // direct docView.posFromDOM fallback
            try {
                const rawFrom =
                    typeof (view as any).docView?.posFromDOM === "function"
                        ? (view as any).docView.posFromDOM(startContainer, startOffset, 1)
                        : typeof view.posAtDOM === "function"
                          ? view.posAtDOM(startContainer, startOffset)
                          : -1;

                const rawTo =
                    typeof (view as any).docView?.posFromDOM === "function"
                        ? (view as any).docView.posFromDOM(endContainer, endOffset, -1)
                        : typeof view.posAtDOM === "function"
                          ? view.posAtDOM(endContainer, endOffset)
                          : -1;

                if (rawFrom >= 0 && rawTo >= 0 && rawFrom <= rawTo) {
                    if (applyReplacement(rawFrom, rawTo)) return true;
                }
            } catch {
                // fall through
            }
        }
    }

    // 2. Try resolving via active DOM selection (e.g. extension execCommand('insertText'))
    if (domSel && domSel.rangeCount > 0) {
        const domRange = domSel.getRangeAt(0);
        if (
            domRange.startContainer &&
            view.dom?.contains(domRange.startContainer) &&
            domRange.endContainer &&
            view.dom?.contains(domRange.endContainer)
        ) {
            let selText = "";
            try {
                selText = domRange.toString();
            } catch {}

            const startContainer = domRange.startContainer;
            const startOffset = domRange.startOffset;

            const blockEl =
                startContainer.nodeType === 1
                    ? (startContainer as Element).closest(".screenplay-element, [data-type]")
                    : startContainer.parentElement?.closest(".screenplay-element, [data-type]");

            if (blockEl && view.dom?.contains(blockEl)) {
                try {
                    const blockPos =
                        typeof (view as any).docView?.posFromDOM === "function"
                            ? (view as any).docView.posFromDOM(blockEl, 0, 1)
                            : typeof view.posAtDOM === "function"
                              ? view.posAtDOM(blockEl, 0)
                              : -1;

                    if (blockPos >= 0 && view.state?.doc) {
                        const $block = view.state.doc.resolve(blockPos);
                        const blockStart = $block.start();
                        const blockContent = $block.parent.textContent;
                        const charOffset = getDomTextOffset(blockEl, startContainer, startOffset);

                        if (selText && blockContent.includes(selText)) {
                            const matchIdx = findClosestSubstringIndex(blockContent, selText, charOffset);
                            if (matchIdx >= 0) {
                                const from = blockStart + matchIdx;
                                const to = from + selText.length;
                                if (applyReplacement(from, to)) return true;
                            }
                        }

                        const from = blockStart + Math.min(charOffset, blockContent.length);
                        const to = selText ? Math.min(from + selText.length, $block.end()) : from;
                        if (applyReplacement(from, to)) return true;
                    }
                } catch {}
            }

            try {
                const rawFrom =
                    typeof (view as any).docView?.posFromDOM === "function"
                        ? (view as any).docView.posFromDOM(domRange.startContainer, domRange.startOffset, 1)
                        : typeof view.posAtDOM === "function"
                          ? view.posAtDOM(domRange.startContainer, domRange.startOffset)
                          : -1;

                const rawTo =
                    typeof (view as any).docView?.posFromDOM === "function"
                        ? (view as any).docView.posFromDOM(domRange.endContainer, domRange.endOffset, -1)
                        : typeof view.posAtDOM === "function"
                          ? view.posAtDOM(domRange.endContainer, domRange.endOffset)
                          : -1;

                if (rawFrom >= 0 && rawTo >= 0 && rawFrom <= rawTo) {
                    if (applyReplacement(rawFrom, rawTo)) return true;
                }
            } catch {}
        }
    }

    // 3. Fallback for explicit replacement events using ProseMirror state selection
    if (isReplacementType) {
        const { from, to, empty } = view.state.selection;
        if (!empty) {
            if (applyReplacement(from, to)) return true;
        }

        // if selection is collapsed, check if cursor is inside or adjacent to a word being corrected
        const $from = view.state.selection.$from;
        if ($from && $from.parent) {
            const text = $from.parent.textContent;
            const offset = $from.parentOffset;
            const startOfBlock = $from.start();

            const before = text.slice(0, offset).match(/[\w\-']+$/);
            const after = text.slice(offset).match(/^[\w\-']+/);
            if (before || after) {
                const wordStart = offset - (before ? before[0].length : 0);
                const wordEnd = offset + (after ? after[0].length : 0);
                if (wordEnd > wordStart) {
                    if (applyReplacement(startOfBlock + wordStart, startOfBlock + wordEnd)) {
                        return true;
                    }
                }
            }
        }

        // final fallback to current selection position
        if (applyReplacement(from, to)) return true;
    }

    return false;
}

export const ScreenplayTypingEnhancements = Extension.create({
    name: "screenplayTypingEnhancements",

    addKeyboardShortcuts() {
        return {
            // toggle uppercase/lowercase for selection matching toolbar button
            "Mod-Shift-u": () => {
                const { state, view } = this.editor;
                const { from, to, empty } = state.selection;
                if (empty) return false;
                const text = state.doc.textBetween(from, to, " ");
                const isUpper = text === text.toUpperCase();
                const newText = isUpper ? text.toLowerCase() : text.toUpperCase();
                view.dispatch(state.tr.insertText(newText, from, to));
                return true;
            },
            "Mod-Shift-U": () => {
                const { state, view } = this.editor;
                const { from, to, empty } = state.selection;
                if (empty) return false;
                const text = state.doc.textBetween(from, to, " ");
                const isUpper = text === text.toUpperCase();
                const newText = isUpper ? text.toLowerCase() : text.toUpperCase();
                view.dispatch(state.tr.insertText(newText, from, to));
                return true;
            }
        };
    },

    addInputRules() {
        const strikeMark = this.editor.schema.marks.strike;

        return [
            // single tilde strikethrough in addition to double tilde
            ...(strikeMark
                ? [
                      new InputRule({
                          find: /(?:^|\s)(~(?!\s+~)((?:[^~]+))~(?!\s+~))$/,
                          handler: ({ state, range, match }) => {
                              const capture = match[2];
                              if (!capture) return;
                              const start = range.from + match[0].indexOf("~");
                              const end = range.to;
                              const tr = state.tr;
                              tr.replaceWith(start, end, state.schema.text(capture));
                              tr.addMark(start, start + capture.length, strikeMark.create());
                              tr.removeStoredMark(strikeMark);
                          }
                      })
                  ]
                : []),

            // inline all-caps trigger: typing !word converts word to uppercase
            new InputRule({
                find: /(?:^|\s)!([a-zA-Z0-9_\-']+)\s$/,
                handler: ({ state, range, match }) => {
                    const word = match[1];
                    if (!word) return;
                    const start = range.from + match[0].indexOf("!");
                    const end = range.to;
                    const tr = state.tr;
                    tr.replaceWith(start, end, state.schema.text(`${word.toUpperCase()} `));
                }
            }),

            // line-level all-caps trigger: block starting with ! capitalizes whole line on space
            new InputRule({
                find: /^!([^\n]+)\s$/,
                handler: ({ state, range, match }) => {
                    const text = match[1];
                    if (!text) return;
                    const tr = state.tr;
                    tr.replaceWith(range.from, range.to, state.schema.text(`${text.toUpperCase()} `));
                }
            })
        ];
    },

    addProseMirrorPlugins() {
        let lastCapitalizedPos: number | null = null;
        let lastCapitalizedOriginalChar: string | null = null;

        return [
            new Plugin({
                key: ScreenplayTypingPluginKey,
                props: {
                    handleDOMEvents: {
                        beforeinput: (view, event) => handleReplacementBeforeInput(view, event),
                        input: (view, event) => {
                            const inputEvent = event as InputEvent;
                            if (inputEvent.inputType === "insertReplacementText") {
                                return handleReplacementBeforeInput(view, event);
                            }
                            return false;
                        }
                    },
                    handleTextInput(view, from, to, text) {
                        if (!/^[a-z]$/.test(text)) {
                            lastCapitalizedPos = null;
                            lastCapitalizedOriginalChar = null;
                            return false;
                        }

                        const { state } = view;
                        const $from = state.doc.resolve(from);
                        const parent = $from.parent;
                        const type = parent.type.name;

                        // only auto-capitalize in mixed-case screenplay blocks
                        if (type !== "action" && type !== "dialogue" && type !== "parenthetical") {
                            lastCapitalizedPos = null;
                            lastCapitalizedOriginalChar = null;
                            return false;
                        }

                        const textBefore = parent.textContent.slice(0, $from.parentOffset);
                        const isStart = textBefore.trim().length === 0 || /[.?!]\s+$/.test(textBefore);

                        if (isStart) {
                            const upper = text.toUpperCase();
                            const tr = state.tr.insertText(upper, from, to);
                            lastCapitalizedPos = from;
                            lastCapitalizedOriginalChar = text;
                            view.dispatch(tr);
                            return true;
                        }

                        lastCapitalizedPos = null;
                        lastCapitalizedOriginalChar = null;
                        return false;
                    },

                    handleKeyDown(view, event) {
                        if (event.key === "Backspace") {
                            const { state } = view;
                            const { selection } = state;
                            if (
                                selection.empty &&
                                lastCapitalizedPos !== null &&
                                lastCapitalizedOriginalChar !== null &&
                                selection.from === lastCapitalizedPos + 1
                            ) {
                                const charInDoc = state.doc.textBetween(lastCapitalizedPos, selection.from);
                                if (charInDoc === lastCapitalizedOriginalChar.toUpperCase()) {
                                    event.preventDefault();
                                    const tr = state.tr.insertText(lastCapitalizedOriginalChar, lastCapitalizedPos, selection.from);
                                    lastCapitalizedPos = null;
                                    lastCapitalizedOriginalChar = null;
                                    view.dispatch(tr);
                                    return true;
                                }
                            }
                        }

                        // clear revert target once user navigates or types further
                        if (event.key !== "Shift" && event.key !== "Control" && event.key !== "Alt" && event.key !== "Meta") {
                            lastCapitalizedPos = null;
                            lastCapitalizedOriginalChar = null;
                        }

                        return false;
                    }
                }
            })
        ];
    }
});
