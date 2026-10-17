import { Mark, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        highlight: {
            setHighlight: (attributes?: { color?: string }) => ReturnType;
            toggleHighlight: (attributes?: { color?: string }) => ReturnType;
            unsetHighlight: () => ReturnType;
        };
    }
}

export const HighlightMark = Mark.create({
    name: "highlight",

    addAttributes() {
        return {
            color: {
                default: "rgba(250, 204, 21, 0.25)"
            }
        };
    },

    parseHTML() {
        return [
            {
                tag: "mark"
            }
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return [
            "mark",
            mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
                style: `background-color: ${HTMLAttributes.color || "rgba(250, 204, 21, 0.25)"}; color: inherit; padding: 0.1em 0.2em; border-radius: 2px;`
            }),
            0
        ];
    },

    addCommands() {
        return {
            setHighlight:
                (attributes) =>
                ({ commands }) =>
                    commands.setMark(this.name, attributes),
            toggleHighlight:
                (attributes) =>
                ({ commands }) =>
                    commands.toggleMark(this.name, attributes),
            unsetHighlight:
                () =>
                ({ commands }) =>
                    commands.unsetMark(this.name)
        };
    }
});
