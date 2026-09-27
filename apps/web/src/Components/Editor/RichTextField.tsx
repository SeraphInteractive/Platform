"use client";

import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor, useEditorState, type ChainedCommands, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Code, Italic, List, ListOrdered, Quote, Strikethrough, Unlink } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { cn } from "@/Lib/Utils";
import { LinkTool, safeLink, Tool } from "./EditorTools";

function Toolbar({ editor }: { readonly editor: Editor }): ReactNode {
    const state = useEditorState({
        editor,
        selector: ({ editor: current }) => ({
            editable: current.isEditable,
            bold: current.isActive("bold"),
            italic: current.isActive("italic"),
            strike: current.isActive("strike"),
            code: current.isActive("code"),
            link: current.isActive("link"),
            bulletList: current.isActive("bulletList"),
            orderedList: current.isActive("orderedList"),
            blockquote: current.isActive("blockquote")
        })
    });
    const chain = (): ChainedCommands => editor.chain().focus();
    if (!state.editable) {
        return null;
    }
    return (
        <div className="flex flex-wrap items-center gap-0.5 border-b p-0.5">
            <Tool label="Bold" icon={Bold} active={state.bold} onClick={() => chain().toggleBold().run()} />
            <Tool label="Italic" icon={Italic} active={state.italic} onClick={() => chain().toggleItalic().run()} />
            <Tool label="Strikethrough" icon={Strikethrough} active={state.strike} onClick={() => chain().toggleStrike().run()} />
            <Tool label="Inline code" icon={Code} active={state.code} onClick={() => chain().toggleCode().run()} />
            <LinkTool editor={editor} active={state.link} />
            <Tool
                label="Remove link"
                icon={Unlink}
                disabled={!state.link}
                onClick={() => chain().extendMarkRange("link").unsetLink().run()}
            />
            <Tool label="Bulleted list" icon={List} active={state.bulletList} onClick={() => chain().toggleBulletList().run()} />
            <Tool label="Numbered list" icon={ListOrdered} active={state.orderedList} onClick={() => chain().toggleOrderedList().run()} />
            <Tool label="Quote" icon={Quote} active={state.blockquote} onClick={() => chain().toggleBlockquote().run()} />
        </div>
    );
}

interface RichTextFieldProps {
    readonly id?: string;
    readonly value: string;
    readonly placeholder?: string;
    readonly disabled?: boolean;
    readonly invalid?: boolean;
    readonly className?: string;
    readonly maxLength?: number;
    readonly onChange: (markdown: string) => void;
}

export function RichTextField({
    id,
    value,
    placeholder,
    disabled = false,
    invalid = false,
    className,
    maxLength,
    onChange
}: RichTextFieldProps): ReactNode {
    const editor = useEditor({
        immediatelyRender: false,
        extensions: [
            StarterKit.configure({
                heading: false,
                underline: false,
                horizontalRule: false,
                codeBlock: false,
                link: {
                    openOnClick: false,
                    autolink: true,
                    protocols: ["https", "http", "mailto"],
                    isAllowedUri: (url) => safeLink.test(url)
                }
            }),
            Markdown,
            Placeholder.configure({ placeholder: placeholder ?? "" })
        ],
        content: value,
        contentType: "markdown",
        editable: !disabled,
        editorProps: {
            attributes: {
                class: "doc-prose min-h-20 max-h-80 overflow-y-auto px-3 py-2 focus:outline-none",
                role: "textbox",
                "aria-multiline": "true",
                ...(id === undefined ? {} : { id })
            }
        },
        onUpdate: ({ editor: current }) => {
            onChange(current.isEmpty ? "" : current.getMarkdown().trim());
        }
    });

    useEffect(() => {
        editor?.setEditable(!disabled);
    }, [editor, disabled]);

    useEffect(() => {
        if (editor !== null && value !== (editor.isEmpty ? "" : editor.getMarkdown().trim())) {
            editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
        }
    }, [editor, value]);

    return (
        <div
            className={cn(
                "bg-background focus-within:ring-ring/40 rounded-md border shadow-xs focus-within:ring-2",
                (invalid || (maxLength !== undefined && value.length > maxLength)) && "border-destructive",
                disabled && "opacity-60",
                className
            )}
        >
            {editor === null ? <div className="h-8 border-b" /> : <Toolbar editor={editor} />}
            <EditorContent editor={editor} />
            {maxLength !== undefined && (
                <p
                    className={cn(
                        "px-3 pb-1.5 text-right text-xs",
                        value.length > maxLength ? "text-destructive" : "text-muted-foreground"
                    )}
                >
                    {value.length}/{maxLength}
                </p>
            )}
        </div>
    );
}
