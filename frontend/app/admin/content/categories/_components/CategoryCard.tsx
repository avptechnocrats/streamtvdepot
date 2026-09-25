import Link from "next/link";
import { Pencil, Trash2, FolderOpen, GripVertical } from "lucide-react";
import type { CategoryOut } from "@/lib/api";
import { resolveThumbnailUrl } from "@/lib/media";

const CONTENT_TYPE_COLORS: Record<string, string> = {
    video: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    audio: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    livestream: "bg-red-500/10 text-red-400 border-red-500/20",
    series: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    channel: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

export interface CategoryCardProps {
    category: CategoryOut;
    onDelete: () => void;
    canDrag?: boolean;
    isDragging?: boolean;
    isDragOver?: boolean;
    onDragStart?: () => void;
    onDragOver?: (e: React.DragEvent) => void;
    onDrop?: () => void;
    onDragEnd?: () => void;
}

export function CategoryCard({
    category,
    onDelete,
    canDrag,
    isDragging,
    isDragOver,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
}: CategoryCardProps) {
    const thumbSrc = resolveThumbnailUrl(category);

    const rowClass = [
        "flex items-center gap-4 px-4 py-3 border-b border-border last:border-0 transition-colors",
        isDragging ? "opacity-40" : "",
        isDragOver ? "bg-primary/5 border-t-2 border-t-primary" : "hover:bg-muted/20",
        canDrag ? "cursor-grab active:cursor-grabbing" : "",
    ].join(" ");

    const badgeClass = [
        "hidden sm:block text-[10px] text-center font-semibold px-2 py-0.5 rounded-full w-16 shrink-0",
        category.is_parent
            ? "bg-primary/10 text-primary border border-primary/20"
            : "bg-muted text-muted-foreground border border-border",
    ].join(" ");

    const typeClass = "text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize";

    return (
        <div
            draggable={canDrag}
            onDragStart={canDrag ? onDragStart : undefined}
            onDragOver={
                canDrag
                    ? (e) => { e.preventDefault(); onDragOver?.(e); }
                    : undefined
            }
            onDrop={
                canDrag
                    ? (e) => { e.preventDefault(); onDrop?.(); }
                    : undefined
            }
            onDragEnd={canDrag ? onDragEnd : undefined}
            className={rowClass}
        >
            {canDrag && (
                <div className="w-5 shrink-0 flex items-center justify-center text-muted-foreground/40 hover:text-muted-foreground/70">
                    <GripVertical size={14} />
                </div>
            )}

            <div className="w-10 h-10 rounded-lg overflow-hidden bg-secondary border border-border shrink-0">
                {thumbSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbSrc} alt={category.name} className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
                        <FolderOpen size={14} />
                    </div>
                )}
            </div>

            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{category.name}</p>
                {category.description && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{category.description}</p>
                )}
            </div>

            <p className="hidden sm:block text-xs font-mono text-muted-foreground w-28 truncate shrink-0">
                {category.slug}
            </p>

            <div className="hidden sm:flex items-center w-48 shrink-0">
                {category.content_types?.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                        {category.content_types.map((ct) => (
                            <span key={ct} className={`${typeClass} ${CONTENT_TYPE_COLORS[ct] ?? "bg-muted text-muted-foreground border-border"}`}>{ct}</span>
                        ))}
                    </div>
                ) : (
                    <span className="text-[10px] text-muted-foreground/40">—</span>
                )}
            </div>

            <span className={badgeClass}>
                {category.is_parent ? "Parent" : "Sub"}
            </span>

            {!canDrag && (
                <p className="hidden md:block text-xs text-muted-foreground w-10 text-center shrink-0">
                    {category.sort_order}
                </p>
            )}

            <div className="flex items-center gap-1 w-24 shrink-0 justify-center">
                <Link
                    href={`/admin/content/categories/${category.id}/edit`}
                    className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Edit"
                >
                    <Pencil size={15} color="#2a83e9" />
                </Link>
                <button
                    onClick={onDelete}
                    className="rounded-md p-2 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
                    title="Delete"
                >
                    <Trash2 size={15} color="#fa4b4b" />
                </button>
            </div>
        </div>
    );
}
