"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import VideoPlayer, { type DirectAdEventType } from "@/components/VideoPlayer";

interface PlaybackCreative {
    advertisement_id: string;
    title: string;
    ad_type: "video" | "banner" | "overlay" | "popup";
    media_url: string;
    click_through_url: string | null;
    duration_seconds: number | null;
    is_skippable: boolean;
    placement_type: "pre_roll" | "mid_roll" | "post_roll" | "overlay" | "banner" | "sidebar" | "cue";
    at_seconds: number | null;
    break_key?: string;
}

interface PlaybackDecision {
    ad_mode: "ssai" | "csai" | "none";
    playback_url: string | null;
    ad_config: { tag_url: string; timeout_seconds: number; show_countdown: boolean } | null;
    creatives: PlaybackCreative[];
    tracking_token: string | null;
}

interface ManagedVideoPlayerProps {
    videoId: string;
    /**
     * When set, the video is authorized as an EPG program of this channel — gated
     * by the channel's access, not the video's. The resolved manifest already
     * carries any required token, so the player skips the video-scoped DRM fetch.
     */
    channelId?: string;
    fallbackSrc: string;
    poster?: string;
    autoPlay?: boolean;
    allowSeeking?: boolean;
    /** Seconds to seek to once after load — join a linear program at its live offset. */
    startAt?: number;
    immersiveControls?: boolean;
    title?: string;
    className?: string;
    onClose?: () => void;
    onError?: (message: string) => void;
}

