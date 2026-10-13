import { Node, mergeAttributes } from "@tiptap/core";

export interface ScriptImageOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    scriptImage: {
      setScriptImage: (options: { src: string; alt?: string; caption?: string }) => ReturnType;
    };
  }
}

export const ScriptImage = Node.create<ScriptImageOptions>({
  name: "scriptImage",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: {
        default: null
      },
      alt: {
        default: ""
      },
      caption: {
        default: ""
      }
    };
  },

  parseHTML() {
    return [
      {
        tag: "figure[data-script-image]",
        getAttrs: (dom) => {
          if (typeof dom === "string") return false;
          const element = dom as HTMLElement;
          const img = element.querySelector("img");
          const caption = element.querySelector("figcaption");
          return {
            src: img?.getAttribute("src") || "",
            alt: img?.getAttribute("alt") || "",
            caption: caption?.textContent || ""
          };
        }
      }
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const src = HTMLAttributes.src as string;
    const caption = HTMLAttributes.caption as string;

    return [
      "figure",
      mergeAttributes(this.options.HTMLAttributes, {
        class: "screenplay-element script-image-block my-4 select-none",
        "data-script-image": ""
      }),
      [
        "div",
        { class: "w-full overflow-hidden rounded border border-[#262933] bg-[#0e1015]" },
        [
          "img",
          {
            src,
            alt: (HTMLAttributes.alt as string) || "Screenplay Storyboard Still",
            class: "w-full aspect-video object-cover block"
          }
        ]
      ],
      caption
        ? [
            "figcaption",
            { class: "text-[11px] text-slate-400 font-mono text-center mt-2 italic" },
            caption
          ]
        : ["span", { class: "hidden" }]
    ];
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement("figure");
      dom.className = "screenplay-element script-image-block group relative my-4 select-none";
      dom.setAttribute("data-script-image", "");

      const card = document.createElement("div");
      card.className =
        "relative w-full overflow-hidden rounded border border-[#262933] bg-[#0e1015] hover:border-[#3b4055] transition-all";

      const img = document.createElement("img");
      img.src = node.attrs.src || "";
      img.alt = node.attrs.alt || "Screenplay Storyboard Still";
      img.className = "w-full aspect-video object-cover block";
      card.appendChild(img);

      // floating action toolbar on hover or selection
      const toolbar = document.createElement("div");
      toolbar.className =
        "no-print absolute top-2.5 right-2.5 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150";

      const captionBtn = document.createElement("button");
      captionBtn.type = "button";
      captionBtn.className =
        "flex items-center gap-1 px-2 py-1 rounded bg-[#12141c]/90 hover:bg-[#1a1d28] border border-[#2c3144] text-[11px] font-mono text-slate-300 backdrop-blur-md transition-colors shadow-lg cursor-pointer";
      captionBtn.textContent = "Caption";
      toolbar.appendChild(captionBtn);

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className =
        "flex items-center gap-1 px-2.5 py-1 rounded bg-[#12141c]/90 hover:bg-red-950/80 hover:text-red-200 border border-[#2c3144] hover:border-red-800/60 text-[11px] font-mono text-red-400 backdrop-blur-md transition-colors shadow-lg cursor-pointer";
      deleteBtn.textContent = "Remove";
      toolbar.appendChild(deleteBtn);

      card.appendChild(toolbar);
      dom.appendChild(card);

      let captionEl: HTMLElement | null = null;
      const updateCaptionDisplay = (text: string) => {
        if (captionEl) {
          captionEl.remove();
          captionEl = null;
        }
        if (text) {
          captionEl = document.createElement("figcaption");
          captionEl.className =
            "text-[11px] text-slate-400 font-mono text-center mt-2 italic cursor-pointer hover:text-slate-200 transition-colors";
          captionEl.textContent = text;
          captionEl.onclick = (e) => {
            e.stopPropagation();
            startCaptionEdit();
          };
          dom.appendChild(captionEl);
        }
      };

      const startCaptionEdit = () => {
        const currentText = node.attrs.caption || "";
        const input = document.createElement("input");
        input.type = "text";
        input.value = currentText;
        input.placeholder = "Shot caption or storyboard note...";
        input.className =
          "no-print mt-2 block w-full max-w-lg mx-auto bg-[#10121a] border border-[#2c3144] rounded px-2.5 py-1 text-xs text-slate-200 font-mono italic text-center focus:outline-none focus:border-blue-500";

        if (captionEl) {
          captionEl.replaceWith(input);
        } else {
          dom.appendChild(input);
        }

        input.focus();
        input.select();

        let committed = false;
        const commit = () => {
          if (committed) return;
          committed = true;
          const val = input.value.trim();
          if (typeof getPos === "function") {
            const pos = getPos();
            if (typeof pos === "number") {
              editor.view.dispatch(
                editor.state.tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  caption: val
                })
              );
            }
          }
          input.remove();
          updateCaptionDisplay(val);
        };

        input.onblur = commit;
        input.onkeydown = (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            committed = true;
            input.remove();
            updateCaptionDisplay(currentText);
          }
        };
      };

      captionBtn.onclick = (e) => {
        e.stopPropagation();
        startCaptionEdit();
      };

      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        if (typeof getPos === "function") {
          const pos = getPos();
          if (typeof pos === "number") {
            editor.view.dispatch(editor.state.tr.delete(pos, pos + node.nodeSize));
            editor.commands.focus();
          }
        }
      };

      updateCaptionDisplay(node.attrs.caption || "");

      return {
        dom,
        selectNode() {
          card.classList.add("ring-2", "ring-blue-500", "border-blue-500");
          toolbar.classList.remove("opacity-0");
          toolbar.classList.add("opacity-100");
        },
        deselectNode() {
          card.classList.remove("ring-2", "ring-blue-500", "border-blue-500");
          toolbar.classList.add("opacity-0");
          toolbar.classList.remove("opacity-100");
        },
        update(updatedNode) {
          if (updatedNode.type.name !== "scriptImage") return false;
          if (updatedNode.attrs.src !== img.src) {
            img.src = updatedNode.attrs.src || "";
          }
          if (updatedNode.attrs.caption !== node.attrs.caption) {
            updateCaptionDisplay(updatedNode.attrs.caption || "");
          }
          return true;
        },
        destroy() {
          // clean up node view
        },
        stopEvent(e) {
          return e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement;
        },
        ignoreMutation() {
          return true;
        }
      };
    };
  },

  addCommands() {
    return {
      setScriptImage:
        (options) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: options
          });
        }
    };
  }
});
