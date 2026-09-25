"use client";

import { useState } from "react";
import { ImageIcon, Film, Music, Trash2, Eye, Copy, Check, RotateCcw, AlertTriangle } from "lucide-react";

export interface MediaAsset {
    id: string;
    original_filename: string;
    url: string;
    display_url: string | null;
    content_type: string | null;
    file_size: number | null;
    width: number | null;
    height: number | null;
    created_at: string;
    in_use: boolean;
    upload_status?: "success" | "failed";
    uploaded_bytes?: number;
    remaining_bytes?: number;
    failed_error?: string;
    failed_at?: string;
    retrying?: boolean;
    retry_source_file_key?: string;
}

export function formatBytes(bytes: number | null): string {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

function MediaTypeIcon({ contentType }: { contentType: string | null }) {
    if (contentType?.startsWith("video/")) return <Film size={18} className="text-blue-400 opacity-70" />;
    if (contentType?.startsWith("audio/")) return <Music size={18} className="text-purple-400 opacity-70" />;
    return <ImageIcon size={18} className="text-muted-foreground opacity-70" />;
}

function typeLabel(contentType: string | null): string {
    if (!contentType) return "—";
    const parts = contentType.split("/");
    return parts[1]?.toUpperCase() ?? contentType;
}

// ─── Thumbnail with loading skeleton ─────────────────────────────────────────

function AssetThumbnail({ asset }: { asset: MediaAsset }) {
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState(false);
    const isImage = asset.content_type?.startsWith("image/");
    const src = asset.display_url ?? asset.url;

    if (!isImage || error) {
        return <MediaTypeIcon contentType={asset.content_type} />;
    }

    return (
        <div className="relative w-full h-full">
            {!loaded && (
                <div className="absolute inset-0 rounded-lg bg-muted animate-pulse" />
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={src}
                alt={asset.original_filename}
                onLoad={() => setLoaded(true)}
                onError={() => setError(true)}
                className={`w-full h-full object-cover transition-opacity duration-200 ${loaded ? "opacity-100" : "opacity-0"}`}
            />
        </div>
    );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

interface AssetRowProps {
    asset: MediaAsset;
    onRetry?: () => void;
    onPreview: () => void;
    onDelete: () => void;
}

export function AssetRow({ asset, onRetry, onPreview, onDelete }: AssetRowProps) {
    const [copied, setCopied] = useState(false);

    const displaySrc = asset.display_url ?? asset.url;

    function copyUrl() {
        navigator.clipboard.writeText(displaySrc).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        });
    }
    return (
        <div className="flex items-center gap-4 px-4 py-3 border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
            {/* Thumbnail with skeleton loader */}
            <div className="w-10 h-10 shrink-0 rounded-lg overflow-hidden bg-secondary border border-border flex items-center justify-center">
                <AssetThumbnail asset={asset} />
            </div>

            {/* Filename + mime type */}
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{asset.original_filename}</p>
                {asset.upload_status === "failed" ? (
                    <p className="text-xs text-red-300 truncate">
                        Uploaded {formatBytes(asset.uploaded_bytes ?? 0)} · Remaining {formatBytes(asset.remaining_bytes ?? 0)}
                    </p>
                ) : (
                    <p className="text-xs text-muted-foreground truncate">{asset.content_type ?? "—"}</p>
                )}
            </div>

            {/* File type pill */}
            <div className="hidden sm:flex w-16 shrink-0">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground">
                    {typeLabel(asset.content_type)}
                </span>
            </div>

            {/* Size */}
            <p className="hidden sm:block w-20 shrink-0 text-sm text-muted-foreground">
                {asset.upload_status === "failed"
                    ? `${formatBytes(asset.uploaded_bytes ?? 0)} / ${formatBytes(asset.file_size)}`
                    : formatBytes(asset.file_size)}
            </p>

            {/* Dimensions */}
            <p className="hidden md:block w-24 shrink-0 text-sm text-muted-foreground">
                {asset.width && asset.height ? `${asset.width}×${asset.height}` : "—"}
            </p>

            {/* Upload date */}
            <p className="hidden lg:block w-28 shrink-0 text-sm text-muted-foreground">
                {formatDate(asset.created_at)}
            </p>

            {/* In-use badge */}
            <div className="hidden sm:flex w-16 shrink-0 justify-start">
                {asset.upload_status === "failed" ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/10 text-red-300 inline-flex items-center gap-1">
                        <AlertTriangle size={10} /> Failed
                    </span>
                ) : asset.in_use ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary">
                        In Use
                    </span>
                ) : null}
            </div>

            {/* Actions */}
            <div className="w-24 shrink-0 flex items-center gap-1 justify-end">
                {asset.upload_status === "failed" && onRetry && (
                    <button
                        onClick={onRetry}
                        disabled={asset.retrying}
                        title="Retry upload"
                        className="w-7 h-7 rounded-md flex items-center justify-center text-amber-300 hover:text-amber-200 hover:bg-amber-500/10 transition-colors disabled:opacity-50"
                    >
                        <RotateCcw size={14} className={asset.retrying ? "animate-spin" : ""} />
                    </button>
                )}
                <button
                    onClick={onPreview}
                    disabled={asset.upload_status === "failed"}
                    title="Preview"
                    className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    <Eye size={14} />
                </button>
                <button
                    onClick={copyUrl}
                    disabled={asset.upload_status === "failed"}
                    title="Copy URL"
                    className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    {copied ? <Check size={14} className="text-primary" /> : <Copy size={14} />}
                </button>
                {!asset.in_use ? (
                    <button
                        onClick={onDelete}
                        title="Delete permanently"
                        className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                        <Trash2 size={14} />
                    </button>
                ) : (
                    <div className="w-7 h-7" />
                )}
            </div>
        </div>
    );
}
