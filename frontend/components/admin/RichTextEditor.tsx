"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import { Color } from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import CharacterCount from "@tiptap/extension-character-count";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import {
    Bold,
    Italic,
    UnderlineIcon,
    Strikethrough,
    Code,
    Heading1,
    Heading2,
    Heading3,
    List,
    ListOrdered,
    Quote,
    Minus,
    AlignLeft,
    AlignCenter,
    AlignRight,
    AlignJustify,
    Link2,
    Link2Off,
    Undo,
    Redo,
    ImageIcon,
} from "lucide-react";

// ─── Toolbar Button ────────────────────────────────────────────────────────────

function ToolBtn({
    onClick,
    active = false,
    disabled = false,
    title,
    children,
}: {
    onClick: () => void;
    active?: boolean;
    disabled?: boolean;
    title: string;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            title={title}
            className={`h-7 w-7 flex items-center justify-center rounded transition-colors text-xs
        ${active
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }
        ${disabled ? "opacity-40 cursor-not-allowed" : ""}
      `}
        >
            {children}
        </button>
    );
}

function Divider() {
    return <div className="w-px h-5 bg-border mx-0.5 shrink-0" />;
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────

function Toolbar({ editor }: { editor: Editor }) {
    const setLink = () => {
        const prev = editor.getAttributes("link").href as string | undefined;
        const url = window.prompt("URL", prev ?? "https://");
        if (url === null) return;
        if (url === "") {
            editor.chain().focus().extendMarkRange("link").unsetLink().run();
            return;
        }
        editor.chain().focus().extendMarkRange("link").setLink({ href: url, target: "_blank" }).run();
    };

    const addImage = () => {
        const url = window.prompt("Image URL");
        if (url) editor.chain().focus().setImage({ src: url }).run();
    };

    return (
        <div className="flex flex-wrap items-center gap-0.5 p-2 border-b border-border bg-secondary/50 rounded-t-lg">
            {/* History */}
            <ToolBtn onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo">
                <Undo className="h-3.5 w-3.5" />
            </ToolBtn>
            <ToolBtn onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo">
                <Redo className="h-3.5 w-3.5" />
            </ToolBtn>

            <Divider />

            {/* Headings */}
            <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive("heading", { level: 1 })} title="Heading 1">
                <Heading1 className="h-3.5 w-3.5" />
            </ToolBtn>
            <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} title="Heading 2">
                <Heading2 className="h-3.5 w-3.5" />
            </ToolBtn>
            <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })} title="Heading 3">
                <Heading3 className="h-3.5 w-3.5" />
            </ToolBtn>

            <Divider />

            {/* Inline marks */}
            <ToolBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Bold">
                <Bold className="h-3.5 w-3.5" />
            </ToolBtn>
            <ToolBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Italic">
                <Italic className="h-3.5 w-3.5" />
            </ToolBtn>
            <ToolBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Underline">
                <UnderlineIcon className="h-3.5 w-3.5" />
            </ToolBtn>
            <ToolBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")} title="Strikethrough">
                <Strikethrough className="h-3.5 w-3.5" />
            </ToolBtn>
            <ToolBtn onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive("code")} title="Inline code">
                <Code className="h-3.5 w-3.5" />
            </ToolBtn>

            <Divider />

            {/* Alignment */}
            <ToolBtn onClick={() => editor.chain().focus().setTextAlign("left").run()} active={editor.isActive({ textAlign: "left" })} title="Align left">
                <AlignLeft className="h-3.5 w-3.5" />
            </ToolBtn>
            <ToolBtn onClick={() => editor.chain().focus().setTextAlign("center").run()} active={editor.isActive({ textAlign: "center" })} title="Align center">
                <AlignCenter className="h-3.5 w-3.5" />
            </ToolBtn>
            <ToolBtn onClick={() => editor.chain().focus().setTextAlign("right").run()} active={editor.isActive({ textAlign: "right" })} title="Align right">
                <AlignRight className="h-3.5 w-3.5" />
            </ToolBtn>
            <ToolBtn onClick={() => editor.chain().focus().setTextAlign("justify").run()} active={editor.isActive({ textAlign: "justify" })} title="Justify">
                <AlignJustify className="h-3.5 w-3.5" />
            </ToolBtn>

            <Divider />

            {/* Lists */}
            <ToolBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Bullet list">
                <List className="h-3.5 w-3.5" />
            </ToolBtn>
            <ToolBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Numbered list">
                <ListOrdered className="h-3.5 w-3.5" />
            </ToolBtn>

            <Divider />

            {/* Block elements */}
            <ToolBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")} title="Blockquote">
                <Quote className="h-3.5 w-3.5" />
            </ToolBtn>
            <ToolBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal rule">
                <Minus className="h-3.5 w-3.5" />
            </ToolBtn>

            <Divider />

            {/* Link */}
            <ToolBtn onClick={setLink} active={editor.isActive("link")} title="Set link">
                <Link2 className="h-3.5 w-3.5" />
            </ToolBtn>
            <ToolBtn
                onClick={() => editor.chain().focus().unsetLink().run()}
                disabled={!editor.isActive("link")}
                title="Remove link"
            >
                <Link2Off className="h-3.5 w-3.5" />
            </ToolBtn>

            {/* Image */}
            <ToolBtn onClick={addImage} title="Insert image">
                <ImageIcon className="h-3.5 w-3.5" />
            </ToolBtn>

            {/* Text colour */}
            <Divider />
            <label title="Text colour" className="h-7 w-7 flex items-center justify-center rounded cursor-pointer hover:bg-secondary">
                <span className="text-xs font-bold text-foreground" style={{ textDecoration: "underline" }}>A</span>
                <input
                    type="color"
                    className="sr-only"
                    onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
                />
            </label>
        </div>
    );
}