function randomId(): string {
    return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// IAB-style defaults for non-linear display ads: fixed on-screen duration, then hide,
// then re-show a capped number of times so the banner cycles without nagging the viewer all session.
const DEFAULT_BANNER_DISPLAY_SECONDS = 20;
const BANNER_REPEAT_INTERVAL_SECONDS = 5 * 60;
const BANNER_MAX_IMPRESSIONS_PER_SESSION = 3;

export default function ManagedVideoPlayer(props: ManagedVideoPlayerProps) {
    const sessionId = useRef(randomId());
    const onErrorRef = useRef(props.onError);
    const [decision, setDecision] = useState<PlaybackDecision | null>(null);
    const [authorizedSource, setAuthorizedSource] = useState<string | null>(null);
    // dismissed display-ad IDs — viewer clicked ×, suppressed for the rest of the session
    const [dismissed, setDismissed] = useState<Set<string>>(new Set());
    const dismissedRef = useRef<Set<string>>(new Set());
    // banner ids currently on screen mid-cycle (show -> hide -> wait -> show again, up to the cap)
    const [visibleBanners, setVisibleBanners] = useState<Set<string>>(new Set());
    const bannerTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
    // cue-point creatives (any ad_type pinned to an at_seconds mark) — visibility derives directly
    // from playback position, keyed by break_key so the same ad can cue at several timestamps
    const [visibleCues, setVisibleCues] = useState<Set<string>>(new Set());
    const reportedCueImpressions = useRef<Set<string>>(new Set());

    useEffect(() => { dismissedRef.current = dismissed; }, [dismissed]);

    useEffect(() => { onErrorRef.current = props.onError; }, [props.onError]);

    useEffect(() => {
        let cancelled = false;
        fetch(`/api/public/playback/video/${props.videoId}?session_id=${encodeURIComponent(sessionId.current)}`, { cache: "no-store" })
            .then(async (response) => {
                if (!response.ok) throw new Error("Playback policy could not be resolved");
                return response.json() as Promise<PlaybackDecision>;
            })
            .then((value) => { if (!cancelled) setDecision(value); })
            .catch((error: unknown) => {
                if (!cancelled) onErrorRef.current?.(error instanceof Error ? error.message : "Playback policy could not be resolved");
            });
        return () => { cancelled = true; };
    }, [props.videoId]);

    useEffect(() => {
        let cancelled = false;
        const channelId = props.channelId;
        import("@/lib/services/transcoding")
            .then(({ authorizeVideoPlayback, authorizeChannelProgramPlayback }) =>
                channelId
                    ? authorizeChannelProgramPlayback(channelId, props.videoId)
                    : authorizeVideoPlayback(props.videoId),
            )
            .then(({ stream_url }) => { if (!cancelled) setAuthorizedSource(stream_url); })
            .catch(() => { if (!cancelled) setAuthorizedSource(props.fallbackSrc); });
        return () => { cancelled = true; };
    }, [props.videoId, props.channelId, props.fallbackSrc]);

    const report = useCallback((creative: PlaybackCreative, eventType: DirectAdEventType | "click") => {
        if (!decision?.tracking_token) return;
        void fetch(`/api/public/ads/${creative.advertisement_id}/events`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                event_id: randomId(),
                advertisement_id: creative.advertisement_id,
                event_type: eventType,
                session_id: sessionId.current,
                content_type: "video",
                content_id: props.videoId,
                placement_type: creative.placement_type,
                occurred_at: new Date().toISOString(),
                tracking_token: decision.tracking_token,
            }),
            keepalive: true,
        });
    }, [decision?.tracking_token, props.videoId]);

    const displayAds = useMemo(
        () => (decision?.creatives ?? []).filter((item) => {
            if (item.ad_type === "video") return false;
            // Cue-point ads are dismissed per scheduled instance (break_key) — closing the
            // 90s cue shouldn't suppress the same ad's 180s/240s cues. Cycling banners are
            // dismissed per ad for the whole session, since they're a single repeating slot.
            const dismissKey = item.at_seconds != null ? (item.break_key || item.advertisement_id) : item.advertisement_id;
            if (dismissed.has(dismissKey)) return false;
            if (item.at_seconds != null) return visibleCues.has(item.break_key || item.advertisement_id);
            return visibleBanners.has(item.advertisement_id);
        }),
        [decision, dismissed, visibleBanners, visibleCues],
    );

    // Cue-point ads: visibility is derived directly from playback position on every tick, so it
    // naturally handles pause/seek/rewind — show while inside [at_seconds, at_seconds + duration).
    const handleTimeUpdate = useCallback((currentTime: number) => {
        const cueCreatives = (decision?.creatives ?? []).filter(
            (item) => item.ad_type !== "video" && item.at_seconds != null,
        );
        if (cueCreatives.length === 0) return;
        setVisibleCues((prev) => {
            let changed = false;
            const next = new Set(prev);
            for (const creative of cueCreatives) {
                const key = creative.break_key || creative.advertisement_id;
                if (dismissedRef.current.has(key)) {
                    if (next.delete(key)) changed = true;
                    continue;
                }
                const start = creative.at_seconds ?? 0;
                const displaySeconds = creative.duration_seconds && creative.duration_seconds > 0
                    ? creative.duration_seconds
                    : DEFAULT_BANNER_DISPLAY_SECONDS;
                const withinWindow = currentTime >= start && currentTime < start + displaySeconds;
                if (withinWindow && !next.has(key)) {
                    next.add(key);
                    changed = true;
                    if (!reportedCueImpressions.current.has(key)) {
                        reportedCueImpressions.current.add(key);
                        report(creative, "impression");
                    }
                } else if (!withinWindow && next.has(key)) {
                    next.delete(key);
                    changed = true;
                }
            }
            return changed ? next : prev;
        });
    }, [decision, report]);

    // Schedule each session-cycled display/overlay/native/popup ad's show -> hide -> wait -> show
    // cycle, capped per session. Cue-point ads (at_seconds set) are excluded — those are driven by
    // handleTimeUpdate instead, tied to the video's own playback position.
    useEffect(() => {
        const eligible = (decision?.creatives ?? []).filter((item) => item.ad_type !== "video" && item.at_seconds == null);
        if (eligible.length === 0) return;
        const timers = bannerTimers.current;

        const cycle = (creative: PlaybackCreative, impressionNumber: number) => {
            if (dismissedRef.current.has(creative.advertisement_id)) return;
            setVisibleBanners((prev) => new Set([...prev, creative.advertisement_id]));
            report(creative, "impression");

            const displaySeconds = creative.duration_seconds && creative.duration_seconds > 0
                ? creative.duration_seconds
                : DEFAULT_BANNER_DISPLAY_SECONDS;
            const hideTimer = setTimeout(() => {
                setVisibleBanners((prev) => {
                    const next = new Set(prev);
                    next.delete(creative.advertisement_id);
                    return next;
                });
                if (impressionNumber < BANNER_MAX_IMPRESSIONS_PER_SESSION && !dismissedRef.current.has(creative.advertisement_id)) {
                    const showTimer = setTimeout(() => cycle(creative, impressionNumber + 1), BANNER_REPEAT_INTERVAL_SECONDS * 1000);
                    timers.set(creative.advertisement_id, showTimer);
                }
            }, displaySeconds * 1000);
            timers.set(creative.advertisement_id, hideTimer);
        };

        for (const creative of eligible) {
            cycle(creative, 1);
        }

        return () => {
            for (const timer of timers.values()) clearTimeout(timer);
            timers.clear();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [decision]);

    return (
        <div className={`relative ${props.className ?? ""}`}>
            {/* Pre-roll gate: hold on poster+spinner until ad policy resolves so content never starts before a pre-roll */}
            {!decision || !authorizedSource ? (
                <div className={
                    props.immersiveControls
                        ? "w-full h-full bg-black flex items-center justify-center"
                        : "w-full aspect-video bg-black flex items-center justify-center relative overflow-hidden"
                }>
                    {props.poster && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={props.poster} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover opacity-30" />
                    )}
                    <div className="relative w-9 h-9 rounded-full border-[2.5px] border-white/20 border-t-white animate-spin" />
                </div>
            ) : (
                <VideoPlayer
                    src={authorizedSource}
                    videoId={props.channelId ? undefined : props.videoId}
                    poster={props.poster}
                    autoPlay={props.autoPlay}
                    allowSeeking={props.allowSeeking}
                    startAt={props.startAt}
                    immersiveControls={props.immersiveControls}
                    title={props.title}
                    onClose={props.onClose}
                    onError={props.onError}
                    onTimeUpdate={handleTimeUpdate}
                    className="h-full w-full"
                    adConfig={decision.ad_config ? {
                        tagUrl: decision.ad_config.tag_url,
                        timeout: decision.ad_config.timeout_seconds,
                        showCountdown: decision.ad_config.show_countdown,
                    } : undefined}
                />
            )}

            {/* Display / overlay / banner / native creatives rendered as HTML over the player */}
            {displayAds.map((creative) => (
                <div
                    key={creative.break_key || `${creative.advertisement_id}-${creative.placement_type}`}
                    className={`animate-in fade-in slide-in-from-bottom-2 duration-300 ease-out ${creative.placement_type === "sidebar"
                        ? "absolute right-4 top-20 z-30 w-36 overflow-hidden rounded border border-white/30 bg-black/80"
                        : "absolute bottom-20 left-1/2 z-30 w-[min(90%,480px)] -translate-x-1/2 overflow-hidden rounded border border-white/30 bg-black/80"}`}
                >
                    <a
                        href={creative.click_through_url ?? undefined}
                        target="_blank"
                        rel="noopener noreferrer sponsored"
                        aria-label={`Advertisement: ${creative.title}`}
                        onClick={() => report(creative, "click")}
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={creative.media_url} alt={creative.title} className="block max-h-24 w-full object-contain" />
                    </a>
                    <span className="absolute left-1 top-1 rounded bg-black/75 px-1 text-[10px] text-white select-none">Ad</span>
                    {/* Dismiss button — always present so viewer can close the creative; stops the cycle for the rest of the session */}
                    <button
                        type="button"
                        aria-label="Close advertisement"
                        onClick={() => {
                            const dismissKey = creative.at_seconds != null ? (creative.break_key || creative.advertisement_id) : creative.advertisement_id;
                            const timer = bannerTimers.current.get(creative.advertisement_id);
                            if (timer) clearTimeout(timer);
                            bannerTimers.current.delete(creative.advertisement_id);
                            setVisibleBanners((prev) => {
                                const next = new Set(prev);
                                next.delete(creative.advertisement_id);
                                return next;
                            });
                            setVisibleCues((prev) => {
                                const next = new Set(prev);
                                next.delete(creative.break_key || creative.advertisement_id);
                                return next;
                            });
                            setDismissed((prev) => new Set([...prev, dismissKey]));
                        }}
                        className="absolute right-1 top-1 w-5 h-5 flex items-center justify-center rounded-full bg-black/70 text-white text-[11px] leading-none hover:bg-black/90 focus:outline-none"
                    >
                        ×
                    </button>
                </div>
            ))}
        </div>
    );
}