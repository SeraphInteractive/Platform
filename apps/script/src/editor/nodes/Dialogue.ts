import { Node, mergeAttributes } from "@tiptap/core";

export const Dialogue = Node.create({
    name: "dialogue",
    group: "block",
    content: "inline*",
    defining: true,

    parseHTML() {
        return [{ tag: 'div[data-type="dialogue"]' }];
    },

    renderHTML({ HTMLAttributes }) {
        return [
            "div",
            mergeAttributes(HTMLAttributes, {
                "data-type": "dialogue",
                class: "screenplay-element dialogue"
            }),
            0
        ];
    }
});
