"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Radio, Globe, Tag, Shield, Play, Wifi, WifiOff, Lock, Loader2 } from "lucide-react";

import {
    getChannelEpg,
    getLiveTvChannel,
    getVideo,
    listLiveTvChannels,
    listVideos,
    type LiveTvChannelOut,
    type VideoOut,
} from "@/lib/services";
import { usePlayGate } from "@/hooks/use-play-gate";
import { useTenantName } from "@/hooks/use-tenant-name";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import EpgGuide from "../_components/EpgGuide";


// VideoPlayer uses video.js which requires browser APIs — disable SSR
const VideoPlayer = dynamic(() => import("@/components/VideoPlayer"), { ssr: false });
const ManagedVideoPlayer = dynamic(() => import("@/components/ManagedVideoPlayer"), { ssr: false });

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function ChannelDetailSkeleton() {
    return (
        <>
            <div className="w-full bg-black pt-16">
                <div className="max-w-screen-xl mx-auto">
                    <div className="aspect-video w-full bg-secondary/30 animate-pulse" />
                </div>
            </div>
            <div className="max-w-screen-xl mx-auto px-6 lg:px-12 py-10 space-y-6">
                <div className="flex gap-2">
                    <Skeleton className="h-6 w-16 rounded-full" />
                    <Skeleton className="h-6 w-20 rounded-full" />
                </div>
                <Skeleton className="h-9 w-72" />
                <div className="flex flex-wrap gap-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-16 w-32 rounded-xl" />
                    ))}
                </div>
                <div className="space-y-2 max-w-2xl">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-4 w-4/6" />
                </div>
            </div>
        </>
    );
}

// ─── Related channel card ─────────────────────────────────────────────────────

