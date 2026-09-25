"use client";

import { useState } from "react";
import { X, Download, ImageIcon, Film, Music, ExternalLink, Trash2, Copy, Check } from "lucide-react";
import { formatBytes, formatDate } from "./AssetRow";
import type { MediaAsset } from "./AssetRow";

// ─── Full-size image with loading state ───────────────────────────────────────

function PreviewImage({ src, alt }: { src: string; alt: string }) {
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState(false);

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground py-16">
                <ImageIcon size={40} className="opacity-30" />
                <p className="text-sm">Failed to load image</p>
            </div>
        );
    }

    return (
        <div className="relative flex items-center justify-center min-h-[200px]">
            {!loaded && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-8 h-8 rounded-full border-2 border-border border-t-primary animate-spin" />
                </div>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={src}
                alt={alt}
                onLoad={() => setLoaded(true)}
                onError={() => setError(true)}
                className={`max-w-full max-h-[60vh] rounded-lg object-contain transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
            />
        </div>
    );
}

// ─── PreviewModal ─────────────────────────────────────────────────────────────

interface PreviewModalProps {
    asset: MediaAsset;
    onClose: () => void;
    onDelete: () => void;
}

export function PreviewModal({ asset, onClose, onDelete }: PreviewModalProps) {
    const src = asset.display_url ?? asset.url;
    const isImage = asset.content_type?.startsWith("image/");
    const isVideo = asset.content_type?.startsWith("video/");
    const isAudio = asset.content_type?.startsWith("audio/");
    const [copied, setCopied] = useState(false);

    function copyUrl() {
        navigator.clipboard.writeText(src).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        });
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                        {isVideo && <Film size={15} className="text-blue-400 shrink-0" />}
                        {isAudio && <Music size={15} className="text-purple-400 shrink-0" />}
                        {isImage && <ImageIcon size={15} className="text-muted-foreground shrink-0" />}
                        <p className="text-sm font-semibold text-foreground truncate">{asset.original_filename}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0 ml-3"
                    >
                        <X size={14} />
                    </button>
                </div>

                {/* Preview area */}
                <div className="p-5 bg-black/20 flex-1 min-h-0">
                    {isImage && <PreviewImage src={src} alt={asset.original_filename} />}

                    {isVideo && (
                        <video
                            src={src}
                            controls
                            className="w-full max-h-[60vh] rounded-lg"
                        />
                    )}

                    {isAudio && (
                        <div className="flex flex-col items-center justify-center gap-6 py-10">
                            <div className="w-20 h-20 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                                <Music size={32} className="text-purple-400" />
                            </div>
                            <audio src={src} controls className="w-full" />
                        </div>
                    )}

                    {!isImage && !isVideo && !isAudio && (
                        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
                            <ImageIcon size={40} className="opacity-20" />
                            <p className="text-sm">No preview available for this file type</p>
                        </div>
                    )}
                </div>

                {/* Metadata + actions footer */}
                <div className="px-5 py-4 border-t border-border bg-card flex flex-col sm:flex-row sm:items-center gap-4 shrink-0">
                    {/* Meta */}
                    <div className="flex-1 min-w-0 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 text-xs text-muted-foreground">
                        <div>
                            <span className="text-foreground/50 uppercase tracking-wider text-[10px] font-semibold">Size</span>
                            <p className="mt-0.5 text-foreground">{formatBytes(asset.file_size)}</p>
                        </div>
                        {asset.width && asset.height && (
                            <div>
                                <span className="text-foreground/50 uppercase tracking-wider text-[10px] font-semibold">Dimensions</span>
                                <p className="mt-0.5 text-foreground">{asset.width}×{asset.height}</p>
                            </div>
                        )}
                        <div>
                            <span className="text-foreground/50 uppercase tracking-wider text-[10px] font-semibold">Uploaded</span>
                            <p className="mt-0.5 text-foreground">{formatDate(asset.created_at)}</p>
                        </div>
                        {asset.in_use && (
                            <div className="col-span-2 sm:col-span-1">
                                <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary">
                                    In Use
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 shrink-0">
                        <a
                            href={src}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                            <ExternalLink size={12} /> Open
                        </a>
                        <button
                            onClick={copyUrl}
                            className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                            {copied ? <Check size={12} className="text-primary" /> : <Copy size={12} />}
                            {copied ? "Copied!" : "Copy URL"}
                        </button>
                        <a
                            href={src}
                            download={asset.original_filename}
                            className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                            <Download size={12} /> Download
                        </a>
                        {!asset.in_use && (
                            <button
                                onClick={() => { onClose(); onDelete(); }}
                                className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-red-600/10 border border-red-500/20 text-xs text-red-400 hover:bg-red-600 hover:text-white transition-colors"
                            >
                                <Trash2 size={12} /> Delete
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
