import { Trash2, RefreshCw } from "lucide-react";
import type { MediaAsset } from "./AssetRow";

export function DeleteConfirm({
    asset,
    onCancel,
    onConfirm,
    loading,
}: {
    asset: MediaAsset;
    onCancel: () => void;
    onConfirm: () => void;
    loading: boolean;
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 space-y-4 shadow-2xl">
                <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                        <Trash2 size={16} className="text-red-400" />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-foreground">Delete asset permanently?</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            <span className="font-mono text-foreground/70">{asset.original_filename}</span> will be
                            removed from S3 and the database. This cannot be undone.
                        </p>
                    </div>
                </div>
                <div className="flex gap-3 pt-1">
                    <button
                        onClick={onCancel}
                        disabled={loading}
                        className="flex-1 h-9 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={loading}
                        className="flex-1 h-9 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {loading ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
}
