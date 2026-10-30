"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Pencil, Trash2, Tv2, Copy, Check, Radio, Square, RefreshCw, Play, X, KeyRound, Megaphone, Power, Loader2, AlertTriangle } from "lucide-react";
import VideoPreviewModal from "@/app/admin/content/videos/_components/VideoPreviewModal";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { LiveTvChannelOut, LiveTvManaged } from "@/lib/api";
import {
    LIVE_TV_SOURCES,
    toggleLiveTvLive,
    regenerateLiveTvKey,
    getLiveTvChannel,
    startLiveTvChannel,
    stopLiveTvChannel,
    retryLiveTvProvisioning,
    triggerLiveTvAdBreak,
} from "@/lib/api";

const AD_BREAK_OPTIONS = [15, 30, 60, 90, 120] as const;
const TRANSITIONAL_STATES = new Set(["STARTING", "STOPPING", "RECOVERING"]);

function errorDetail(err: unknown, fallback: string): string {
    const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
    return typeof detail === "string" ? detail : fallback;
}

const SOURCE_COLORS: Record<string, string> = {
    rtmp: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    srt: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    external: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    browser: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

function CopyButton({ value, label }: { value: string; label?: string }) {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <button
            onClick={copy}
            title={`Copy ${label ?? ""}`}
            className="shrink-0 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
            {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
        </button>
    );
}

export interface LiveTvCardProps {
    channel: LiveTvChannelOut;
    onDelete: () => void;
    onUpdate?: (updated: LiveTvChannelOut) => void;
}

export function LiveTvCard({ channel, onDelete, onUpdate }: LiveTvCardProps) {
    const thumb = channel.thumbnails.wide ?? channel.thumbnails.banner ?? null;
    const sourceLabel = LIVE_TV_SOURCES.find((s) => s.value === channel.source)?.label ?? channel.source;

    const [isLive, setIsLive] = useState(channel.is_live);
    const [streamStatus, setStreamStatus] = useState(channel.stream_status ?? "idle");
    const [recordingStatus, setRecordingStatus] = useState(channel.recording_status ?? "idle");
    const [toggling, setToggling] = useState(false);
    const [regenerating, setRegenerating] = useState(false);
    const [rtmpKey, setRtmpKey] = useState(channel.rtmp_key);
    const [streamUrl, setStreamUrl] = useState(channel.stream_url);
    const [recordingUrl, setRecordingUrl] = useState(channel.recording_url);
    const [rtmpIngestUrl, setRtmpIngestUrl] = useState(
        channel.rtmp_ingest_url ?? (channel.managed ? "" : "rtmp://<server>/live")
    );
    const [showCredentials, setShowCredentials] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [imgLoaded, setImgLoaded] = useState(false);

    const [managed, setManaged] = useState<LiveTvManaged | null>(channel.managed ?? null);
    const [managedBusy, setManagedBusy] = useState(false);
    const [confirmStart, setConfirmStart] = useState(false);
    const [adBreakSeconds, setAdBreakSeconds] = useState<number>(30);
    const [managedMessage, setManagedMessage] = useState<string | null>(null);

    const applyManaged = (updated: LiveTvChannelOut) => {
        setManaged(updated.managed ?? null);
        setStreamStatus(updated.stream_status);
        setRtmpKey(updated.rtmp_key);
        setRtmpIngestUrl(updated.rtmp_ingest_url ?? (updated.managed ? "" : rtmpIngestUrl));
        onUpdate?.(updated);
    };

    // Provisioning and start/stop finish in the background — follow them until they settle.
    const managedSettling =
        managed?.status === "provisioning" ||
        (managed?.channel_state != null && TRANSITIONAL_STATES.has(managed.channel_state)) ||
        managed?.vod_status === "harvesting";
    useEffect(() => {
        if (!managedSettling) return;
        const timer = setInterval(() => {
            getLiveTvChannel(channel.id).then(applyManaged).catch(() => { /* retry on next tick */ });
        }, 5000);
        return () => clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [managedSettling, channel.id]);

    const runManaged = async (action: () => Promise<LiveTvChannelOut | void>, failure: string, success?: string) => {
        setManagedBusy(true);
        setManagedMessage(null);
        try {
            const result = await action();
            if (result) applyManaged(result);
            if (success) setManagedMessage(success);
        } catch (err) {
            setManagedMessage(errorDetail(err, failure));
        } finally {
            setManagedBusy(false);
        }
    };

    const channelRunning = managed?.channel_state === "RUNNING";
    const channelIdle = !managed?.channel_state || managed.channel_state === "IDLE";
    const channelStarting = managed?.channel_state === "STARTING";
    const channelStopping = managed?.channel_state === "STOPPING";

    const handleToggleLive = async () => {
        setToggling(true);
        try {
            const updated = await toggleLiveTvLive(channel.id, !isLive);
            setIsLive(updated.is_live);
            setStreamStatus(updated.stream_status);
            setRecordingStatus(updated.recording_status);
            onUpdate?.(updated);
        } catch {
            // keep current state on error
        } finally {
            setToggling(false);
        }
    };

    const handleRegenerateKey = async () => {
        if (!confirm("Regenerate stream key? The current key will stop working immediately.")) return;
        setRegenerating(true);
        try {
            const updated = await regenerateLiveTvKey(channel.id);
            setRtmpKey(updated.rtmp_key);
            setStreamUrl(updated.stream_url);
            setRecordingUrl(updated.recording_url);
            setRecordingStatus(updated.recording_status);
            setRtmpIngestUrl(updated.rtmp_ingest_url ?? rtmpIngestUrl);
            setIsLive(false);
            setStreamStatus("idle");
            onUpdate?.(updated);
        } catch {
            // keep current key on error
        } finally {
            setRegenerating(false);
        }
    };

    return (
        <>
        <AlertDialog open={confirmStart} onOpenChange={setConfirmStart}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
                            <AlertTriangle size={16} />
                        </span>
                        Start channel?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        AWS MediaLive bills for every hour the channel runs, even when no video is being sent.
                        Stop it when you are done; it also stops automatically after a period without video.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={() => runManaged(() => startLiveTvChannel(channel.id), "Could not start channel")}
                    >
                        Start channel
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        {/* ── Credentials Modal ─────────────────────────────────────────── */}
        {showCredentials && rtmpKey && createPortal(
            <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                onClick={(e) => { if (e.target === e.currentTarget) setShowCredentials(false); }}
            >
                <div className="w-full max-w-sm rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">

                    {/* Banner */}
                    <div className="relative h-40 bg-gradient-to-br from-blue-900/60 to-slate-900 overflow-hidden">
                        {thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={thumb} alt={channel.title} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                                <Tv2 size={40} className="text-white/20" />
                                <span className="text-white/40 text-xs font-medium">{channel.title}</span>
                            </div>
                        )}
                        {/* gradient overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                        {/* title over banner */}
                        <div className="absolute bottom-3 left-4 right-10">
                            <p className="text-white font-semibold text-sm leading-snug line-clamp-1">{channel.title}</p>
                            <p className="text-white/50 text-[10px] font-mono mt-0.5">{channel.slug}</p>
                        </div>
                        {/* close */}
                        <button
                            onClick={() => setShowCredentials(false)}
                            className="absolute top-3 right-3 p-1.5 rounded-full bg-black/40 hover:bg-black/60 text-white/70 hover:text-white transition-colors"
                        >
                            <X size={14} />
                        </button>
                    </div>

                    {/* Credentials body */}
                    <div className="p-5 space-y-4">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                            <Radio size={11} /> Stream Credentials
                        </p>

                        {/* RTMP Ingest URL */}
                        <div>
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">RTMP Ingest URL</p>
                            <div className="flex items-center gap-1.5 bg-muted/40 rounded-lg border border-border px-3 py-2">
                                <code className="flex-1 truncate font-mono text-[11px] text-foreground select-all">{rtmpIngestUrl || "Available once AWS setup completes"}</code>
                                {rtmpIngestUrl && <CopyButton value={rtmpIngestUrl} label="RTMP URL" />}
                            </div>
                        </div>

                        {/* Stream Key */}
                        <div>
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Stream Key</p>
                            <div className="flex items-center gap-1.5 bg-muted/40 rounded-lg border border-border px-3 py-2">
                                <code className="flex-1 truncate font-mono text-[11px] text-foreground select-all">{rtmpKey}</code>
                                <CopyButton value={rtmpKey} label="stream key" />
                                <button
                                    onClick={handleRegenerateKey}
                                    disabled={regenerating}
                                    title="Regenerate key"
                                    className="shrink-0 p-1 rounded text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10 transition-colors disabled:opacity-50"
                                >
                                    <RefreshCw size={11} className={regenerating ? "animate-spin" : ""} />
                                </button>
                            </div>
                        </div>

                        {/* Backup ingest (second MediaLive pipeline) */}
                        {managed && managed.ingest_endpoints.length > 1 && (
                            <div>
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Backup RTMP Ingest URL (optional second encoder)</p>
                                <div className="flex items-center gap-1.5 bg-muted/40 rounded-lg border border-border px-3 py-2">
                                    <code className="flex-1 truncate font-mono text-[11px] text-foreground select-all">{managed.ingest_endpoints[1].server}</code>
                                    <CopyButton value={managed.ingest_endpoints[1].server} label="backup RTMP URL" />
                                </div>
                            </div>
                        )}

                        {/* HLS Playback URL */}
                        {streamUrl && (
                            <div>
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">HLS Playback URL</p>
                                <div className="flex items-center gap-1.5 bg-muted/40 rounded-lg border border-border px-3 py-2">
                                    <code className="flex-1 truncate font-mono text-[11px] text-foreground select-all">{streamUrl}</code>
                                    <CopyButton value={streamUrl} label="HLS URL" />
                                </div>
                            </div>
                        )}

                        {/* OBS hint */}
                        <p className="text-[10px] text-muted-foreground bg-muted/30 rounded-lg px-3 py-2 leading-relaxed">
                            In OBS: <strong className="text-foreground">Settings → Stream → Custom</strong><br />
                            Server = RTMP Ingest URL &nbsp;·&nbsp; Stream Key = key above
                        </p>
                    </div>
                </div>
            </div>,
            document.body
        )}

        {showPreview && streamUrl && (
            <VideoPreviewModal
                videoId={channel.id}
                title={channel.title}
                hlsUrl={streamUrl}
                drmEnabled={false}
                poster={thumb}
                isExternalLive
                onClose={() => setShowPreview(false)}
            />
        )}

        {/* ── Card ─────────────────────────────────────────────────────── */}
        <div className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg">
            {/* Thumbnail */}
            <div className="relative aspect-video overflow-hidden bg-gradient-to-br from-muted/70 to-muted/20">
                {thumb ? (
                    <>
                        {!imgLoaded && <div className="absolute inset-0 bg-muted animate-pulse" />}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={thumb}
                            alt={channel.title}
                            onLoad={() => setImgLoaded(true)}
                            className={`w-full h-full object-cover transition-opacity duration-300 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
                        />
                    </>
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <Tv2 size={36} className="text-muted-foreground/20" />
                    </div>
                )}
                <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/40 to-transparent" />
                <span className={`absolute left-3 top-3 flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm ${isLive ? "bg-red-600 text-white shadow-sm" : "bg-black/50 text-white/80"}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${isLive ? "animate-pulse bg-white" : "bg-white/60"}`} />
                    {isLive ? "Live" : "Offline"}
                </span>
                <span className={`absolute right-3 top-3 rounded-md px-2 py-1 text-[10px] font-semibold backdrop-blur-sm ${channel.is_active ? "bg-emerald-500/90 text-white" : "bg-black/50 text-white/80"}`}>
                    {channel.is_active ? "Active" : "Inactive"}
                </span>
            </div>

            <div className="flex flex-1 flex-col gap-3.5 p-4">
                {/* Title */}
                <div className="min-w-0">
                    <p className="line-clamp-2 text-[15px] font-semibold leading-snug text-foreground">{channel.title}</p>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{channel.slug}</p>
                </div>

                {/* Source + category badges */}
                <div className="flex flex-wrap gap-2">
                    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${SOURCE_COLORS[channel.source] ?? "bg-muted text-muted-foreground border-border"}`}>
                        {sourceLabel}
                    </span>
                    {channel.source === "rtmp" && channel.pipeline && (
                        <span className="px-2 py-0.5 rounded-full border border-border bg-muted text-[10px] font-semibold text-muted-foreground">
                            {channel.pipeline === "aws" ? "AWS MediaLive" : "Legacy RTMP"}
                        </span>
                    )}
                    {channel.categories?.length > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-muted border border-border text-[11px] text-muted-foreground">
                            {channel.categories.join(", ")}
                        </span>
                    )}
                    {channel.is_featured && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-semibold">
                            Featured
                        </span>
                    )}
                    {recordingStatus !== "idle" && (
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${recordingStatus === "ready" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : recordingStatus === "failed" ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-blue-500/10 text-blue-400 border-blue-500/20"}`}>
                            Recording: {recordingStatus}
                        </span>
                    )}
                </div>

                {channel.description && channel.description.trim() !== channel.title.trim() && (
                    <p className="text-xs leading-relaxed text-muted-foreground line-clamp-2">{channel.description}</p>
                )}

                {/* Managed pipeline: channel power, server-side ad breaks, VOD export status */}
                {managed && (
                    <div className="flex min-h-[176px] flex-col gap-3 rounded-xl border border-border bg-muted/30 p-3">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Live pipeline</span>
                            <span className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide ${channelRunning ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : managed.status === "error" ? "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400" : managedSettling ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400" : "border-border bg-background text-muted-foreground"}`}>
                                {managedSettling
                                    ? <Loader2 size={10} className="animate-spin" />
                                    : <span className={`h-1.5 w-1.5 rounded-full ${channelRunning ? "animate-pulse bg-emerald-500" : managed.status === "error" ? "bg-red-500" : "bg-muted-foreground/60"}`} />}
                                {managed.status === "ready" ? (managed.channel_state ?? "IDLE") : managed.status}
                            </span>
                        </div>

                        {managed.status === "ready" && (
                            <p className="text-[11px] leading-relaxed text-muted-foreground">
                                {channelStarting
                                    ? "Starting up — this usually takes 1–2 minutes."
                                    : channelStopping
                                        ? "Shutting down the channel…"
                                        : channelRunning
                                            ? "Ready for your encoder. Billed while running."
                                            : "Channel is stopped and not billed. Start it to connect OBS."}
                            </p>
                        )}

                        {managed.status === "error" && (
                            <>
                                <p className="text-[11px] text-red-400 break-words">{managed.error}</p>
                                <button
                                    type="button"
                                    disabled={managedBusy}
                                    onClick={() => runManaged(() => retryLiveTvProvisioning(channel.id), "Could not retry provisioning")}
                                    className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-amber-400 hover:bg-amber-500/10 transition-colors disabled:opacity-50"
                                >
                                    <RefreshCw size={12} className={managedBusy ? "animate-spin" : ""} /> Retry setup
                                </button>
                            </>
                        )}

                        {managed.status === "ready" && (
                            <div className="mt-auto flex flex-wrap items-center gap-1.5">
                                {channelIdle || channelStarting ? (
                                    <button
                                        type="button"
                                        disabled={managedBusy || channelStarting}
                                        onClick={() => setConfirmStart(true)}
                                        title="Start the encoder channel so OBS can connect (billed while running)"
                                        className="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-60"
                                    >
                                        {managedBusy || channelStarting ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />}
                                        {channelStarting ? "Starting channel…" : "Start channel"}
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        disabled={managedBusy || channelStopping}
                                        onClick={() => runManaged(() => stopLiveTvChannel(channel.id), "Could not stop channel")}
                                        className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-red-500/40 bg-red-500/5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-500/10 disabled:opacity-60 dark:text-red-400"
                                    >
                                        {managedBusy || channelStopping ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />}
                                        {channelStopping ? "Stopping channel…" : "Stop channel"}
                                    </button>
                                )}

                                {managed.options.ads_enabled && channelRunning && (
                                    <>
                                        <select
                                            value={adBreakSeconds}
                                            onChange={(e) => setAdBreakSeconds(Number(e.target.value))}
                                            className="h-7 rounded-lg border border-border bg-background px-1.5 text-xs text-foreground"
                                            aria-label="Ad break length"
                                        >
                                            {AD_BREAK_OPTIONS.map((s) => <option key={s} value={s}>{s}s</option>)}
                                        </select>
                                        <button
                                            type="button"
                                            disabled={managedBusy}
                                            onClick={() => runManaged(
                                                async () => { await triggerLiveTvAdBreak(channel.id, adBreakSeconds); },
                                                "Could not start ad break",
                                                `Ad break (${adBreakSeconds}s) sent`,
                                            )}
                                            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-amber-400 hover:bg-amber-500/10 transition-colors disabled:opacity-50"
                                        >
                                            <Megaphone size={12} /> Ad break
                                        </button>
                                    </>
                                )}
                            </div>
                        )}

                        {managed.vod_status && (
                            <p className="text-[11px] text-muted-foreground">
                                VOD export: <span className="font-medium text-foreground">{managed.vod_status}</span>
                                {channel.vod_video_id && managed.vod_status === "complete" && (
                                    <> · <Link href={`/admin/content/videos/${channel.vod_video_id}/edit`} className="text-primary hover:underline">Open draft</Link></>
                                )}
                            </p>
                        )}
                        {managedMessage && <p className="text-[11px] text-muted-foreground break-words">{managedMessage}</p>}
                    </div>
                )}

                {channel.source === "rtmp" && !managed && (
                    <div className="flex min-h-[176px] flex-col gap-3 rounded-xl border border-border bg-muted/30 p-3">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Live stream</span>
                            <span className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide ${isLive ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "border-border bg-background text-muted-foreground"}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${isLive ? "animate-pulse bg-emerald-500" : "bg-muted-foreground/60"}`} />
                                {isLive ? "LIVE" : "READY"}
                            </span>
                        </div>
                        <p className="text-[11px] leading-relaxed text-muted-foreground">
                            {isLive
                                ? "Your stream is available to viewers."
                                : "Use the stream credentials to connect your encoder, then go live when you are ready."}
                        </p>
                        <div className="mt-auto divide-y divide-border rounded-lg border border-border bg-background text-[11px]">
                            <div className="flex items-center justify-between gap-3 px-3 py-2">
                                <span className="text-muted-foreground">Encoder</span>
                                <span className="flex items-center gap-1.5 font-medium text-foreground">
                                    <Radio size={12} className="text-primary" /> {rtmpKey ? "Credentials ready" : "Preparing"}
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {channel.source === "external" && (
                    <div className="flex min-h-[176px] flex-col gap-3 rounded-xl border border-border bg-muted/30 p-3">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">External feed</span>
                            <span className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide ${streamUrl ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${streamUrl ? "bg-emerald-500" : "bg-red-500"}`} />
                                {streamUrl ? "CONFIGURED" : "MISSING"}
                            </span>
                        </div>
                        <p className="text-[11px] leading-relaxed text-muted-foreground">
                            {streamUrl ? "Playback is supplied by the connected provider feed." : "Add an HLS source URL to make this channel available."}
                        </p>
                        <div className="mt-auto divide-y divide-border rounded-lg border border-border bg-background text-[11px]">
                            <div className="flex items-center justify-between gap-3 px-3 py-2">
                                <span className="text-muted-foreground">Source</span>
                                <span className="font-medium text-foreground">M3U8 / HLS</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Actions */}
                <div className="mt-auto flex items-center gap-1.5 border-t border-border pt-3">
                    {channel.source === "rtmp" ? (
                        <button
                            onClick={handleToggleLive}
                            disabled={toggling}
                            title={isLive ? "Take the channel offline for viewers" : "Show the channel to viewers"}
                            className={`flex h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition-colors disabled:opacity-60 ${isLive ? "border border-red-500/40 bg-red-500/5 text-red-600 hover:bg-red-500/10 dark:text-red-400" : "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"}`}
                        >
                            {toggling
                                ? <RefreshCw size={14} className="animate-spin" />
                                : isLive
                                    ? <><Square size={13} /> End broadcast</>
                                    : <><Play size={13} /> Go Live</>}
                        </button>
                    ) : streamUrl ? (
                        <button
                            type="button"
                            onClick={() => setShowPreview(true)}
                            title="Preview external feed"
                            className="flex h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                        >
                            <Play size={13} /> Preview
                        </button>
                    ) : (
                        <div className="flex h-9 flex-1 items-center justify-center rounded-lg border border-dashed border-border text-[11px] font-medium text-muted-foreground">
                            Feed unavailable
                        </div>
                    )}

                    <Link
                        href={`/admin/content/live-tv/${channel.id}/edit`}
                        title="Edit channel"
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                    >
                        <Pencil size={14} />
                    </Link>

                    {channel.source === "rtmp" && rtmpKey && (
                        <button
                            onClick={() => setShowCredentials(true)}
                            title="Stream credentials"
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                        >
                            <KeyRound size={14} />
                        </button>
                    )}

                    {recordingUrl && recordingStatus === "ready" && (
                        <a
                            href={recordingUrl}
                            target="_blank"
                            rel="noreferrer"
                            title="Watch recording"
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                        >
                            <Play size={14} />
                        </a>
                    )}

                    <button
                        type="button"
                        onClick={onDelete}
                        title="Delete channel"
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-500"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>
        </div>
        </>
    );
}
