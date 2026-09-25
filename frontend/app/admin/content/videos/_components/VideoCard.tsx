"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Pencil, Trash2, Clock, Globe, Loader2, CheckCircle2, AlertTriangle, RotateCcw, Play, Zap, ExternalLink } from "lucide-react";
import { TOKEN_KEYS, type VideoOut } from "@/lib/api";
import { getClientSlugFromAccessToken } from "@/lib/admin-auth";
import { StatusBadge, AccessTypeBadge, FeaturedBadge } from "./StatusBadge";
import { fmtDuration } from "./utils";
import { triggerTranscode, getDrmKeyToken } from "@/lib/api/transcoding";
import { ENDPOINTS } from "@/lib/api/endpoints";
import VideoPreviewModal from "./VideoPreviewModal";
import { RegenerateHlsConfirm } from "./RegenerateHlsConfirm";

export interface VideoCardProps {
    video: VideoOut;
    onDelete: () => void;
    onStatusChange?: (id: string, status: VideoOut["transcode_status"]) => void;
}

// ─── Transcode status pill ────────────────────────────────────────────────────
function TranscodeBadge({ status, progress, errorMessage, onTranscode, retrying }: {
    status: VideoOut["transcode_status"];
    progress: number | null;
    errorMessage?: string | null;
    onTranscode?: () => void;
    retrying?: boolean;
}) {
    // No status yet — show Transcode button
    if (!status) {
        return (
            <button
                onClick={onTranscode}
                disabled={retrying}
                title="Start transcoding"
                className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {retrying ? <Loader2 size={9} className="animate-spin" /> : <Zap size={9} />}
                Transcode
            </button>
        );
    }
    if (status === "complete") {
        return (
            <span className="inline-flex items-center gap-1">
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                    <CheckCircle2 size={9} /> HLS Ready
                </span>
                {onTranscode && (
                    <button
                        onClick={onTranscode}
                        disabled={retrying}
                        title="Regenerate HLS"
                        className="inline-flex items-center justify-center p-1 rounded text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <RotateCcw size={11} className={retrying ? "animate-spin" : ""} />
                    </button>
                )}
            </span>
        );
    }
    if (status === "processing" || status === "pending") {
        return (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <Loader2 size={9} className="animate-spin" />
                {status === "pending" ? "Queued…" : `Transcoding ${progress ?? 0}%`}
            </span>
        );
    }
    if (status === "failed") {
        return (
            <span className="inline-flex items-center gap-1">
                <span
                    className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20"
                    title={errorMessage ?? undefined}
                >
                    <AlertTriangle size={9} /> Failed
                </span>
                {onTranscode && (
                    <button
                        onClick={onTranscode}
                        disabled={retrying}
                        title="Retry transcoding"
                        className="inline-flex items-center justify-center p-1 rounded text-red-400 hover:text-orange-400 hover:bg-orange-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <RotateCcw size={11} className={retrying ? "animate-spin" : ""} />
                    </button>
                )}
            </span>
        );
    }
    return null;
}