// ─── Main component ────────────────────────────────────────────────────────────

interface RichTextEditorProps {
    value: string;
    onChange: (html: string) => void;
    placeholder?: string;
    minHeight?: number;
    maxChars?: number;
    disabled?: boolean;
}

export function RichTextEditor({
    value,
    onChange,
    placeholder = "Start writing...",
    minHeight = 320,
    maxChars,
    disabled = false,
}: RichTextEditorProps) {
    const [mounted, setMounted] = useState(false);
    const prevValueRef = useRef(value);

    useEffect(() => { setMounted(true); }, []);

    const editor = useEditor({
        extensions: [
            StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5, 6] } }),
            Underline,
            Link.configure({ openOnClick: false, autolink: true }),
            TextAlign.configure({ types: ["heading", "paragraph"] }),
            TextStyle,
            Color,
            Placeholder.configure({ placeholder }),
            Image.configure({ inline: false }),
            Subscript,
            Superscript,
            ...(maxChars ? [CharacterCount.configure({ limit: maxChars })] : []),
        ],
        content: value,
        editable: !disabled,
        onUpdate({ editor }) {
            prevValueRef.current = editor.getHTML();
            onChange(editor.getHTML());
        },
        editorProps: {
            attributes: {
                class: "prose prose-sm dark:prose-invert max-w-none focus:outline-none px-4 py-3",
                style: `min-height: ${minHeight}px`,
            },
        },
        immediatelyRender: false,
    });

    // Sync external value changes (e.g. when loading edit data for edit mode)
    useEffect(() => {
        if (!editor || editor.isDestroyed) return;
        if (value !== prevValueRef.current && !editor.isFocused) {
            prevValueRef.current = value;
            editor.commands.setContent(value, { emitUpdate: false });
        }
    }, [editor, value]);

    const charCount = editor?.storage?.characterCount?.characters?.() ?? null;
    const wordCount = editor?.storage?.characterCount?.words?.() ?? null;

    if (!mounted) {
        return (
            <div
                className="rounded-lg border border-border bg-secondary animate-pulse"
                style={{ minHeight: minHeight }}
            />
        );
    }

    return (
        <div className={`rounded-lg border border-border overflow-hidden ${disabled ? "opacity-60 pointer-events-none" : ""}`}>
            {editor && <Toolbar editor={editor} />}
            <EditorContent editor={editor} />
            {(maxChars || wordCount !== null) && (
                <div className="flex items-center justify-end gap-3 px-3 py-1.5 border-t border-border bg-secondary/30 text-[11px] text-muted-foreground">
                    {wordCount !== null && <span>{wordCount} words</span>}
                    {maxChars && charCount !== null && (
                        <span className={charCount >= maxChars ? "text-red-400" : ""}>
                            {charCount} / {maxChars} chars
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}