function RelatedChannelCard({ channel }: { channel: LiveTvChannelOut }) {
    const image =
        channel.thumbnails.portrait ||
        channel.thumbnails.wide ||
        channel.thumbnails.banner ||
        "/images/movie-1.jpg";

    return (
        <Link
            href={`/tv-shows/${channel.id}`}
            className="content-card flex-shrink-0 group/card cursor-pointer"
        >
            <div className="relative rounded-lg overflow-hidden card-shine aspect-[2/3] bg-secondary">
                <img
                    src={image}
                    alt={channel.title}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover/card:scale-105"
                    loading="lazy"
                    width={640}
                    height={960}
                />
                <div className="absolute inset-0 bg-background/0 group-hover/card:bg-background/40 transition-colors flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-primary/90 flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-all scale-75 group-hover/card:scale-100">
                        <Play size={20} className="text-primary-foreground ml-0.5" fill="currentColor" />
                    </div>
                </div>
                {channel.is_live && (
                    <span className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold bg-red-600 text-white rounded">
                        <span className="w-1 h-1 rounded-full bg-white animate-pulse" />
                        LIVE
                    </span>
                )}
                {channel.access_type === "free" && !channel.is_live && (
                    <span className="absolute top-2 right-2 px-1.5 py-0.5 text-[10px] font-medium bg-primary/90 text-primary-foreground rounded">
                        FREE
                    </span>
                )}
            </div>
            <div className="mt-2 space-y-0.5">
                <p className="text-sm font-medium text-foreground truncate">{channel.title}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {channel.language?.[0] && <span>{channel.language[0]}</span>}
                    {channel.category && <span className="text-primary truncate">{channel.category}</span>}
                </div>
            </div>
        </Link>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ChannelDetailPage() {
    const { id } = useParams<{ id: string }>();
    const tenantName = useTenantName();
    const searchParams = useSearchParams();
    const [playbackError, setPlaybackError] = useState<string | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [nowMs, setNowMs] = useState(() => Date.now());
    const autoPlayAttempted = useRef(false);

    const { data: channel, isLoading, isError } = useQuery({
        queryKey: ["live-tv-channel", id],
        queryFn: () => getLiveTvChannel(id),
        enabled: !!id,
    });

    // Map channel access_type to the gate's expected type
    // Channels use "pay_per_view" for PPV — no "rental" type for live channels
    const gateAccessType = (channel?.access_type ?? "free") as "free" | "subscription" | "pay_per_view" | "rental";

    const { handlePlay, accessLoading } = usePlayGate({
            contentId: id,
            accessType: gateAccessType,
            contentTitle: channel?.title ?? "this channel",
            onPlay: () => setIsPlaying(true),
        });

    useEffect(() => {
        if (!channel || searchParams.get("play") !== "true" || accessLoading || autoPlayAttempted.current) return;
        autoPlayAttempted.current = true;
        handlePlay();
    }, [accessLoading, channel, handlePlay, searchParams]);

    useEffect(() => {
        setIsPlaying(false);
        autoPlayAttempted.current = false;
    }, [id]);

    useEffect(() => {
        if (channel) document.title = `${channel.title} | ${tenantName}`;
        return () => { document.title = tenantName; };
    }, [channel, tenantName]);

    useEffect(() => {
        setPlaybackError(null);
    }, [channel?.id]);

    useEffect(() => {
        const t = setInterval(() => setNowMs(Date.now()), 30_000);
        return () => clearInterval(t);
    }, []);

    // Reuses the same queryKey as the TV Shows page — served from cache on navigation
    const { data: allChannels } = useQuery({
        queryKey: ["live-tv-channels-banner"],
        queryFn: () => listLiveTvChannels({ page_size: 100 }),
        staleTime: 5 * 60 * 1000,
        retry: 1,
    });

    const { data: epgData } = useQuery({
        queryKey: ["channel-epg-now", id],
        queryFn: () => getChannelEpg(id, undefined, 1),
        enabled: !!id,
        staleTime: 30_000,
        refetchInterval: 60_000,
        retry: 1,
    });

    const currentProgram = (epgData?.programs ?? []).find((p) => {
        const s = new Date(p.start_time).getTime();
        const e = new Date(p.end_time).getTime();
        return s <= nowMs && e > nowMs;
    });

    // Advance to the next program precisely when the current one ends, rather
    // than waiting for the 30s clock tick — keeps linear transitions crisp.
    useEffect(() => {
        if (!currentProgram) return;
        const endMs = new Date(currentProgram.end_time).getTime();
        const delay = endMs - Date.now();
        if (delay <= 0) {
            setNowMs(Date.now());
            return;
        }
        const t = setTimeout(() => setNowMs(Date.now()), delay + 250);
        return () => clearTimeout(t);
    }, [currentProgram]);

    const { data: currentProgramVideo } = useQuery({
        queryKey: ["epg-program-video", currentProgram?.video_id],
        queryFn: () => getVideo(currentProgram!.video_id as string),
        enabled: !!currentProgram?.video_id,
        staleTime: 60_000,
        // Keep the outgoing program on screen until the next one resolves so the
        // linear transition never flashes the raw live feed or a black frame.
        placeholderData: (prev) => prev,
        retry: 1,
    });

    // Compatibility fallback for older EPG rows saved before video_id existed.
    const { data: legacyProgramMatches } = useQuery({
        queryKey: ["epg-program-video-legacy", currentProgram?.title],
        queryFn: () => listVideos({ search: currentProgram!.title, page_size: 20, is_active: true }),
        enabled: !!currentProgram && !currentProgram.video_id,
        staleTime: 60_000,
        retry: 1,
    });

    const legacyMatchedVideo = (legacyProgramMatches ?? []).find((v) => {
        const sameTitle = v.title.trim().toLowerCase() === currentProgram?.title?.trim().toLowerCase();
        if (!sameTitle) return false;
        if (!currentProgram?.duration_minutes || !v.duration) return true;
        const minutes = Math.round(v.duration / 60);
        return Math.abs(minutes - currentProgram.duration_minutes) <= 1;
    });

    const scheduledVideo: VideoOut | undefined = currentProgramVideo ?? legacyMatchedVideo;
    const scheduledVideoPlaybackSrc =
        scheduledVideo?.hls_display_url ||
        scheduledVideo?.hls_url ||
        scheduledVideo?.video_display_url ||
        scheduledVideo?.video_url ||
        null;
    const playbackVideoId = scheduledVideo?.id;

    // Join the current program at its already-elapsed offset so all viewers see
    // the same point in the schedule (broadcast-style linear playback).
    const joinOffsetSeconds = currentProgram
        ? Math.max(0, Math.floor((nowMs - new Date(currentProgram.start_time).getTime()) / 1000))
        : undefined;

    if (isLoading) return <ChannelDetailSkeleton />;

    if (isError || !channel) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 pt-16">
                <p className="text-muted-foreground text-lg">Channel not found.</p>
                <Link href="/tv-shows">
                    <Button variant="outline">
                        <ChevronLeft size={16} /> Back to TV Shows
                    </Button>
                </Link>
            </div>
        );
    }

    const poster =
        channel.thumbnails.banner ||
        channel.thumbnails.wide ||
        channel.thumbnails.portrait ||
        undefined;

    // Channels in the same category (excluding current)
    const relatedChannels = (allChannels ?? [])
        .filter((c) => c.id !== channel.id && !!channel.category && c.category === channel.category)
        .slice(0, 12);

    // Other channels (different category or no category)
    const otherChannels = (allChannels ?? [])
        .filter((c) => c.id !== channel.id && (!channel.category || c.category !== channel.category))
        .slice(0, 12);
    const guideChannels = (allChannels ?? []).filter(
        (c) => c.source === "rtmp" || c.source === "srt",
    );

    const isFree = channel.access_type === "free";
    const canPlay = isFree || isPlaying;
    const playbackSrc = scheduledVideoPlaybackSrc || channel.stream_url;
    const hasPlayableUrl = !!playbackSrc;
    // External HLS links can be attempted directly. RTMP/SRT channels should be
    // attempted only when backend marks the ingest as currently live, unless
    // an EPG-linked uploaded video is currently active.
    const canAttemptPlayback =
        hasPlayableUrl &&
        (!!scheduledVideoPlaybackSrc || channel.source === "external" || channel.stream_status === "live");

    return (
        <>
            {/* ── Player / Gate ────────────────────────────────────────────── */}
            <div className="w-full bg-black pt-16">
                <div className="relative max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-10">
                    {/* Back button */}
                    <div className="absolute top-3 left-4 z-20">
                        <Link href="/tv-shows">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-white/80 hover:text-white hover:bg-white/10 gap-1.5"
                            >
                                <ChevronLeft size={16} /> TV Shows
                            </Button>
                        </Link>
                    </div>

                    {canPlay ? (
                        /* Free content or a paid channel with verified access */
                        canAttemptPlayback && !playbackError ? (
                            playbackVideoId ? (
                                <ManagedVideoPlayer
                                    fallbackSrc={playbackSrc as string}
                                    videoId={playbackVideoId}
                                    channelId={channel.id}
                                    startAt={joinOffsetSeconds}
                                    poster={poster}
                                    autoPlay
                                    allowSeeking={false}
                                    className="w-full"
                                    onError={(message) => setPlaybackError(message || "Playback failed")}
                                />
                            ) : (
                                <VideoPlayer
                                    src={playbackSrc as string}
                                    poster={poster}
                                    autoPlay
                                    allowSeeking={false}
                                    className="w-full"
                                    onError={(message) => setPlaybackError(message || "Playback failed")}
                                />
                            )
                        ) : (
                            <div className="aspect-video flex flex-col items-center justify-center bg-black/80 gap-3">
                                <WifiOff size={48} className="text-white/30" />
                                <p className="text-white/50 text-sm">
                                    {playbackError
                                        ? "Live stream is currently unavailable"
                                        : "Stream not available"}
                                </p>
                            </div>
                        )
                    ) : (
                        /* Gated content — show access gate overlay */
                        <div
                            className="aspect-video relative flex flex-col items-center justify-center gap-5"
                            style={{
                                backgroundImage: poster ? `url(${poster})` : undefined,
                                backgroundSize: "cover",
                                backgroundPosition: "center",
                            }}
                        >
                            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
                            <div className="relative z-10 flex flex-col items-center gap-4 text-center px-6">
                                <div className="w-16 h-16 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
                                    <Lock size={28} className="text-white/70" />
                                </div>
                                <div className="space-y-1">
                                    <p className="text-white font-bold text-xl">{channel.title}</p>
                                    <p className="text-white/60 text-sm">
                                        {channel.access_type === "pay_per_view"
                                            ? "This is a Pay Per View event"
                                            : "This channel requires a subscription"}
                                    </p>
                                </div>
                                <Button
                                    onClick={handlePlay}
                                    disabled={accessLoading}
                                    className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold px-8 py-3 h-auto text-base gap-2"
                                >
                                    {accessLoading ? (
                                        <><Loader2 size={18} className="animate-spin" /> Checking…</>
                                    ) : channel.access_type === "pay_per_view" ? (
                                        <><Play size={18} fill="currentColor" /> Buy &amp; Watch</>
                                    ) : (
                                        <><Lock size={18} /> Watch with Subscription</>
                                    )}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Channel info ─────────────────────────────────────────────── */}
            <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-10 py-8 space-y-8">

                {/* Title + badges */}
                <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                        {channel.is_live && (
                            <span className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider bg-red-600 text-white rounded-full">
                                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                Live
                            </span>
                        )}
                        {channel.access_type === "free" && (
                            <span className="px-2.5 py-1 text-[11px] font-semibold bg-primary/10 text-primary border border-primary/30 rounded-full uppercase tracking-wider">
                                Free
                            </span>
                        )}
                        {channel.access_type === "pay_per_view" && (
                            <span className="px-2.5 py-1 text-[11px] font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/30 rounded-full uppercase tracking-wider">
                                PPV
                            </span>
                        )}
                        {channel.access_type === "subscription" && (
                            <span className="px-2.5 py-1 text-[11px] font-semibold bg-primary/10 text-primary border border-primary/30 rounded-full uppercase tracking-wider">
                                Subscription
                            </span>
                        )}
                        {channel.category && (
                            <span className="px-2.5 py-1 text-[11px] font-medium bg-secondary text-muted-foreground border border-border/40 rounded-full">
                                {channel.category}
                            </span>
                        )}
                    </div>
                    <h1 className="text-3xl md:text-4xl font-display font-800 text-foreground">
                        {channel.title}
                    </h1>
                </div>

                {/* Stats strip */}
                <div className="flex flex-wrap gap-3">
                    <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-secondary/60 border border-border/40">
                        {channel.is_live ? (
                            <Radio size={18} className="text-red-500" />
                        ) : (
                            <Wifi size={18} className="text-muted-foreground" />
                        )}
                        <div>
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Status</p>
                            <p className="text-sm font-semibold text-foreground">
                                {channel.is_live ? "Live Now" : "Offline"}
                            </p>
                        </div>
                    </div>

                    {channel.language.length > 0 && (
                        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-secondary/60 border border-border/40">
                            <Globe size={18} className="text-primary" />
                            <div>
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Language</p>
                                <p className="text-sm font-semibold text-foreground">{channel.language.join(", ")}</p>
                            </div>
                        </div>
                    )}

                    {channel.category && (
                        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-secondary/60 border border-border/40">
                            <Tag size={18} className="text-primary" />
                            <div>
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Category</p>
                                <p className="text-sm font-semibold text-foreground">{channel.category}</p>
                            </div>
                        </div>
                    )}

                    <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-secondary/60 border border-border/40">
                        <Shield size={18} className="text-primary" />
                        <div>
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Access</p>
                            <p className="text-sm font-semibold text-foreground capitalize">
                                {channel.access_type === "pay_per_view" ? "Pay Per View" : channel.access_type}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Description */}
                {channel.description && (
                    <div className="space-y-2 max-w-3xl">
                        <h2 className="text-base font-semibold text-foreground">About</h2>
                        <p className="text-muted-foreground leading-relaxed">{channel.description}</p>
                    </div>
                )}

                {/* Related — same category */}
                {relatedChannels.length > 0 && (
                    <section className="space-y-4 pt-4 border-t border-border/40">
                        <h2 className="text-xl font-semibold text-foreground">
                            More in {channel.category}
                        </h2>
                        <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
                            {relatedChannels.map((c) => (
                                <RelatedChannelCard key={c.id} channel={c} />
                            ))}
                        </div>
                    </section>
                )}

                {guideChannels.length > 0 && <EpgGuide channels={guideChannels} embedded />}

                {/* Other channels */}
                {otherChannels.length > 0 && (
                    <section className="space-y-4 pt-4 border-t border-border/40">
                        <h2 className="text-xl font-semibold text-foreground">More Channels</h2>
                        <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
                            {otherChannels.map((c) => (
                                <RelatedChannelCard key={c.id} channel={c} />
                            ))}
                        </div>
                    </section>
                )}
            </div>


        </>
    );
}
