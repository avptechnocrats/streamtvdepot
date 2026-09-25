"use client";

import { useEffect, useRef, useState } from "react";
import { X, Copy, Check, ExternalLink, ShieldCheck, ShieldOff, AlertTriangle, RotateCcw, Loader2 } from "lucide-react";
import VideoPlayer from "@/components/VideoPlayer";

interface VideoPreviewModalProps {
    videoId: string;
    title: string;
    hlsUrl: string | null;
    drmEnabled: boolean;
    drmKeyToken?: string;
    poster?: string | null;
    onClose: () => void;
    onRegenerateHls?: () => void | Promise<void>;
}

export default function VideoPreviewModal({
    videoId,
    title,
    hlsUrl,
    drmEnabled,
    drmKeyToken,
    poster,
    onClose,
    onRegenerateHls,
}: VideoPreviewModalProps) {
    const overlayRef = useRef<HTMLDivElement>(null);
    const [copied, setCopied] = useState(false);
    const [posterReady, setPosterReady] = useState(!poster);
    const [playError, setPlayError] = useState<string | null>(null);
    const [regenerating, setRegenerating] = useState(false);

    // Close on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [onClose]);

    // Prevent body scroll
    useEffect(() => {
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = ""; };
    }, []);

    const handleCopy = async () => {
        if (!hlsUrl) return;
        await navigator.clipboard.writeText(hlsUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleRegenerate = async () => {
        if (!onRegenerateHls) return;
        setRegenerating(true);
        try {
            await onRegenerateHls();
            onClose();
        } finally {
            setRegenerating(false);
        }
    };

    return (
        <div
            ref={overlayRef}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
        >
            <div className="relative w-full max-w-3xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col">

                {/* ── Header ── */}
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <span className="font-semibold text-sm text-foreground truncate">{title}</span>
                        {drmEnabled ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
                                <ShieldCheck size={9} /> AES-128
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border shrink-0">
                                <ShieldOff size={9} /> Clear
                            </span>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="shrink-0 ml-3 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* ── Player ── */}
                <div className="relative bg-black">
                    {/* Skeleton shown until poster image is ready */}
                    {!posterReady && (
                        <div className="absolute inset-0 z-10 aspect-video bg-muted animate-pulse" />
                    )}
                    {/* Hidden preloader to detect poster load */}
                    {poster && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={poster}
                            alt=""
                            aria-hidden
                            onLoad={() => setPosterReady(true)}
                            className="hidden"
                        />
                    )}
                    {hlsUrl ? (
                        playError ? (
                            /* ── Playback error overlay ── */
                            <div className="aspect-video flex flex-col items-center justify-center gap-3 text-muted-foreground px-6">
                                <AlertTriangle size={32} className="text-amber-400 opacity-80" />
                                <p className="text-sm font-medium text-foreground text-center">
                                    This video could not be played
                                </p>
                                <p className="text-xs text-center opacity-60 max-w-xs">
                                    The HLS stream may be missing or corrupted. Regenerating will re-submit
                                    a MediaConvert job and rebuild the HLS output.
                                </p>
                                {onRegenerateHls && (
                                    <button
                                        onClick={handleRegenerate}
                                        disabled={regenerating}
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {regenerating
                                            ? <><Loader2 size={14} className="animate-spin" /> Queuing…</>
                                            : <><RotateCcw size={14} /> Regenerate HLS</>}
                                    </button>
                                )}
                                <button
                                    onClick={() => setPlayError(null)}
                                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                                >
                                    Try again
                                </button>
                            </div>
                        ) : (
                            <VideoPlayer
                                src={hlsUrl}
                                videoId={videoId}
                                drmKeyToken={drmKeyToken}
                                poster={poster ?? undefined}
                                autoPlay={false}
                                onError={(msg) => setPlayError(msg)}
                                skipSeconds={10}
                            />
                        )
                    ) : (
                        <div className="aspect-video flex flex-col items-center justify-center gap-2 text-muted-foreground">
                            <svg className="w-12 h-12 opacity-20" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                            <p className="text-sm font-medium opacity-50">No HLS stream available yet</p>
                            <p className="text-xs opacity-30">Transcode the video first to generate an HLS manifest</p>
                        </div>
                    )}
                </div>

                {/* ── HLS URL strip ── */}
                <div className="px-5 py-3.5 border-t border-border shrink-0 space-y-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        HLS Manifest URL
                    </p>
                    {hlsUrl ? (
                        <div className="flex items-center gap-2">
                            <code className="flex-1 min-w-0 text-[11px] font-mono text-foreground bg-secondary border border-border rounded-lg px-3 py-2 truncate select-all">
                                {hlsUrl}
                            </code>
                            <button
                                onClick={handleCopy}
                                title={copied ? "Copied!" : "Copy URL"}
                                className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary hover:bg-primary/10 hover:text-primary border border-border text-xs font-medium text-muted-foreground transition-colors"
                            >
                                {copied
                                    ? <><Check size={12} className="text-emerald-400" /> Copied</>
                                    : <><Copy size={12} /> Copy</>}
                            </button>
                            <a
                                href={hlsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Open in new tab"
                                className="shrink-0 p-2 rounded-lg bg-secondary hover:bg-primary/10 hover:text-primary border border-border text-muted-foreground transition-colors"
                            >
                                <ExternalLink size={13} />
                            </a>
                        </div>
                    ) : (
                        <p className="text-xs text-muted-foreground italic">
                            Not available — complete transcoding to generate the HLS URL.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
