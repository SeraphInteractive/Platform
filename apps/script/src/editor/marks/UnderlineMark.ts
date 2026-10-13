import { Mark, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        underline: {
            setUnderline: () => ReturnType;
            toggleUnderline: () => ReturnType;
            unsetUnderline: () => ReturnType;
        };
    }
}

export const UnderlineMark = Mark.create({
    name: "underline",

    parseHTML() {
        return [
            { tag: "u" },
            {
                style: "text-decoration",
                consuming: false,
                getAttrs: (style) => ((style as string).includes("underline") ? {} : false)
            }
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ["u", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
    },

    addCommands() {
        return {
            setUnderline:
                () =>
                ({ commands }) =>
                    commands.setMark(this.name),
            toggleUnderline:
                () =>
                ({ commands }) =>
                    commands.toggleMark(this.name),
            unsetUnderline:
                () =>
                ({ commands }) =>
                    commands.unsetMark(this.name)
        };
    },

    addKeyboardShortcuts() {
        return {
            "Mod-u": () => this.editor.commands.toggleUnderline(),
            "Mod-U": () => this.editor.commands.toggleUnderline()
        };
    }
});
