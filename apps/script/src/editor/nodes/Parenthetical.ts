import { Node, mergeAttributes } from "@tiptap/core";

export const Parenthetical = Node.create({
  name: "parenthetical",
  group: "block",
  content: "inline*",
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="parenthetical"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "parenthetical",
        class: "screenplay-element parenthetical"
      }),
      0
    ];
  }
});
