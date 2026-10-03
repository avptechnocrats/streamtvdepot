"use client";

import { Film, Info, Pencil, RotateCcw, Trash2 } from "lucide-react";
import type { DemoContentItem, DemoContentType } from "@/lib/api";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface ContentTabProps {
    contentType: DemoContentType;
    items: DemoContentItem[];
    deletingId: string | null;
    onAdd: () => void;
    onEdit: (item: DemoContentItem) => void;
    onDelete: (id: string) => void;
    onTranscode: (item: DemoContentItem) => void;
}

function formatDuration(seconds: number | null) {
    if (!seconds) return "—";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    return hours > 0
        ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`
        : `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function Thumbnail({ url, title }: { url: string | null; title: string }) {
    return url
        ? <img src={url} alt={title} className="w-14 h-9 object-cover rounded border border-border" />
        : <div className="w-14 h-9 rounded border border-border bg-surface-hover flex items-center justify-center">
            <Film size={12} className="text-muted-foreground" />
        </div>;
}

function SelectionSummary({ values, label }: { values: string[]; label: string }) {
    if (!values.length) return <span className="text-muted-foreground text-xs">—</span>;
    return (
        <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-muted-foreground truncate">{values[0]}</span>
            {values.length > 1 && (
                <Popover>
                    <PopoverTrigger asChild>
                        <button type="button" className="shrink-0 rounded p-0.5 text-muted-foreground/60 hover:text-foreground hover:bg-surface-hover transition-colors" title={`View all ${label.toLowerCase()}`}>
                            <Info size={13} />
                        </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" sideOffset={8} className="w-56 p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">{label}</p>
                        <div className="space-y-1">
                            {values.map(value => <p key={value} className="text-xs text-foreground break-words">{value}</p>)}
                        </div>
                    </PopoverContent>
                </Popover>
            )}
        </div>
    );
}

export function ContentTab({ contentType, items, deletingId, onAdd, onEdit, onDelete, onTranscode }: ContentTabProps) {
    if (!items.length) {
        return (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                <Film size={36} className="opacity-20" />
                <p className="text-sm">No {contentType.replace("_", " ")} content yet.</p>
                <button onClick={onAdd} className="text-sm text-primary hover:underline">Add the first item</button>
            </div>
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-border text-left">
                        {["", "Title", "Language", "Duration", "Categories", "Transcode", "Status", "Featured", ""].map((header, index) => (
                            <th key={index} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{header}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {items.map(item => (
                        <tr key={item.id} className="border-b border-border/50 hover:bg-surface-hover/30 transition-colors">
                            <td className="px-4 py-3"><Thumbnail url={item.thumbnail_url} title={item.title} /></td>
                            <td className="px-4 py-3">
                                <p className="font-medium text-foreground">{item.title}</p>
                                {item.short_description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{item.short_description}</p>}
                            </td>
                            <td className="px-4 py-3 max-w-40"><SelectionSummary values={item.language?.split(", ").filter(Boolean) ?? []} label="Languages" /></td>
                            <td className="px-4 py-3 text-muted-foreground">{formatDuration(item.duration_seconds)}</td>
                            <td className="px-4 py-3 max-w-40"><SelectionSummary values={(item.categories ?? []).map(category => category.name)} label="Categories" /></td>
                            <td className="px-4 py-3">
                                {item.content_type === "video" ? (
                                    <div className="space-y-1">
                                        <button
                                            type="button"
                                            disabled={!item.stream_s3_key || item.transcode_status === "pending" || item.transcode_status === "processing"}
                                            onClick={() => onTranscode(item)}
                                            title={item.stream_s3_key ? "Create or restart shared HLS output" : "Upload a demo video file before transcoding"}
                                            className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:border-border disabled:text-muted-foreground transition-colors"
                                        >
                                            <RotateCcw size={12} className={item.transcode_status === "pending" || item.transcode_status === "processing" ? "animate-spin" : ""} />
                                            {item.transcode_status === "complete" ? "Restart" : "Transcode"}
                                        </button>
                                        {item.transcode_status && (
                                            <p className={`text-[10px] font-medium ${item.transcode_status === "failed" ? "text-red-400" : item.transcode_status === "complete" ? "text-emerald-400" : "text-muted-foreground"}`}>
                                                {item.transcode_status === "processing" && item.transcode_progress != null
                                                    ? `Processing ${item.transcode_progress}%`
                                                    : item.transcode_status === "pending" ? "Queued"
                                                    : item.transcode_status === "complete" ? "Complete"
                                                    : "Failed"}
                                            </p>
                                        )}
                                    </div>
                                ) : <span className="text-muted-foreground text-xs">—</span>}
                            </td>
                            <td className="px-4 py-3">
                                <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded border ${item.status === "published" ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" : "text-amber-400 bg-amber-400/10 border-amber-400/20"}`}>
                                    {item.status}
                                </span>
                            </td>
                            <td className="px-4 py-3">
                                {item.is_featured
                                    ? <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">Featured</span>
                                    : <span className="text-muted-foreground text-xs">—</span>}
                            </td>
                            <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                    <button onClick={() => onEdit(item)} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors" title="Edit content">
                                        <Pencil size={13} />
                                    </button>
                                    <button onClick={() => onDelete(item.id)} disabled={deletingId === item.id} className="p-1.5 rounded text-muted-foreground hover:text-red-500 hover:bg-red-500/10 disabled:opacity-40 transition-colors" title="Delete content">
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
