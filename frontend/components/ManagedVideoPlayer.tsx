"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import VideoPlayer, { type DirectAdEventType } from "@/components/VideoPlayer";
import {
    reportAdvertisementEvent,
    resolveVideoPlayback,
    type PlaybackCreative,
    type PlaybackDecisionOut,
} from "@/lib/api/services/public-playback";

interface ManagedVideoPlayerProps {
    videoId: string;
    clientSlug: string;
    fallbackSrc: string;
    poster?: string;
    autoPlay?: boolean;
    className?: string;
    onError?: (message: string) => void;
}

function eventId(): string {
    return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function ManagedVideoPlayer({
    videoId,
    clientSlug,
    fallbackSrc,
    poster,
    autoPlay = false,
    className,
    onError,
}: ManagedVideoPlayerProps) {
    const sessionId = useRef(eventId());
    const reportedDisplayAds = useRef(new Set<string>());
    const onErrorRef = useRef(onError);
    const [decision, setDecision] = useState<PlaybackDecisionOut | null>(null);

    useEffect(() => { onErrorRef.current = onError; }, [onError]);

    useEffect(() => {
        let cancelled = false;
        resolveVideoPlayback(videoId, { slug: clientSlug, session_id: sessionId.current })
            .then((value) => { if (!cancelled) setDecision(value); })
            .catch((error: unknown) => {
                if (!cancelled) onErrorRef.current?.(error instanceof Error ? error.message : "Playback policy could not be resolved");
            });
        return () => { cancelled = true; };
    }, [clientSlug, videoId]);

    const report = useCallback((creative: PlaybackCreative, eventType: DirectAdEventType | "click") => {
        if (!decision?.tracking_token) return;
        void reportAdvertisementEvent(creative.advertisement_id, clientSlug, {
            event_id: eventId(),
            advertisement_id: creative.advertisement_id,
            event_type: eventType,
            session_id: sessionId.current,
            content_type: "video",
            content_id: videoId,
            placement_type: creative.placement_type,
            occurred_at: new Date().toISOString(),
            tracking_token: decision.tracking_token,
        });
    }, [clientSlug, decision?.tracking_token, videoId]);

    const displayCreatives = useMemo(
        () => decision?.creatives.filter((creative) => creative.ad_type !== "video") ?? [],
        [decision],
    );

    useEffect(() => {
        for (const creative of displayCreatives) {
            if (!reportedDisplayAds.current.has(creative.advertisement_id)) {
                reportedDisplayAds.current.add(creative.advertisement_id);
                report(creative, "impression");
            }
        }
    }, [displayCreatives, report]);

    const source = decision?.playback_url ?? fallbackSrc;
    const adConfig = decision?.ad_config ? {
        mode: "csai" as const,
        tagUrl: decision.ad_config.tag_url,
        timeout: decision.ad_config.timeout_seconds,
        showCountdown: decision.ad_config.show_countdown,
    } : undefined;

    return (
        <div className={`relative ${className ?? ""}`}>
            <VideoPlayer
                src={source}
                videoId={videoId}
                poster={poster}
                autoPlay={autoPlay}
                adConfig={adConfig}
                onError={onError}
            />
            {displayCreatives.map((creative) => (
                <a
                    key={`${creative.advertisement_id}-${creative.placement_type}`}
                    href={creative.click_through_url ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer sponsored"
                    aria-label={`Advertisement: ${creative.title}`}
                    onClick={() => report(creative, "click")}
                    className={creative.placement_type === "sidebar"
                        ? "absolute right-3 top-3 z-20 w-32 overflow-hidden rounded border border-white/30 bg-black/80"
                        : "absolute bottom-12 left-1/2 z-20 w-[min(90%,480px)] -translate-x-1/2 overflow-hidden rounded border border-white/30 bg-black/80"}
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={creative.media_url} alt={creative.title} className="block max-h-24 w-full object-contain" />
                    <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[10px] text-white">Ad</span>
                </a>
            ))}
        </div>
    );
}