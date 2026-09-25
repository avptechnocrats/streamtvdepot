import { Trash2 } from "lucide-react";
import type { VideoOut } from "@/lib/api";

export interface DeleteVideoConfirmProps {
    video: VideoOut;
    onCancel: () => void;
    onConfirm: () => void;
}

export function DeleteVideoConfirm({ video, onCancel, onConfirm }: DeleteVideoConfirmProps) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-2xl border border-border bg-card shadow-2xl p-6 space-y-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 shrink-0 rounded-full bg-red-500/10 flex items-center justify-center">
                        <Trash2 size={18} className="text-red-400" />
                    </div>
                    <h2 className="text-base font-semibold text-foreground">Delete Video</h2>
                </div>
                <div>
                    <p className="text-sm text-muted-foreground mt-1">
                        <span className="text-foreground font-medium">{video.title}</span> will be moved to
                        Trash. You can restore it from the Trash tab.
                    </p>
                </div>
                <div className="flex gap-3 justify-end">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 text-sm font-semibold text-red-400 hover:bg-red-500/20 transition-colors"
                    >
                        <Trash2 size={14} /> Move to Trash
                    </button>
                </div>
            </div>
        </div>
    );
}
