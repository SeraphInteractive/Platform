import { describe, it, expect } from "vitest";
import type { EditorView } from "@tiptap/pm/view";
import { handleReplacementBeforeInput, findClosestSubstringIndex, getDomTextOffset } from "./ScreenplayTypingEnhancements";

describe("ScreenplayTypingEnhancements", () => {
    it("ignores non-replacement input types", () => {
        const dummyView = {
            state: { tr: {} }
        } as unknown as EditorView;

        const event = {
            inputType: "insertText",
            data: "a"
        } as unknown as InputEvent;

        const handled = handleReplacementBeforeInput(dummyView, event);
        expect(handled).toBe(false);
    });

    it("handles insertReplacementText by replacing selection when getTargetRanges is empty", () => {
        let dispatchedTr: any = null;
        let prevented = false;

        const fakeState = {
            selection: { from: 5, to: 10, empty: false },
            tr: {
                insertText: (text: string, from: number, to: number) => ({
                    type: "insertText",
                    text,
                    from,
                    to
                })
            }
        };

        const dummyView = {
            state: fakeState,
            dispatch: (tr: any) => {
                dispatchedTr = tr;
            }
        } as unknown as EditorView;

        const event = {
            inputType: "insertReplacementText",
            data: "corrected",
            preventDefault: () => {
                prevented = true;
            },
            getTargetRanges: () => []
        } as unknown as InputEvent;

        const handled = handleReplacementBeforeInput(dummyView, event);
        expect(handled).toBe(true);
        expect(prevented).toBe(true);
        expect(dispatchedTr).toEqual({
            type: "insertText",
            text: "corrected",
            from: 5,
            to: 10
        });
    });

    it("handles insertReplacementText using getTargetRanges when provided", () => {
        let dispatchedTr: any = null;
        let prevented = false;

        const startNode = { parentNode: null };
        const endNode = { parentNode: null };
        const container = {
            contains: (node: any) => node === startNode || node === endNode
        };

        const fakeState = {
            selection: { from: 0, to: 0 },
            tr: {
                insertText: (text: string, from: number, to: number) => ({
                    type: "insertText",
                    text,
                    from,
                    to
                })
            }
        };

        const dummyView = {
            dom: container,
            state: fakeState,
            posAtDOM: (node: any, offset: number) => {
                if (node === startNode) return 12 + offset;
                if (node === endNode) return 18 + offset;
                return 0;
            },
            dispatch: (tr: any) => {
                dispatchedTr = tr;
            }
        } as unknown as EditorView;

        const event = {
            inputType: "insertReplacementText",
            data: "GrammarlyFix",
            preventDefault: () => {
                prevented = true;
            },
            getTargetRanges: () => [
                {
                    startContainer: startNode,
                    startOffset: 0,
                    endContainer: endNode,
                    endOffset: 0
                }
            ]
        } as unknown as InputEvent;

        const handled = handleReplacementBeforeInput(dummyView, event);
        expect(handled).toBe(true);
        expect(prevented).toBe(true);
        expect(dispatchedTr).toEqual({
            type: "insertText",
            text: "GrammarlyFix",
            from: 12,
            to: 18
        });
    });

    it("handles insertText with a non-collapsed target range replacing text", () => {
        let dispatchedTr: any = null;
        let prevented = false;

        const textNode = { nodeType: 3, textContent: "speling", parentNode: null };
        const container = {
            contains: (node: any) => node === textNode
        };

        const fakeState = {
            selection: { from: 0, to: 0 },
            tr: {
                insertText: (text: string, from: number, to: number) => ({
                    type: "insertText",
                    text,
                    from,
                    to
                })
            }
        };

        const dummyView = {
            dom: container,
            state: fakeState,
            posAtDOM: (node: any, offset: number) => 100 + offset,
            dispatch: (tr: any) => {
                dispatchedTr = tr;
            }
        } as unknown as EditorView;

        const event = {
            inputType: "insertText",
            data: "spelling",
            preventDefault: () => {
                prevented = true;
            },
            getTargetRanges: () => [
                {
                    startContainer: textNode,
                    startOffset: 0,
                    endContainer: textNode,
                    endOffset: 7
                }
            ]
        } as unknown as InputEvent;

        const handled = handleReplacementBeforeInput(dummyView, event);
        expect(handled).toBe(true);
        expect(prevented).toBe(true);
        expect(dispatchedTr).toEqual({
            type: "insertText",
            text: "spelling",
            from: 100,
            to: 107
        });
    });

    it("ignores insertText when target range is collapsed", () => {
        const textNode = { nodeType: 3, textContent: "normal typing", parentNode: null };
        const container = { contains: (node: any) => node === textNode };

        const dummyView = {
            dom: container,
            state: { selection: { from: 105, to: 105 } },
            posAtDOM: (_node: any, offset: number) => 100 + offset,
            dispatch: () => {}
        } as unknown as EditorView;

        const event = {
            inputType: "insertText",
            data: "a",
            preventDefault: () => {},
            getTargetRanges: () => [
                {
                    startContainer: textNode,
                    startOffset: 5,
                    endContainer: textNode,
                    endOffset: 5
                }
            ]
        } as unknown as InputEvent;

        const handled = handleReplacementBeforeInput(dummyView, event);
        expect(handled).toBe(false);
    });

    it("correctly finds closest substring index", () => {
        const text = "He had a bad speling and another bad speling here.";
        // first 'speling' at index 13, second at 37
        expect(findClosestSubstringIndex(text, "speling", 10)).toBe(13);
        expect(findClosestSubstringIndex(text, "speling", 35)).toBe(37);
        expect(findClosestSubstringIndex(text, "missing", 10)).toBe(-1);
    });

    it("replaces word under collapsed cursor on insertReplacementText fallback", () => {
        let dispatchedTr: any = null;
        let prevented = false;

        const blockText = "He wanted to recieve the prize.";
        // 'recieve' is from index 13 to 20
        const fakeState = {
            selection: {
                from: 16,
                to: 16,
                empty: true,
                $from: {
                    parent: { textContent: blockText },
                    parentOffset: 16,
                    start: () => 1
                }
            },
            tr: {
                insertText: (text: string, from: number, to: number) => ({
                    type: "insertText",
                    text,
                    from,
                    to
                })
            }
        };

        const dummyView = {
            dom: { contains: () => false },
            state: fakeState,
            dispatch: (tr: any) => {
                dispatchedTr = tr;
            }
        } as unknown as EditorView;

        const event = {
            inputType: "insertReplacementText",
            data: "receive",
            preventDefault: () => {
                prevented = true;
            },
            getTargetRanges: () => []
        } as unknown as InputEvent;

        const handled = handleReplacementBeforeInput(dummyView, event);
        expect(handled).toBe(true);
        expect(prevented).toBe(true);
        // startOfBlock (1) + wordStart (13) = 14, wordEnd (20) + 1 = 21
        expect(dispatchedTr).toEqual({
            type: "insertText",
            text: "receive",
            from: 14,
            to: 21
        });
    });
});
