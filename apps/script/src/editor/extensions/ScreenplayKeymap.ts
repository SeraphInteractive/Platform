import { Extension } from "@tiptap/core";
import { removePageBreak } from "../nodes/PageBreak";

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

        const splitAndSet = (target: string) => {
          editor.commands.splitBlock();
          editor.commands.setNode(target);
          return true;
        };

        // on empty lines, convert to the logical next element or action
        if (isEmpty) {
          if (currentType === "sceneHeading") {
            return editor.chain().setNode("action").run();
          }
          if (currentType === "character" || currentType === "dialogue" || currentType === "transition") {
            return editor.chain().setNode("action").run();
          }
          if (currentType === "parenthetical") {
            return editor.chain().setNode("dialogue").run();
          }
        }

        if (currentType === "sceneHeading") {
          return splitAndSet("action");
        }

        if (currentType === "character") {
          return splitAndSet("dialogue");
        }

        if (currentType === "parenthetical") {
          return splitAndSet("dialogue");
        }

        if (currentType === "dialogue") {
          return splitAndSet("action");
        }

        if (currentType === "transition") {
          return splitAndSet("sceneHeading");
        }

        return false;
      },

      Tab: ({ editor }) => {
        const { state } = editor;
        const { selection } = state;
        const { $from } = selection;
        const parentNode = $from.parent;
        const currentType = parentNode.type.name;
        const isEmpty = parentNode.textContent.trim().length === 0;

        const splitAndSet = (target: string) => {
          editor.commands.splitBlock();
          editor.commands.setNode(target);
          return true;
        };

        // on blank lines, tab rotates the element type
        if (isEmpty) {
          if (currentType === "action") {
            return editor.chain().setNode("character").run();
          }
          if (currentType === "character") {
            return editor.chain().setNode("transition").run();
          }
          if (currentType === "transition") {
            return editor.chain().setNode("sceneHeading").run();
          }
          if (currentType === "sceneHeading") {
            return editor.chain().setNode("action").run();
          }
          if (currentType === "dialogue") {
            return editor.chain().setNode("parenthetical").run();
          }
          if (currentType === "parenthetical") {
            return editor.chain().setNode("dialogue").run();
          }
        }

        // if typing with content: tab advances to the logical sub-element
        if (currentType === "action") {
          return splitAndSet("character");
        }

        if (currentType === "character") {
          return splitAndSet("parenthetical");
        }

        if (currentType === "parenthetical") {
          return splitAndSet("dialogue");
        }

        if (currentType === "dialogue") {
          return splitAndSet("parenthetical");
        }

        if (currentType === "transition") {
          return splitAndSet("sceneHeading");
        }

        if (currentType === "sceneHeading") {
          return splitAndSet("action");
        }

        return false;
      },

      "Shift-Tab": ({ editor }) => {
        const { state } = editor;
        const { selection } = state;
        const { $from } = selection;
        const currentType = $from.parent.type.name;

        if (currentType === "character") {
          return editor.chain().setNode("action").run();
        }
        if (currentType === "parenthetical") {
          return editor.chain().setNode("character").run();
        }
        if (currentType === "dialogue") {
          return editor.chain().setNode("character").run();
        }
        if (currentType === "transition") {
          return editor.chain().setNode("character").run();
        }
        if (currentType === "sceneHeading") {
          return editor.chain().setNode("transition").run();
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

        // if at start of block and previous block was a scriptImage or pageBreak, delete it
        if (isAtStart && $from.depth >= 1) {
          const index = $from.index(0);
          if (index > 0) {
            const prevBlock = state.doc.child(index - 1);
            if (prevBlock.type.name === "scriptImage") {
              const prevStart = $from.before(1) - prevBlock.nodeSize;
              const tr = state.tr.delete(prevStart, $from.before(1));
              editor.view.dispatch(tr);
              return true;
            }
            if (prevBlock.type.name === "pageBreak") {
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
            return editor.chain().setNode("dialogue").run();
          }
          if (
            currentType === "character" ||
            currentType === "transition" ||
            currentType === "sceneHeading"
          ) {
            return editor.chain().setNode("action").run();
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

      // industry standard shortcut: Cmd+Enter / Ctrl+Enter inserts page break
      "Mod-Enter": ({ editor }) => {
        return editor.commands.setPageBreak();
      },

      // numerical element shortcuts
      "Mod-1": ({ editor }) => editor.chain().setNode("sceneHeading").run(),
      "Mod-2": ({ editor }) => editor.chain().setNode("action").run(),
      "Mod-3": ({ editor }) => editor.chain().setNode("character").run(),
      "Mod-4": ({ editor }) => editor.chain().setNode("dialogue").run(),
      "Mod-5": ({ editor }) => editor.chain().setNode("parenthetical").run(),
      "Mod-6": ({ editor }) => editor.chain().setNode("transition").run()
    };
  }
});
