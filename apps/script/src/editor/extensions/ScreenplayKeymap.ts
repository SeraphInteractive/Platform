import { Extension } from "@tiptap/core";
import { canSplit } from "@tiptap/pm/transform";
import { removePageBreak } from "../nodes/PageBreak";

// atomic split into fresh block type avoiding schema attribute pollution
function splitToType(editor: any, targetTypeName: string): boolean {
    const { state, view } = editor;
    const targetType = state.schema.nodes[targetTypeName];
    if (!targetType) return false;

    const { selection } = state;
    const { $from } = selection;
    const tr = state.tr;

    if (!selection.empty) {
        tr.deleteSelection();
    }

    const pos = tr.mapping.map($from.pos);
    const typesAfter = [{ type: targetType, attrs: {} }];

    if (canSplit(tr.doc, pos, 1, typesAfter)) {
        tr.split(pos, 1, typesAfter);
        view.dispatch(tr.scrollIntoView());
        return true;
    }

    tr.split(pos, 1);
    view.dispatch(tr.scrollIntoView());
    return true;
}

// converts target block directly resetting attributes
function setBlockToType(editor: any, targetTypeName: string): boolean {
    const { state, view } = editor;
    const targetType = state.schema.nodes[targetTypeName];
    if (!targetType) return false;

    const { selection } = state;
    const tr = state.tr;

    for (let i = 0; i < selection.ranges.length; i++) {
        const { $from, $to } = selection.ranges[i];
        tr.setBlockType($from.pos, $to.pos, targetType, {});
    }

    view.dispatch(tr.scrollIntoView());
    return true;
}

