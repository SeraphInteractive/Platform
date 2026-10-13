import { Node, mergeAttributes } from "@tiptap/core";

export const SceneHeading = Node.create({
  name: "sceneHeading",
  group: "block",
  content: "inline*",
  defining: true,

  addAttributes() {
    return {
      sceneNumber: { default: null },
      synopsis: { default: "" },
      sceneColor: { default: "" }
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="scene-heading"]',
        getAttrs: (el) => {
          const dom = el as HTMLElement;
          return {
            sceneNumber: dom.getAttribute("data-scene-number") || null,
            synopsis: dom.getAttribute("data-synopsis") || "",
            sceneColor: dom.getAttribute("data-scene-color") || ""
          };
        }
      }
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs: Record<string, string> = {
      "data-type": "scene-heading",
      class: "screenplay-element scene-heading"
    };
    if (node.attrs.sceneNumber) {
      attrs["data-scene-number"] = String(node.attrs.sceneNumber);
    }
    if (node.attrs.synopsis) {
      attrs["data-synopsis"] = String(node.attrs.synopsis);
    }
    if (node.attrs.sceneColor) {
      attrs["data-scene-color"] = String(node.attrs.sceneColor);
    }
    return ["div", mergeAttributes(HTMLAttributes, attrs), 0];
  }
});
