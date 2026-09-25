"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Check, Copy, KeyRound, Loader2, Pencil, Play, Radio, RefreshCw, Square, Trash2, X } from "lucide-react";
import type { PpvEventOut } from "@/lib/api";
import { PPV_EVENT_SOURCES, regeneratePpvEventKey, togglePpvEventLive } from "@/lib/api";

const SOURCE_COLORS: Record<string, string> = {
    rtmp: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    external: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    browser: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

export interface PpvEventCardProps {
    event: PpvEventOut;
    onDelete: () => void;
    onUpdate?: (updated: PpvEventOut) => void;
}

function CopyButton({ value, label }: { value: string; label: string }) {
    const [copied, setCopied] = useState(false);

    const copy = async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <button type="button" onClick={copy} title={`Copy ${label}`} className="shrink-0 rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
            {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
        </button>
    );
}

export function PpvEventCard({ event, onDelete, onUpdate }: PpvEventCardProps) {
    const thumb = event.thumbnails.wide ?? event.thumbnails.banner ?? null;
    const sourceLabel = PPV_EVENT_SOURCES.find((s) => s.value === event.source)?.label ?? event.source;
    const [showCredentials, setShowCredentials] = useState(false);
    const [credentials, setCredentials] = useState(event);
    const [isProvisioning, setIsProvisioning] = useState(false);
    const [provisionError, setProvisionError] = useState<string | null>(null);
    const [isLive, setIsLive] = useState(event.is_live);
    const [isTogglingLive, setIsTogglingLive] = useState(false);

    const provisionCredentials = async () => {
        setIsProvisioning(true);
        setProvisionError(null);
        try {
            setCredentials(await regeneratePpvEventKey(event.id));
        } catch (error) {
            setProvisionError(error instanceof Error ? error.message : "Unable to generate stream credentials");
        } finally {
            setIsProvisioning(false);
        }
    };

    const toggleLive = async () => {
        setIsTogglingLive(true);
        try {
            const updated = await togglePpvEventLive(event.id, !isLive);
            setIsLive(updated.is_live);
            setCredentials(updated);
            onUpdate?.(updated);
        } finally {
            setIsTogglingLive(false);
        }
    };

    return (
        <>
            {showCredentials && createPortal(
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) setShowCredentials(false); }}>
                    <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
                        <div className="flex items-center justify-between border-b border-border px-5 py-4">
                            <div>
                                <p className="text-sm font-semibold text-foreground">RTMP Stream Credentials</p>
                                <p className="mt-0.5 text-xs text-muted-foreground">{event.title}</p>
                            </div>
                            <button type="button" onClick={() => setShowCredentials(false)} title="Close" className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"><X size={15} /></button>
                        </div>
                        <div className="space-y-4 p-5">
                            <div>
                                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">RTMP Ingest URL</p>
                                <div className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-2"><code className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground select-all">{credentials.rtmp_ingest_url ?? "RTMP server is not configured"}</code>{credentials.rtmp_ingest_url && <CopyButton value={credentials.rtmp_ingest_url} label="RTMP ingest URL" />}</div>
                            </div>
                            {credentials.rtmp_key ? <div>
                                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Stream Key</p>
                                <div className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-2"><code className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground select-all">{credentials.rtmp_key}</code><CopyButton value={credentials.rtmp_key} label="stream key" /></div>
                            </div> : <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3"><p className="text-xs text-muted-foreground">This existing event has no RTMP credentials yet.</p><button type="button" onClick={provisionCredentials} disabled={isProvisioning} className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 disabled:opacity-50">{isProvisioning ? <Loader2 size={12} className="animate-spin" /> : <KeyRound size={12} />}{isProvisioning ? "Generating credentials..." : "Generate credentials"}</button>{provisionError && <p className="mt-2 text-[11px] text-red-400">{provisionError}</p>}</div>}
                            {credentials.stream_url && <div><p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">HLS Playback URL</p><div className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-2"><code className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground select-all">{credentials.stream_url}</code><CopyButton value={credentials.stream_url} label="HLS playback URL" /></div></div>}
                            <p className="rounded-lg bg-muted/30 px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">In OBS, select Custom as the stream service. Set Server to the RTMP ingest URL and Stream Key to the key above.</p>
                        </div>
                    </div>
                </div>,
                document.body,
            )}
            <div className="rounded-2xl border border-border bg-card overflow-hidden hover:border-primary/30 transition-colors">
            {/* Thumbnail */}
            <div className="relative h-36 bg-muted/40 overflow-hidden">
                {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt={event.title} className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <Radio size={36} className="text-muted-foreground/20" />
                    </div>
                )}
                {/* Live badge */}
                <span className={`absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${isLive ? "bg-red-500/90 text-white" : "bg-muted/90 text-muted-foreground"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${isLive ? "bg-white animate-pulse" : "bg-muted-foreground"}`} />
                    {isLive ? "Live" : "PPV"}
                </span>
            </div>

            <div className="p-4 flex flex-col gap-3">
                {/* Title */}
                <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground text-sm leading-snug line-clamp-2">{event.title}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 font-mono truncate">{event.slug}</p>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${event.is_active ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-muted text-muted-foreground border-border"}`}>
                        {event.is_active ? "Active" : "Inactive"}
                    </span>
                </div>

                {/* Source badge */}
                <div className="flex flex-wrap gap-2 text-[11px]">
                    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${SOURCE_COLORS[event.source] ?? "bg-muted text-muted-foreground border-border"}`}>
                        {sourceLabel}
                    </span>
                    {event.category && (
                        <span className="px-1.5 py-0.5 rounded bg-muted border border-border text-[11px] text-muted-foreground">
                            {event.category}
                        </span>
                    )}
                </div>

                {event.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{event.description}</p>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1 border-t border-border mt-auto">
                    <Link
                        href={`/admin/content/ppv-events/${event.id}/edit`}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary hover:bg-primary/10 hover:text-primary text-xs font-medium text-foreground transition-colors"
                    >
                        <Pencil size={12} /> Edit
                    </Link>
                    {event.source === "rtmp" && (
                        <button type="button" onClick={() => setShowCredentials(true)} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-blue-400 transition-colors hover:bg-blue-500/10">
                            {event.rtmp_key ? <KeyRound size={12} /> : <RefreshCw size={12} />} Credentials
                        </button>
                    )}
                    {event.source === "rtmp" && (
                        <button type="button" onClick={toggleLive} disabled={isTogglingLive || !credentials.rtmp_key} title={!credentials.rtmp_key ? "Generate credentials before going live" : isLive ? "Stop publishing this event" : "Publish this event live"} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${isLive ? "text-red-400 hover:bg-red-500/10" : "text-emerald-400 hover:bg-emerald-500/10"}`}>
                            {isTogglingLive ? <Loader2 size={12} className="animate-spin" /> : isLive ? <Square size={12} /> : <Play size={12} />}
                            {isLive ? "Stop" : "Go Live"}
                        </button>
                    )}
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
