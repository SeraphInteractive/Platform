import { Node, mergeAttributes } from "@tiptap/core";

export const Character = Node.create({
  name: "character",
  group: "block",
  content: "inline*",
  defining: true,

  addAttributes() {
    return {
      extension: { default: null }
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="character"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs: Record<string, string> = {
      "data-type": "character",
      class: "screenplay-element character"
    };
    if (node.attrs.extension) {
      attrs["data-extension"] = String(node.attrs.extension);
    }
    return ["div", mergeAttributes(HTMLAttributes, attrs), 0];
  }
});
