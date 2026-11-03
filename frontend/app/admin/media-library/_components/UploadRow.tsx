"use client";

import { ImageIcon, Film, Music, X, RotateCcw, AlertTriangle, Clock, Loader2 } from "lucide-react";
import { formatBytes } from "./AssetRow";
import type { UploadItem } from "./useUploadQueue";

const STAGE_LABEL: Record<UploadItem["stage"], string> = {
    preparing: "Preparing",
    uploading: "Uploading",
    completing: "Finalizing",
    registering: "Registering",
};

function formatEta(seconds: number | null): string {
    if (seconds == null || !Number.isFinite(seconds)) return "";
    const rounded = Math.max(Math.round(seconds), 0);
    const hours = Math.floor(rounded / 3600);
    const mins = Math.floor((rounded % 3600) / 60);
    const secs = rounded % 60;
    if (hours > 0) return `${hours}h ${mins}m left`;
    return mins > 0 ? `${mins}m ${secs}s left` : `${secs}s left`;
}

function typeLabel(contentType: string): string {
    return contentType.split("/")[1]?.toUpperCase() ?? contentType;
}

function ItemIcon({ item }: { item: UploadItem }) {
    if (item.previewUrl) {
        // eslint-disable-next-line @next/next/no-img-element
        return <img src={item.previewUrl} alt={item.file.name} className="w-full h-full object-cover" />;
    }
    if (item.file.type.startsWith("video/")) return <Film size={18} className="text-blue-400 opacity-70" />;
    if (item.file.type.startsWith("audio/")) return <Music size={18} className="text-purple-400 opacity-70" />;
    return <ImageIcon size={18} className="text-muted-foreground opacity-70" />;
}

function ProgressBar({ item }: { item: UploadItem }) {
    const percent = Math.min(Math.max(item.percent, 0), 100);
    const failed = item.status === "failed";
    return (
        <div className="flex items-center gap-2 w-full">
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                    className={`h-full rounded-full transition-[width] duration-150 ${failed ? "bg-red-400/70" : "bg-primary"}`}
                    style={{ width: `${percent}%` }}
                />
            </div>
            <span className="w-11 shrink-0 text-right text-[11px] font-semibold tabular-nums text-foreground">
                {percent.toFixed(percent >= 100 ? 0 : 1)}%
            </span>
        </div>
    );
}

interface UploadRowProps {
    item: UploadItem;
    onCancel: () => void;
    onRetry: () => void;
}

export function UploadRow({ item, onCancel, onRetry }: UploadRowProps) {
    const { file, status } = item;

    let subline: React.ReactNode;
    if (status === "failed") {
        subline = (
            <span className="text-red-300" title={item.error}>
                {item.error ?? "Upload failed"}
            </span>
        );
    } else if (status === "queued") {
        subline = <span>Draft · starts automatically when a slot is free</span>;
    } else {
        const parts = [
            STAGE_LABEL[item.stage],
            item.stage === "uploading" ? `${formatBytes(item.uploadedBytes)} of ${formatBytes(file.size)}` : null,
            item.stage === "uploading" && item.bytesPerSecond > 0 ? `${formatBytes(item.bytesPerSecond)}/s` : null,
            item.stage === "uploading" ? formatEta(item.etaSeconds) : null,
        ].filter(Boolean);
        subline = <span>{parts.join(" · ")}</span>;
    }

    return (
        <div className="flex items-center gap-4 px-4 py-3 border-b border-border bg-primary/[0.03]">
            {/* Thumbnail / type icon */}
            <div className="w-10 h-10 shrink-0 rounded-lg overflow-hidden bg-secondary border border-border flex items-center justify-center">
                <ItemIcon item={item} />
            </div>

            {/* Filename + live status line (progress bar shown here on narrow screens) */}
            <div className="flex-1 min-w-0 space-y-1">
                <p className="text-sm font-medium text-foreground truncate" title={file.name}>{file.name}</p>
                <p className="text-xs text-muted-foreground truncate">{subline}</p>
                {status !== "queued" && (
                    <div className="md:hidden">
                        <ProgressBar item={item} />
                    </div>
                )}
            </div>

            {/* Type */}
            <div className="hidden sm:flex w-16 shrink-0">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground">
                    {typeLabel(file.type)}
                </span>
            </div>

            {/* Size */}
            <p className="hidden sm:block w-20 shrink-0 text-sm text-muted-foreground">{formatBytes(file.size)}</p>

            {/* Progress column (replaces Dimensions + Uploaded) */}
            <div className="hidden md:flex md:w-24 lg:w-[14rem] shrink-0 items-center">
                {status === "queued" ? (
                    <span className="text-xs text-muted-foreground">—</span>
                ) : (
                    <ProgressBar item={item} />
                )}
            </div>

            {/* Status */}
            <div className="hidden sm:flex w-20 shrink-0 justify-start">
                {status === "failed" ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/10 text-red-300 inline-flex items-center gap-1">
                        <AlertTriangle size={10} /> Failed
                    </span>
                ) : status === "queued" ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground inline-flex items-center gap-1">
                        <Clock size={10} /> Draft
                    </span>
                ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary inline-flex items-center gap-1">
                        <Loader2 size={10} className="animate-spin" /> Active
                    </span>
                )}
            </div>

            {/* Actions */}
            <div className="w-24 shrink-0 flex items-center gap-1 justify-end">
                {status === "failed" && (
                    <button
                        onClick={onRetry}
                        title="Retry upload"
                        className="w-7 h-7 rounded-md flex items-center justify-center text-amber-300 hover:text-amber-200 hover:bg-amber-500/10 transition-colors"
                    >
                        <RotateCcw size={14} />
                    </button>
                )}
                <button
                    onClick={onCancel}
                    title={status === "failed" ? "Dismiss" : "Cancel upload"}
                    className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                    <X size={14} />
                </button>
            </div>
        </div>
    );
}
