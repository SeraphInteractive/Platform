import { describe, it, expect } from "vitest";
import type { EditorView } from "@tiptap/pm/view";
import { handleReplacementBeforeInput } from "./ScreenplayTypingEnhancements";

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
});
