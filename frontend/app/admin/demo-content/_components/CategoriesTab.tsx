"use client";

import { Film, GripVertical, Music, Pencil, Radio, Tag, Trash2, Tv } from "lucide-react";
import { useState } from "react";
import type { DemoCategoryOut } from "@/lib/api";

interface CategoriesTabProps {
    categories: DemoCategoryOut[];
    deletingId: string | null;
    onAdd: () => void;
    onEdit: (category: DemoCategoryOut) => void;
    onDelete: (id: string) => void;
    onReorder: (categories: DemoCategoryOut[]) => Promise<void>;
}

function Thumbnail({ url, title }: { url: string | null; title: string }) {
    return url
        ? <img src={url} alt={title} className="w-14 h-9 object-cover rounded border border-border" />
        : <div className="w-14 h-9 rounded border border-border bg-surface-hover flex items-center justify-center">
            <Tag size={12} className="text-muted-foreground" />
        </div>;
}

function CategoryIcon({ contentType }: { contentType: string | null }) {
    switch (contentType) {
        case "video": return <Film size={13} className="text-blue-400" />;
        case "audio": return <Music size={13} className="text-green-400" />;
        case "series": return <Tv size={13} className="text-purple-400" />;
        case "live_stream": return <Radio size={13} className="text-red-400" />;
        default: return <Tag size={13} className="text-muted-foreground" />;
    }
}

export function CategoriesTab({ categories, deletingId, onAdd, onEdit, onDelete, onReorder }: CategoriesTabProps) {
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [dragOverId, setDragOverId] = useState<string | null>(null);
    const [reordering, setReordering] = useState(false);
    const [reorderError, setReorderError] = useState<string | null>(null);
    const orderedCategories = [...categories].sort((a, b) => a.sort_order - b.sort_order);

    async function handleDrop(dropId: string) {
        if (!draggingId || draggingId === dropId) {
            setDraggingId(null);
            setDragOverId(null);
            return;
        }

        const sourceIndex = orderedCategories.findIndex(category => category.id === draggingId);
        const targetIndex = orderedCategories.findIndex(category => category.id === dropId);
        if (sourceIndex < 0 || targetIndex < 0) return;

        const reordered = [...orderedCategories];
        const [moved] = reordered.splice(sourceIndex, 1);
        reordered.splice(targetIndex, 0, moved);
        const nextOrder = reordered.map((category, index) => ({ ...category, sort_order: index }));

        setDraggingId(null);
        setDragOverId(null);
        setReordering(true);
        setReorderError(null);
        try {
            await onReorder(nextOrder);
        } catch {
            setReorderError("Could not save the category order.");
        } finally {
            setReordering(false);
        }
    }

    if (!categories.length) {
        return (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                <Tag size={36} className="opacity-20" />
                <p className="text-sm">No demo categories yet.</p>
                <button onClick={onAdd} className="text-sm text-primary hover:underline">Add the first category</button>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <p className="px-4 text-xs text-muted-foreground flex items-center gap-1.5">
                <GripVertical size={12} className="opacity-60" />
                Drag categories to reorder. Changes save automatically.
            </p>
            {reorderError && <p className="px-4 text-sm text-red-500">{reorderError}</p>}
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-border text-left">
                            {['', 'Thumbnail', 'Name', 'Slug', 'Type', 'Status', 'Sort', 'Description', ''].map((header, index) => (
                                <th key={index} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{header}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {orderedCategories.map(category => (
                            <tr
                                key={category.id}
                                draggable={!reordering}
                                onDragStart={() => setDraggingId(category.id)}
                                onDragOver={event => { event.preventDefault(); setDragOverId(category.id); }}
                                onDrop={() => void handleDrop(category.id)}
                                onDragEnd={() => { setDraggingId(null); setDragOverId(null); }}
                                className={`border-b border-border/50 transition-colors ${draggingId === category.id ? "opacity-40" : "hover:bg-surface-hover/30"} ${dragOverId === category.id ? "bg-primary/5 border-t-2 border-t-primary" : ""} ${reordering ? "cursor-wait" : "cursor-grab active:cursor-grabbing"}`}
                            >
                                <td className="px-2 py-3 text-muted-foreground/50"><GripVertical size={15} /></td>
                                <td className="px-4 py-3"><Thumbnail url={category.thumbnail_url} title={category.name} /></td>
                                <td className="px-4 py-3 font-medium text-foreground">
                                    <div className="flex items-center gap-2">
                                        <CategoryIcon contentType={category.content_type} />
                                        {category.name}
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{category.slug}</td>
                                <td className="px-4 py-3 text-muted-foreground">{category.content_type ?? "All"}</td>
                                <td className="px-4 py-3">
                                    <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded border ${category.status === "published" ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" : "text-amber-400 bg-amber-400/10 border-amber-400/20"}`}>
                                        {category.status}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-muted-foreground">{category.sort_order}</td>
                                <td className="px-4 py-3 text-muted-foreground text-xs max-w-xs truncate">{category.description ?? "—"}</td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => onEdit(category)} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors" title="Edit category">
                                            <Pencil size={13} />
                                        </button>
                                        <button onClick={() => onDelete(category.id)} disabled={deletingId === category.id} className="p-1.5 rounded text-muted-foreground hover:text-red-500 hover:bg-red-500/10 disabled:opacity-40 transition-colors" title="Delete category">
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
