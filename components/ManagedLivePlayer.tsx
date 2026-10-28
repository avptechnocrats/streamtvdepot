"use client";

import { useEffect, useRef, useState } from "react";
import VideoPlayer from "@/components/VideoPlayer";
import { authorizeLivePlayback, type LivePlaybackAuthorization } from "@/lib/services/transcoding";

interface ManagedLivePlayerProps {
    channelId: string;
    poster?: string;
    className?: string;
    onError?: (message: string) => void;
}

const RETRY_MS = 15_000;

function applyCdnCookies({ cdn }: LivePlaybackAuthorization) {
    const expires = new Date(cdn.expires * 1000).toUTCString();
    for (const [name, value] of Object.entries(cdn.cookies)) {
        document.cookie = `${name}=${value}; Domain=${cdn.domain}; Path=/; Expires=${expires}; Secure; SameSite=Lax`;
    }
}

function errorMessage(error: unknown): string {
    const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
    return typeof detail === "string" ? detail : "Live stream is currently unavailable";
}

/**
 * Plays a managed live channel: obtains entitlement-checked CloudFront signed cookies, keeps them
 * fresh for the whole session, and plays the CDN URL (MediaTailor-stitched when ads are enabled).
 */
export default function ManagedLivePlayer({ channelId, poster, className, onError }: ManagedLivePlayerProps) {
    const [auth, setAuth] = useState<LivePlaybackAuthorization | null>(null);
    const onErrorRef = useRef(onError);

    useEffect(() => { onErrorRef.current = onError; }, [onError]);

    useEffect(() => {
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;

        const authorize = async (first: boolean) => {
            try {
                const next = await authorizeLivePlayback(channelId);
                if (cancelled) return;
                applyCdnCookies(next);
                // The URL is stable across renewals; only the first response mounts the player.
                if (first) setAuth(next);
                const renewIn = Math.max(10_000, (next.cdn.expires * 1000 - Date.now()) * 0.7);
                timer = setTimeout(() => void authorize(false), renewIn);
            } catch (error) {
                if (cancelled) return;
                if (first) {
                    onErrorRef.current?.(errorMessage(error));
                } else {
                    timer = setTimeout(() => void authorize(false), RETRY_MS);
                }
            }
        };

        void authorize(true);
        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [channelId]);

    if (!auth) {
        return (
            <div className={`w-full aspect-video bg-black flex items-center justify-center ${className ?? ""}`}>
                <div className="w-9 h-9 rounded-full border-[2.5px] border-white/20 border-t-white animate-spin" />
            </div>
        );
    }

    return (
        <VideoPlayer
            src={auth.stream_url}
            poster={poster}
            autoPlay
            allowSeeking={false}
            withCredentials
            lowLatency={auth.low_latency}
            className={className}
            onError={onError}
        />
    );
}
