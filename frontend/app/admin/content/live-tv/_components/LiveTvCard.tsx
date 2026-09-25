"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Pencil, Trash2, Tv2, Copy, Check, Radio, Square, RefreshCw, Play, X, KeyRound } from "lucide-react";
import type { LiveTvChannelOut } from "@/lib/api";
import { LIVE_TV_SOURCES, toggleLiveTvLive, regenerateLiveTvKey } from "@/lib/api";

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
        channel.rtmp_ingest_url ?? "rtmp://<server>/live"
    );
    const [showCredentials, setShowCredentials] = useState(false);
    const [imgLoaded, setImgLoaded] = useState(false);

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
                                <code className="flex-1 truncate font-mono text-[11px] text-foreground select-all">{rtmpIngestUrl}</code>
                                <CopyButton value={rtmpIngestUrl} label="RTMP URL" />
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

        {/* ── Card ─────────────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden hover:border-primary/30 transition-colors">
            {/* Thumbnail */}
            <div className="relative h-36 bg-muted/40 overflow-hidden">
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
                {/* Live badge */}
                <span className={`absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${isLive ? "bg-red-500/90 text-white" : "bg-muted/80 text-muted-foreground"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${isLive ? "bg-white animate-pulse" : "bg-muted-foreground"}`} />
                    {isLive ? "LIVE" : "OFF"}
                </span>
            </div>

            <div className="p-4 flex flex-col gap-3">
                {/* Title */}
                <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground text-sm leading-snug line-clamp-2">{channel.title}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 font-mono truncate">{channel.slug}</p>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${channel.is_active ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-muted text-muted-foreground border-border"}`}>
                        {channel.is_active ? "Active" : "Inactive"}
                    </span>
                </div>

                {/* Source + category badges */}
                <div className="flex flex-wrap gap-2">
                    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${SOURCE_COLORS[channel.source] ?? "bg-muted text-muted-foreground border-border"}`}>
                        {sourceLabel}
                    </span>
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

                {channel.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{channel.description}</p>
                )}

                {/* Actions */}
                <div className="flex items-center gap-1.5 pt-1 border-t border-border mt-auto">
                    <Link
                        href={`/admin/content/live-tv/${channel.id}/edit`}
                        className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-secondary hover:bg-primary/10 hover:text-primary text-xs font-medium text-foreground transition-colors"
                    >
                        <Pencil size={12} /> Edit
                    </Link>

                    {/* Credentials button — RTMP only */}
                    {channel.source === "rtmp" && rtmpKey && (
                        <button
                            onClick={() => setShowCredentials(true)}
                            title="View stream credentials"
                            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-blue-400 hover:bg-blue-500/10 transition-colors"
                        >
                            <KeyRound size={12} /> Info
                        </button>
                    )}

                    {/* Start / Stop — RTMP channels only */}
                    {channel.source === "rtmp" && (
                        <button
                            onClick={handleToggleLive}
                            disabled={toggling}
                            title={isLive ? "Stop stream" : "Start stream"}
                            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${isLive ? "text-red-400 hover:bg-red-500/10" : "text-emerald-400 hover:bg-emerald-500/10"}`}
                        >
                            {toggling
                                ? <RefreshCw size={12} className="animate-spin" />
                                : isLive
                                    ? <><Square size={12} /> Stop</>
                                    : <><Play size={12} /> Go Live</>}
                        </button>
                    )}

                    {recordingUrl && recordingStatus === "ready" && (
                        <a
                            href={recordingUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                        >
                            <Play size={12} /> Replay
                        </a>
                    )}

                    {/* Delete */}
                    <button
                        type="button"
                        onClick={onDelete}
                        className="ml-auto p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/8 transition-colors"
                        title="Delete"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>
        </div>
        </>
    );
}
