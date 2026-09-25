import apiClient from "../client";
import { ENDPOINTS } from "../endpoints";
import type { AdvertisementEventCreate } from "./advertisements";

export type PlaybackAdMode = "ssai" | "csai" | "none";
export type PlaybackStrategy = "hybrid" | "csai" | "ssai" | "none";

export interface PlaybackAdConfig {
    tag_url: string;
    format: "vmap" | "vast";
    timeout_seconds: number;
    show_countdown: boolean;
}

export interface PlaybackFallback {
    csai: PlaybackAdConfig | null;
}

export interface PlaybackCreative {
    advertisement_id: string;
    title: string;
    ad_type: "video" | "banner" | "overlay" | "popup";
    media_url: string;
    click_through_url: string | null;
    duration_seconds: number | null;
    is_skippable: boolean;
    placement_type: "pre_roll" | "mid_roll" | "post_roll" | "overlay" | "banner" | "sidebar" | "cue";
    at_seconds: number | null;
    /** Unique per ad × slot × timestamp; absent on older backend responses. */
    break_key?: string;
}

export interface PlaybackDecisionOut {
    content_type: "video" | "live_stream";
    content_id: string;
    ad_mode: PlaybackAdMode;
    strategy: PlaybackStrategy;
    playback_url: string | null;
    ssai_url: string | null;
    ad_config: PlaybackAdConfig | null;
    fallback: PlaybackFallback | null;
    creatives: PlaybackCreative[];
    tracking_token: string | null;
}

export interface PlaybackDecisionParams {
    slug?: string;
    session_id?: string;
    strategy?: PlaybackStrategy;
}

export async function resolveVideoPlayback(
    videoId: string,
    params: PlaybackDecisionParams = {},
): Promise<PlaybackDecisionOut> {
    const res = await apiClient.get<PlaybackDecisionOut>(
        ENDPOINTS.public.playbackVideo(videoId),
        { params },
    );
    return res.data;
}

export async function resolveLiveStreamPlayback(
    streamId: string,
    params: PlaybackDecisionParams = {},
): Promise<PlaybackDecisionOut> {
    const res = await apiClient.get<PlaybackDecisionOut>(
        ENDPOINTS.public.playbackLiveStream(streamId),
        { params },
    );
    return res.data;
}

export async function reportAdvertisementEvent(
    advertisementId: string,
    slug: string,
    payload: AdvertisementEventCreate,
): Promise<void> {
    await apiClient.post(ENDPOINTS.public.advertisementEvent(advertisementId), payload, {
        params: { slug },
    });
}
