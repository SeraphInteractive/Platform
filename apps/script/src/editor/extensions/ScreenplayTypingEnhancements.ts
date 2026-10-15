import { Extension, InputRule, markInputRule, markPasteRule } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
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

// grammarly and spellcheck replacement handling via beforeinput
export function handleReplacementBeforeInput(view: EditorView, event: Event): boolean {
    const inputEvent = event as InputEvent;
    const isReplacementType = inputEvent.inputType === "insertReplacementText";

    // check if this is an explicit replacement or an insert replacing a non-collapsed target range
    const getRanges = typeof inputEvent.getTargetRanges === "function" ? inputEvent.getTargetRanges() : [];
    const hasTargetRange = Boolean(getRanges && getRanges.length > 0);

    // if not insertReplacementText and no target ranges, let prosemirror handle normal typing
    if (!isReplacementType && !hasTargetRange) {
        return false;
    }

    const replacementText = inputEvent.data ?? inputEvent.dataTransfer?.getData("text/plain") ?? "";

    if (hasTargetRange) {
        const range = getRanges[0];
        if (range) {
            try {
                let startContainer: Node = range.startContainer;
                let startOffset = range.startOffset;
                let endContainer: Node = range.endContainer;
                let endOffset = range.endOffset;

                // climb out of extension shadow wrappers to reach prose mirror dom
                while (startContainer && !view.dom.contains(startContainer) && startContainer.parentNode) {
                    startContainer = startContainer.parentNode;
                }
                while (endContainer && !view.dom.contains(endContainer) && endContainer.parentNode) {
                    endContainer = endContainer.parentNode;
                }

                // clamp offset if container is a text node
                if (startContainer.nodeType === 3 && typeof startContainer.textContent === "string") {
                    startOffset = Math.min(startOffset, startContainer.textContent.length);
                }
                if (endContainer.nodeType === 3 && typeof endContainer.textContent === "string") {
                    endOffset = Math.min(endOffset, endContainer.textContent.length);
                }

                const from = view.posAtDOM(startContainer, startOffset);
                const to = view.posAtDOM(endContainer, endOffset);
                if (typeof from === "number" && typeof to === "number" && from <= to) {
                    // if it is not insertReplacementText and range is collapsed, let prosemirror handle it
                    if (!isReplacementType && from === to) {
                        return false;
                    }
                    event.preventDefault();
                    const tr = view.state.tr.insertText(replacementText, from, to);
                    view.dispatch(tr);
                    return true;
                }
            } catch {
                // fall through to selection replacement
            }
        }
    }

    // fallback to active selection when ranges are unavailable or only for replacement events
    if (isReplacementType) {
        // inspect active dom selection if present inside editor dom
        const domSel = typeof window !== "undefined" ? window.getSelection() : null;
        if (domSel && domSel.rangeCount > 0) {
            const domRange = domSel.getRangeAt(0);
            if (view.dom.contains(domRange.startContainer) && view.dom.contains(domRange.endContainer)) {
                try {
                    const from = view.posAtDOM(domRange.startContainer, domRange.startOffset);
                    const to = view.posAtDOM(domRange.endContainer, domRange.endOffset);
                    if (typeof from === "number" && typeof to === "number" && from <= to) {
                        event.preventDefault();
                        const tr = view.state.tr.insertText(replacementText, from, to);
                        view.dispatch(tr);
                        return true;
                    }
                } catch {
                    // fallback to view.state.selection
                }
            }
        }

        const { from, to } = view.state.selection;
        event.preventDefault();
        const tr = view.state.tr.insertText(replacementText, from, to);
        view.dispatch(tr);
        return true;
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
                        beforeinput: (view, event) => handleReplacementBeforeInput(view, event)
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