export const ScreenplayKeymap = Extension.create({
    name: "screenplayKeymap",

    addKeyboardShortcuts() {
        return {
            Enter: ({ editor }) => {
                const { state } = editor;
                const { selection } = state;
                const { $from } = selection;
                const parentNode = $from.parent;
                const currentType = parentNode.type.name;
                const isEmpty = parentNode.textContent.trim().length === 0;

                // empty lines convert to logical next element or action
                if (isEmpty) {
                    if (currentType === "sceneHeading") {
                        return setBlockToType(editor, "action");
                    }
                    if (currentType === "character" || currentType === "dialogue" || currentType === "transition") {
                        return setBlockToType(editor, "action");
                    }
                    if (currentType === "parenthetical") {
                        return setBlockToType(editor, "dialogue");
                    }
                }

                if (currentType === "sceneHeading") {
                    return splitToType(editor, "action");
                }

                if (currentType === "character") {
                    return splitToType(editor, "dialogue");
                }

                if (currentType === "parenthetical") {
                    return splitToType(editor, "dialogue");
                }

                if (currentType === "dialogue") {
                    return splitToType(editor, "action");
                }

                if (currentType === "transition") {
                    return splitToType(editor, "sceneHeading");
                }

                return false;
            },

            "Shift-Enter": ({ editor }) => {
                const { state } = editor;
                const { selection } = state;
                const { $from } = selection;
                const parentNode = $from.parent;
                const currentType = parentNode.type.name;

                // screenplay continuity on shift+enter without switching element type
                if (currentType === "dialogue") {
                    return splitToType(editor, "dialogue");
                }
                if (currentType === "action") {
                    return splitToType(editor, "action");
                }
                if (currentType === "character") {
                    return splitToType(editor, "dialogue");
                }
                if (currentType === "parenthetical") {
                    return splitToType(editor, "dialogue");
                }
                if (currentType === "sceneHeading" || currentType === "transition") {
                    return splitToType(editor, "action");
                }
                return splitToType(editor, currentType);
            },

            Tab: ({ editor }) => {
                const { state } = editor;
                const { selection } = state;
                const { $from } = selection;
                const parentNode = $from.parent;
                const currentType = parentNode.type.name;
                const isEmpty = parentNode.textContent.trim().length === 0;

                // blank lines rotate element type
                if (isEmpty) {
                    if (currentType === "action") {
                        return setBlockToType(editor, "character");
                    }
                    if (currentType === "character") {
                        return setBlockToType(editor, "transition");
                    }
                    if (currentType === "transition") {
                        return setBlockToType(editor, "sceneHeading");
                    }
                    if (currentType === "sceneHeading") {
                        return setBlockToType(editor, "action");
                    }
                    if (currentType === "dialogue") {
                        return setBlockToType(editor, "parenthetical");
                    }
                    if (currentType === "parenthetical") {
                        return setBlockToType(editor, "dialogue");
                    }
                }

                if (currentType === "action") {
                    return splitToType(editor, "character");
                }

                if (currentType === "character") {
                    return splitToType(editor, "parenthetical");
                }

                if (currentType === "parenthetical") {
                    return splitToType(editor, "dialogue");
                }

                if (currentType === "dialogue") {
                    return splitToType(editor, "parenthetical");
                }

                if (currentType === "transition") {
                    return splitToType(editor, "sceneHeading");
                }

                if (currentType === "sceneHeading") {
                    return splitToType(editor, "action");
                }

                return false;
            },

            "Shift-Tab": ({ editor }) => {
                const { state } = editor;
                const { selection } = state;
                const { $from } = selection;
                const currentType = $from.parent.type.name;

                if (currentType === "character") {
                    return setBlockToType(editor, "action");
                }
                if (currentType === "parenthetical") {
                    return setBlockToType(editor, "character");
                }
                if (currentType === "dialogue") {
                    return setBlockToType(editor, "character");
                }
                if (currentType === "transition") {
                    return setBlockToType(editor, "character");
                }
                if (currentType === "sceneHeading") {
                    return setBlockToType(editor, "transition");
                }
                return false;
            },

            Backspace: ({ editor }) => {
                const { state } = editor;
                const sel = state.selection as any;
                if (sel.node?.type?.name === "scriptImage") {
                    return editor.commands.deleteSelection();
                }
                if (sel.node?.type?.name === "pageBreak") {
                    removePageBreak(editor, () => sel.from);
                    return true;
                }

                const { selection } = state;
                const { $from, empty } = selection;
                if (!empty) return false;

                const parentNode = $from.parent;
                const currentType = parentNode.type.name;
                const isEmpty = parentNode.textContent.trim().length === 0;
                const isAtStart = $from.parentOffset === 0;

                // delete preceding atom block when cursor is at start
                if (isAtStart && $from.depth >= 1) {
                    const index = $from.index(0);
                    if (index > 0) {
                        const prevBlock = state.doc.child(index - 1);
                        if (prevBlock.type.name === "scriptImage" || prevBlock.type.name === "pageBreak") {
                            const prevStart = $from.before(1) - prevBlock.nodeSize;
                            const tr = state.tr.delete(prevStart, $from.before(1));
                            editor.view.dispatch(tr);
                            return true;
                        }
                    }
                }

                // convert empty specialized blocks back to standard block on backspace
                if (isEmpty || isAtStart) {
                    if (currentType === "parenthetical") {
                        return setBlockToType(editor, "dialogue");
                    }
                    if (currentType === "character" || currentType === "transition" || currentType === "sceneHeading") {
                        return setBlockToType(editor, "action");
                    }
                }
                return false;
            },

            Delete: ({ editor }) => {
                const { state } = editor;
                const sel = state.selection as any;
                if (sel.node?.type?.name === "scriptImage") {
                    return editor.commands.deleteSelection();
                }
                if (sel.node?.type?.name === "pageBreak") {
                    removePageBreak(editor, () => sel.from);
                    return true;
                }
                return false;
            },

            // Cmd+Enter / Ctrl+Enter inserts page break
            "Mod-Enter": ({ editor }) => {
                return editor.commands.setPageBreak();
            },

            // numerical element shortcuts matching Arc Studio
            "Mod-1": ({ editor }) => setBlockToType(editor, "sceneHeading"),
            "Mod-2": ({ editor }) => setBlockToType(editor, "action"),
            "Mod-3": ({ editor }) => setBlockToType(editor, "character"),
            "Mod-4": ({ editor }) => setBlockToType(editor, "parenthetical"),
            "Mod-5": ({ editor }) => setBlockToType(editor, "dialogue"),
            "Mod-6": ({ editor }) => setBlockToType(editor, "sceneHeading"),
            "Mod-7": ({ editor }) => setBlockToType(editor, "transition")
        };
    }
});
