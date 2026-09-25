import { RotateCcw, Trash2 } from "lucide-react";
import type { VideoOut } from "@/lib/api";

export interface TrashVideoCardProps {
    video: VideoOut;
    onRestore: () => void;
    onDeleteForever: () => void;
}

export function TrashVideoCard({ video, onRestore, onDeleteForever }: TrashVideoCardProps) {
    return (
        <div className="rounded-2xl border border-border bg-card p-4 flex items-center gap-4 opacity-70 hover:opacity-90 transition-opacity">
            {/* Thumbnail */}
            <div className="w-16 h-16 rounded-lg bg-muted/40 overflow-hidden shrink-0">
                {video.thumbnails.video_w_thumbnail ? (
                    <img
                        src={video.thumbnails.video_w_thumbnail}
                        alt={video.title}
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <svg className="w-6 h-6 text-muted-foreground/30" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                        </svg>
                    </div>
                )}
            </div>

            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground line-through truncate">{video.title}</p>
                <p className="text-[10px] text-muted-foreground font-mono truncate mt-0.5">{video.slug}</p>
                {video.categories?.length > 0 && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">{video.categories.join(", ")}</p>
                )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
                <button
                    onClick={onRestore}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                >
                    <RotateCcw size={12} /> Restore
                </button>
                <button
                    onClick={onDeleteForever}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                >
                    <Trash2 size={12} /> Delete Forever
                </button>
            </div>
        </div>
    );
}