export function VideoCard({ video, onDelete, onStatusChange }: VideoCardProps) {
    const languages = Array.isArray(video.language)
        ? video.language.join(", ")
        : video.language ?? null;

    const [transcodeStatus, setTranscodeStatus] = useState(video.transcode_status);
    const status = video.status || "draft";
    const [transcodeProgress, setTranscodeProgress] = useState(video.transcode_progress);
    const [errorMessage, setErrorMessage] = useState(video.transcode_error_message);
    const [retrying, setRetrying] = useState(false);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewHlsUrl, setPreviewHlsUrl] = useState<string | null>(null);
    const [previewDrmToken, setPreviewDrmToken] = useState<string | undefined>(undefined);
    const [imgLoaded, setImgLoaded] = useState(false);
    const [confirmRegenerate, setConfirmRegenerate] = useState(false);

    // Build the CORS-safe backend proxy URL instead of the raw hls_url (raw
    // CloudFront URLs are vulnerable to cross-origin cache poisoning — see /media/stream proxy).
    // Admin preview must always be authorized to play — it never depends on the
    // video's paid/free access_type, only on whether the backend requires a token.
    const handleOpenPreview = async () => {
        setPreviewLoading(true);
        try {
            let token: string | undefined;
            try {
                const result = await getDrmKeyToken(video.id);
                token = result.token;
            } catch {
                // Free, non-DRM videos need no token — the backend 404s in that case, which is fine.
            }
            const base = `${process.env.NEXT_PUBLIC_API_URL}${ENDPOINTS.media.stream(video.id)}`;
            setPreviewHlsUrl(token ? `${base}?token=${token}` : base);
            setPreviewDrmToken(token);
            setPreviewOpen(true);
        } finally {
            setPreviewLoading(false);
        }
    };

    // Sync local state when the parent listing refreshes transcode fields
    useEffect(() => {
        setTranscodeStatus(video.transcode_status);
        setTranscodeProgress(video.transcode_progress);
        setErrorMessage(video.transcode_error_message);
    }, [video.transcode_status, video.transcode_progress, video.transcode_error_message]);

    useEffect(() => {
        const accessToken = localStorage.getItem(TOKEN_KEYS.access);
        if (!accessToken) {
            setPreviewUrl(null);
            return;
        }

        const clientSlug = getClientSlugFromAccessToken(accessToken);
        if (!clientSlug) {
            setPreviewUrl(null);
            return;
        }

        setPreviewUrl(`https://${clientSlug}.preview.streamtvdepot.com/movies/${video.id}`);
    }, [video.id]);

    const handleTranscode = async () => {
        setRetrying(true);
        try {
            await triggerTranscode(video.id);
            setTranscodeStatus("pending");
            setTranscodeProgress(0);
            setErrorMessage(null);
            onStatusChange?.(video.id, "pending");
        } catch {
            // status stays unchanged; user can retry
        } finally {
            setRetrying(false);
        }
    };

    const handleRegenerateHls = () => {
        setConfirmRegenerate(true);
    };

    const handleRegenerateConfirm = async () => {
        try {
            await handleTranscode();
        } finally {
            setConfirmRegenerate(false);
        }
    };

    return <>
        <div className="rounded-2xl border border-border bg-card overflow-hidden hover:border-primary/30 transition-colors">
            {/* Thumbnail strip */}
            <div className="relative h-48 bg-muted/40 overflow-hidden">
                {video.thumbnails.video_w_thumbnail ? (
                    <>
                        {/* Skeleton shown until image loads */}
                        {!imgLoaded && (
                            <div className="absolute inset-0 bg-muted animate-pulse" />
                        )}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={video.thumbnails.video_w_thumbnail}
                            alt={video.title}
                            onLoad={() => setImgLoaded(true)}
                            className={`w-full h-full object-cover transition-opacity duration-300 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
                        />
                    </>
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <svg className="w-10 h-10 text-muted-foreground/30" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                        </svg>
                    </div>
                )}
                {video.duration && (
                    <span className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] font-medium px-1.5 py-0.5 rounded flex items-center gap-1">
                        <Clock size={9} /> {fmtDuration(video.duration)}
                    </span>
                )}
            </div>

            <div className="p-4 flex flex-col gap-2">
                {/* Name */}
                <p className="font-semibold text-foreground text-sm leading-snug line-clamp-1">{video.title}</p>

                {/* Slug */}
                {/* <p className="text-[11px] text-muted-foreground font-mono truncate">{video.slug}</p> */}

                {/* Category */}
                <p className="text-[11px] text-muted-foreground truncate">
                    {video.categories?.length > 0
                        ? <span className="px-1.5 py-0.5 rounded bg-muted border border-border">{video.categories.join(", ")}</span>
                        : <span className="opacity-40">No category</span>}
                </p>

                {/* Language */}
                <p className="text-[10px] text-muted-foreground flex items-center gap-1 truncate">
                    {languages
                        ? <><Globe size={10} className="shrink-0" />{languages}</>
                        : <span className="opacity-40">No language</span>}
                </p>

                {/* Active + Access Type + Featured */}
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                        <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded border ${video.status === "published"
                            ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                            : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                            }`}>
                            {status.charAt(0).toUpperCase() + status.slice(1)}
                        </span>
                        <StatusBadge active={video.is_active} />
                        <AccessTypeBadge accessType={video.access_type} />
                    </div>
                    {video.is_featured
                        ? <FeaturedBadge />
                        : <span className="text-[10px] text-muted-foreground/60">Not featured</span>}
                </div>

                {/* Transcode status */}
                {video.video_url && (
                    <div className="flex items-center justify-between gap-1.5">
                        <TranscodeBadge
                            status={transcodeStatus}
                            progress={transcodeProgress}
                            errorMessage={errorMessage}
                            onTranscode={
                                !transcodeStatus || transcodeStatus === "failed"
                                    ? handleTranscode
                                    : transcodeStatus === "complete"
                                        ? handleRegenerateHls
                                        : undefined
                            }
                            retrying={retrying}
                        />
                        {transcodeStatus === "processing" && transcodeProgress != null && (
                            <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                                <div
                                    className="h-full bg-blue-400 transition-all duration-500"
                                    style={{ width: `${transcodeProgress}%` }}
                                />
                            </div>
                        )}

                        {/* Preview — only when HLS is ready */}
                        {transcodeStatus === "complete" && (
                            <button
                                onClick={() => { void handleOpenPreview(); }}
                                disabled={previewLoading}
                                title="Preview"
                                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                            >
                                {previewLoading ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} Preview
                            </button>
                        )}
                    </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-1 pt-2 border-t border-border mt-auto">
                    {/* Edit */}
                    <Link
                        href={`/admin/content/videos/${video.id}/edit`}
                        className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-secondary hover:bg-primary/10 hover:text-primary text-xs font-medium text-foreground transition-colors"
                        title="Edit"
                    >
                        <Pencil size={12} /> Edit
                    </Link>

                    {/* Preview URL */}
                    {previewUrl ? (
                        <a
                            href={previewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Preview URL"
                            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                        >
                            <ExternalLink size={12} /> URL
                        </a>
                    ) : (
                        <button
                            type="button"
                            disabled
                            title="Preview URL unavailable"
                            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-muted-foreground/50 cursor-not-allowed"
                        >
                            <ExternalLink size={12} /> URL
                        </button>
                    )}

                    {/* Delete */}
                    <button
                        onClick={onDelete}
                        title="Delete"
                        className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-500 transition-colors ml-auto"
                    >
                        <Trash2 size={12} /> Delete
                    </button>
                </div>
            </div>
        </div>

        {previewOpen && (
            <VideoPreviewModal
                videoId={video.id}
                title={video.title}
                hlsUrl={previewHlsUrl}
                drmEnabled={video.drm_enabled}
                drmKeyToken={previewDrmToken}
                poster={video.thumbnails.video_banner ?? video.thumbnails.video_w_thumbnail ?? video.thumbnails.video_h_thumbnail}
                onClose={() => setPreviewOpen(false)}
                onRegenerateHls={handleRegenerateHls}
            />
        )}

        {confirmRegenerate && (
            <RegenerateHlsConfirm
                video={video}
                onCancel={() => setConfirmRegenerate(false)}
                onConfirm={handleRegenerateConfirm}
            />
        )}
    </>;
}
