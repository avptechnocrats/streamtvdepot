"use client";

import Link from "next/link";
import { Pencil, Trash2, Clapperboard, BookOpen } from "lucide-react";
import type { SeriesOut } from "@/lib/api";

const STATUS_STYLES: Record<string, string> = {
    published: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    draft: "bg-muted text-muted-foreground border-border",
    archived: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

const ACCESS_STYLES: Record<string, string> = {
    free: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    subscription: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    ppv: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    rental: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

export interface SeriesCardProps {
    series: SeriesOut;
    onDelete: () => void;
}

export function SeriesCard({ series, onDelete }: SeriesCardProps) {
    return (
        <div className="rounded-2xl border border-border bg-card overflow-hidden hover:border-primary/30 transition-colors">
            {/* Thumbnail */}
            <div className="relative h-36 bg-muted/40 overflow-hidden">
                {series.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={series.thumbnail_url} alt={series.title} className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <Clapperboard size={36} className="text-muted-foreground/20" />
                    </div>
                )}
                {/* Featured badge */}
                {series.is_featured && (
                    <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-primary/90 text-primary-foreground text-[10px] font-bold uppercase tracking-wide">
                        Featured
                    </span>
                )}
            </div>

            <div className="p-4 flex flex-col gap-3">
                {/* Title */}
                <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground text-sm leading-snug line-clamp-2">{series.title}</p>
                        {series.genre && (
                            <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{series.genre}</p>
                        )}
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${STATUS_STYLES[series.status] ?? "bg-muted text-muted-foreground border-border"}`}>
                        {series.status}
                    </span>
                </div>

                {/* Metadata row */}
                <div className="flex flex-wrap gap-2 text-[11px]">
                    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${ACCESS_STYLES[series.access_type] ?? "bg-muted text-muted-foreground border-border"}`}>
                        {series.access_type}
                    </span>
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted border border-border text-[11px] text-muted-foreground">
                        <BookOpen size={10} /> {series.total_seasons} season{series.total_seasons !== 1 ? "s" : ""}
                    </span>
                    {series.language && (
                        <span className="px-1.5 py-0.5 rounded bg-muted border border-border text-[11px] text-muted-foreground">
                            {series.language}
                        </span>
                    )}
                </div>

                {series.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{series.description}</p>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1 border-t border-border mt-auto">
                    <Link
                        href={`/admin/content/series/${series.id}/edit`}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary hover:bg-primary/10 hover:text-primary text-xs font-medium text-foreground transition-colors"
                    >
                        <Pencil size={12} /> Edit
                    </Link>
                    <Link
                        href={`/admin/content/series/${series.id}/episodes`}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary hover:bg-blue-500/10 hover:text-blue-400 text-xs font-medium text-foreground transition-colors"
                    >
                        <BookOpen size={12} /> Episodes
                    </Link>
                    <button
                        type="button"
                        onClick={onDelete}
                        className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                        <Trash2 size={12} /> Delete
                    </button>
                </div>
            </div>
        </div>
    );
}
