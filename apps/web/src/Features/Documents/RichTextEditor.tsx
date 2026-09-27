"use client";

import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor, useEditorState, type ChainedCommands, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
    Bold,
    Code,
    Columns3,
    Heading3,
    Heading4,
    Italic,
    List,
    ListOrdered,
    Minus,
    Pilcrow,
    Quote,
    Redo2,
    Rows3,
    Strikethrough,
    Table,
    Trash2,
    Underline,
    Undo2,
    Unlink
} from "lucide-react";
import type { ReactNode } from "react";
import { LinkTool, safeLink, Tool } from "@/Components/Editor/EditorTools";
import { Separator } from "@/Components/Ui/separator";
import { cn } from "@/Lib/Utils";

function Toolbar({ editor }: { readonly editor: Editor }): ReactNode {
    const state = useEditorState({
        editor,
        selector: ({ editor: current }) => ({
            paragraph: current.isActive("paragraph"),
            h3: current.isActive("heading", { level: 3 }),
            h4: current.isActive("heading", { level: 4 }),
            bold: current.isActive("bold"),
            italic: current.isActive("italic"),
            underline: current.isActive("underline"),
            strike: current.isActive("strike"),
            code: current.isActive("code"),
            bulletList: current.isActive("bulletList"),
            orderedList: current.isActive("orderedList"),
            blockquote: current.isActive("blockquote"),
            link: current.isActive("link"),
            table: current.isActive("table"),
            canUndo: current.can().undo(),
            canRedo: current.can().redo()
        })
    });
    const chain = (): ChainedCommands => editor.chain().focus();

    return (
        <div className="bg-muted/40 sticky top-12 z-10 flex flex-wrap items-center gap-0.5 border-b p-1 backdrop-blur">
            <Tool label="Paragraph" icon={Pilcrow} active={state.paragraph} onClick={() => chain().setParagraph().run()} />
            <Tool label="Heading" icon={Heading3} active={state.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()} />
            <Tool label="Subheading" icon={Heading4} active={state.h4} onClick={() => chain().toggleHeading({ level: 4 }).run()} />
            <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-5" />
            <Tool label="Bold" icon={Bold} active={state.bold} onClick={() => chain().toggleBold().run()} />
            <Tool label="Italic" icon={Italic} active={state.italic} onClick={() => chain().toggleItalic().run()} />
            <Tool label="Underline" icon={Underline} active={state.underline} onClick={() => chain().toggleUnderline().run()} />
            <Tool label="Strikethrough" icon={Strikethrough} active={state.strike} onClick={() => chain().toggleStrike().run()} />
            <Tool label="Inline code" icon={Code} active={state.code} onClick={() => chain().toggleCode().run()} />
            <LinkTool editor={editor} active={state.link} />
            <Tool
                label="Remove link"
                icon={Unlink}
                disabled={!state.link}
                onClick={() => chain().extendMarkRange("link").unsetLink().run()}
            />
            <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-5" />
            <Tool label="Bulleted list" icon={List} active={state.bulletList} onClick={() => chain().toggleBulletList().run()} />
            <Tool label="Numbered list" icon={ListOrdered} active={state.orderedList} onClick={() => chain().toggleOrderedList().run()} />
            <Tool label="Quote" icon={Quote} active={state.blockquote} onClick={() => chain().toggleBlockquote().run()} />
            <Tool label="Divider" icon={Minus} onClick={() => chain().setHorizontalRule().run()} />
            <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-5" />
            <Tool
                label="Insert table"
                icon={Table}
                disabled={state.table}
                onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
            />
            {state.table && (
                <>
                    <Tool label="Add row" icon={Rows3} onClick={() => chain().addRowAfter().run()} />
                    <Tool label="Add column" icon={Columns3} onClick={() => chain().addColumnAfter().run()} />
                    <Tool label="Delete row" icon={Minus} onClick={() => chain().deleteRow().run()} />
                    <Tool label="Delete table" icon={Trash2} onClick={() => chain().deleteTable().run()} />
                </>
            )}
            <div className="ml-auto flex">
                <Tool label="Undo" icon={Undo2} disabled={!state.canUndo} onClick={() => chain().undo().run()} />
                <Tool label="Redo" icon={Redo2} disabled={!state.canRedo} onClick={() => chain().redo().run()} />
            </div>
        </div>
    );
}

interface RichTextEditorProps {
    readonly value: string;
    readonly label: string;
    readonly invalid?: boolean;
    readonly onChange: (html: string) => void;
}

export function RichTextEditor({ value, label, invalid = false, onChange }: RichTextEditorProps): ReactNode {
    const editor = useEditor({
        immediatelyRender: false,
        extensions: [
            StarterKit.configure({
                heading: { levels: [3, 4] },
                link: {
                    openOnClick: false,
                    autolink: true,
                    protocols: ["https", "http", "mailto"],
                    isAllowedUri: (url) => safeLink.test(url)
                }
            }),
            TableKit.configure({ table: { resizable: false } }),
            Placeholder.configure({ placeholder: "Write this section…" })
        ],
        content: value,
        editorProps: {
            attributes: { class: "doc-prose min-h-40 px-4 py-3 focus:outline-none", "aria-label": label, role: "textbox" }
        },
        onUpdate: ({ editor: current }) => {
            onChange(current.isEmpty ? "" : current.getHTML());
        }
    });

    return (
        <div className={cn("bg-background focus-within:ring-ring/40 border focus-within:ring-2", invalid && "border-destructive")}>
            {editor === null ? <div className="bg-muted/40 h-9 border-b" /> : <Toolbar editor={editor} />}
            <EditorContent editor={editor} />
        </div>
    );
}
