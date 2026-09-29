/**
 * Live TV Channels API Service
 */

import publicApiClient from "./public-client";

// ─── Constants ────────────────────────────────────────────────────────────────

export const LIVE_TV_SOURCES = [
    { value: "rtmp", label: "Encoder or Streaming Software – RTMP" },
    { value: "srt", label: "Encoder or Streaming Software – SRT" },
    { value: "external", label: "External Live Feed (M3U8 / HLS)" },
] as const;

export type LiveTvSource = (typeof LIVE_TV_SOURCES)[number]["value"];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LiveTvThumbnails {
    banner: string | null;    // 16:9
    portrait: string | null;  // 2:3
    wide: string | null;      // 3:2
}

export interface LiveTvChannelOut {
    id: string;
    client_id: string;
    title: string;
    slug: string;
    description: string | null;
    category: string | null;
    language: string[];
    source: LiveTvSource;
    stream_url: string | null;
    stream_status: "idle" | "live" | "error";
    thumbnails: LiveTvThumbnails;
    is_active: boolean;
    is_featured: boolean;
    is_live: boolean;
    geo_fencing: { blocked_countries: string[] };
    access_type: "free" | "subscription" | "pay_per_view";
    subscription_plan_ids: string[];
    created_at: string;
    updated_at: string;
}

// ─── Service functions ────────────────────────────────────────────────────────

export async function listLiveTvChannels(params?: {
    search?: string;
    page?: number;
    page_size?: number;
}): Promise<LiveTvChannelOut[]> {
    const res = await publicApiClient.get<LiveTvChannelOut[]>("/live-streams", { params });
    return res.data;
}

export async function getLiveTvChannel(id: string): Promise<LiveTvChannelOut> {
    const res = await publicApiClient.get<LiveTvChannelOut>(`/live-streams/${id}`);
    return res.data;
}

// ─── EPG Types ────────────────────────────────────────────────────────────────

export interface EpgProgram {
    id: string;
    channel_id: string;
    video_id?: string | null;
    title: string;
    description: string | null;
    start_time: string;   // ISO-8601 UTC
    end_time: string;     // ISO-8601 UTC
    duration_minutes: number;
    category: string | null;
    rating: string | null;
    thumbnail_url: string | null;
    playout_mode: "schedule" | "loop";
}

export interface ChannelEpgResponse {
    channel_id: string;
    programs: EpgProgram[];
}

export async function getChannelEpg(
    channelId: string,
    date?: string,   // YYYY-MM-DD, defaults to today
    days = 1,
): Promise<ChannelEpgResponse> {
    const params: Record<string, string | number> = { days };
    if (date) params.date = date;
    const res = await publicApiClient.get<ChannelEpgResponse>(
        `/live-streams/${channelId}/epg`,
        { params },
    );
    return res.data;
}
