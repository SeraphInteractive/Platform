import { Extension } from "@tiptap/core";

// prosemirror skips inline leaf nodes in textContent unless leafText is declared
export const HardBreakLeafText = Extension.create({
    name: "hardBreakLeafText",

    extendNodeSchema(extension) {
        return extension.name === "hardBreak" ? { leafText: () => "\n" } : {};
    }
});
