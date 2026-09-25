"use client";

import { Pencil, Trash2, Music, Clock, Star } from "lucide-react";
import Link from "next/link";
import type { AudioOut } from "@/lib/api";

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

function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
}

export interface AudioCardProps {
    audio: AudioOut;
    onDelete: () => void;
}

export function AudioCard({ audio, onDelete }: AudioCardProps) {
    return (
        <div className="flex items-center gap-4 px-4 py-3 border-b border-border last:border-0 bg-card hover:bg-muted/20 transition-colors group">
            <div className="w-10 h-10 rounded-lg bg-muted overflow-hidden flex items-center justify-center shrink-0 border border-border">
                {audio.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={audio.thumbnail_url} alt={audio.title} className="w-full h-full object-cover" />
                ) : (
                    <Music size={16} className="text-muted-foreground/40" />
                )}
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    {audio.is_featured && (
                        <Star size={10} className="text-amber-400 shrink-0 fill-amber-400" />
                    )}
                    <p className="text-sm font-medium text-foreground truncate">{audio.title}</p>
                </div>
                {audio.artist && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{audio.artist}</p>
                )}
            </div>

            <div className="w-40 shrink-0 min-w-0">
                <p className="text-sm text-foreground truncate">{audio.album || "—"}</p>
            </div>

            <div className="w-24 shrink-0 flex justify-center">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLES[audio.status] ?? "bg-muted text-muted-foreground border-border"}`}>
                    {audio.status}
                </span>
            </div>

            <div className="w-20 shrink-0 flex items-center justify-center gap-1">
                <Link
                    href={`/admin/content/audios/${audio.id}/edit`}
                    className="p-1.5 rounded-md hover:bg-primary/10 hover:text-primary text-muted-foreground transition-colors"
                    title="Edit audio"
                >
                    <Pencil size={13} />
                </Link>
                <button
                    type="button"
                    onClick={onDelete}
                    className="p-1.5 rounded-md hover:bg-red-500/10 hover:text-red-400 text-muted-foreground transition-colors"
                    title="Delete audio"
                >
                    <Trash2 size={13} />
                </button>
            </div>
        </div>
    );
}
