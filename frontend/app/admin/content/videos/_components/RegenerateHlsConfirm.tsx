import { RotateCcw } from "lucide-react";
import type { VideoOut } from "@/lib/api";

export interface RegenerateHlsConfirmProps {
    video: VideoOut;
    onCancel: () => void;
    onConfirm: () => void;
}

export function RegenerateHlsConfirm({ video, onCancel, onConfirm }: RegenerateHlsConfirmProps) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-2xl border border-border bg-card shadow-2xl p-6 space-y-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 shrink-0 rounded-full bg-amber-500/10 flex items-center justify-center">
                        <RotateCcw size={18} className="text-amber-400" />
                    </div>
                    <h2 className="text-base font-semibold text-foreground">Regenerate HLS</h2>
                </div>
                <div>
                    <p className="text-sm text-muted-foreground mt-1">
                        Regeneration of <span className="text-foreground font-medium">{video.title}</span> will start afresh. Existing HLS progress will be removed.
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">
                        Are you sure you want to regenerate it again?
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
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/10 text-sm font-semibold text-amber-400 hover:bg-amber-500/20 transition-colors"
                    >
                        <RotateCcw size={14} /> Regenerate
                    </button>
                </div>
            </div>
        </div>
    );
}
