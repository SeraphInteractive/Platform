import { Node, mergeAttributes } from "@tiptap/core";

export const Action = Node.create({
  name: "action",
  group: "block",
  content: "inline*",
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="action"]' }, { tag: "p" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "action",
        class: "screenplay-element action"
      }),
      0
    ];
  }
});
