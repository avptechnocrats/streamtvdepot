"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Tv2, AlertTriangle, Radio, Square } from "lucide-react";
import { listEPGChannels, type EPGChannelSummary } from "@/lib/api";

const SOURCE_BADGE: Record<string, string> = {
    rtmp: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
    srt: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
};

function StatusDot({ status }: { status: string }) {
    if (status === "live") return <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />;
    if (status === "error") return <span className="inline-block w-2 h-2 rounded-full bg-red-400" />;
    return <span className="inline-block w-2 h-2 rounded-full bg-muted-foreground/40" />;
}

export default function EPGPage() {
    const [channels, setChannels] = useState<EPGChannelSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchChannels = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setChannels(await listEPGChannels());
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to load channels");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchChannels(); }, [fetchChannels]);

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
                    <CalendarDays size={20} className="text-primary" />
                    EPG — Electronic Program Guide
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Manage program schedules for your RTMP and SRT live TV channels.
                </p>
            </div>

            {/* Info banner */}
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
                Only channels with <span className="font-medium text-foreground">RTMP</span> or{" "}
                <span className="font-medium text-foreground">SRT</span> source appear here. To add a channel, go to{" "}
                <Link href="/admin/content/live-tv" className="text-primary underline underline-offset-2">
                    Live TV
                </Link>{" "}
                and create it with an RTMP or SRT source.
            </div>

            {/* Content */}
            {loading && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="h-28 rounded-xl bg-secondary/50 animate-pulse" />
                    ))}
                </div>
            )}

            {!loading && error && (
                <div className="flex items-center gap-2 text-red-400 text-sm">
                    <AlertTriangle size={16} />
                    {error}
                </div>
            )}

            {!loading && !error && channels.length === 0 && (
                <div className="text-center py-16 text-muted-foreground">
                    <Tv2 size={40} className="mx-auto mb-3 opacity-30" />
                    <p className="font-medium">No RTMP / SRT channels found</p>
                    <p className="text-sm mt-1">
                        Create a Live TV channel with RTMP or SRT source to schedule its EPG.
                    </p>
                    <Link
                        href="/admin/content/live-tv/new"
                        className="inline-flex mt-4 items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                        Add Live TV Channel
                    </Link>
                </div>
            )}

            {!loading && !error && channels.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {channels.map((ch) => {
                        const thumb = ch.thumbnails?.wide ?? ch.thumbnails?.banner ?? null;
                        return (
                            <Link
                                key={ch.id}
                                href={`/admin/content/epg/${ch.id}`}
                                className="group relative flex flex-col gap-3 rounded-xl border border-border bg-card p-4 hover:border-primary/40 hover:bg-accent/30 transition-all"
                            >
                                {/* Thumbnail */}
                                <div className="flex items-center gap-3">
                                    <div className="w-14 h-14 rounded-lg bg-secondary flex items-center justify-center shrink-0 overflow-hidden">
                                        {thumb ? (
                                            <img
                                                src={thumb}
                                                alt={ch.title}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <Tv2 size={24} className="text-muted-foreground/40" />
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                                            {ch.title}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium uppercase tracking-wide ${SOURCE_BADGE[ch.source] ?? ""}`}>
                                                {ch.source}
                                            </span>
                                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                                <StatusDot status={ch.stream_status} />
                                                {ch.stream_status === "live" ? "Live" : ch.stream_status === "error" ? "Error" : "Idle"}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Manage EPG button hint */}
                                <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border/60 pt-2">
                                    <span>Click to manage schedule</span>
                                    <CalendarDays size={14} className="text-primary opacity-70 group-hover:opacity-100 transition-opacity" />
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
