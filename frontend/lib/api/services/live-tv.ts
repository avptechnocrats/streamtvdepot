/**
 * Live TV Channels API Service
 */

import apiClient from "../client";
import { ENDPOINTS } from "../endpoints";

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
    categories: string[];  // category slugs
    language: string[];
    source: LiveTvSource;
    /** HLS playback URL — admin-supplied for external; auto-generated for rtmp */
    stream_url: string | null;
    /** RTMP stream key (source=rtmp only) */
    rtmp_key: string | null;
    /** Full RTMP ingest URL e.g. rtmp://139.59.95.221/live — computed server-side */
    rtmp_ingest_url: string | null;
    /** idle | live | error */
    stream_status: "idle" | "live" | "error";
    recording_status: "idle" | "recording" | "processing" | "ready" | "failed";
    recording_filename: string | null;
    recording_s3_key: string | null;
    recording_url: string | null;
    recording_started_at: string | null;
    recording_completed_at: string | null;
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

export interface LiveTvChannelCreate {
    title: string;
    slug: string;
    description?: string | null;
    categories?: string[];  // category slugs
    language?: string[];
    source: LiveTvSource;
    stream_url?: string | null;
    thumbnails: LiveTvThumbnails;
    is_active?: boolean;
    is_featured?: boolean;
    is_live?: boolean;
    geo_fencing?: { blocked_countries: string[] };
    access_type?: "free" | "subscription" | "pay_per_view";
    subscription_plan_ids?: string[];
}

export interface LiveTvChannelUpdate extends Partial<LiveTvChannelCreate> { }

const MAX_ADMIN_CONTENT_PAGE_SIZE = 100;

// ─── Service functions ────────────────────────────────────────────────────────

export async function listLiveTvChannels(params?: {
    search?: string;
    page?: number;
    page_size?: number;
}): Promise<LiveTvChannelOut[]> {
    const safeParams = {
        ...params,
        ...(params?.page_size !== undefined
            ? { page_size: Math.min(params.page_size, MAX_ADMIN_CONTENT_PAGE_SIZE) }
            : {}),
    };
    const res = await apiClient.get<LiveTvChannelOut[]>(ENDPOINTS.admin.liveTvChannels, { params: safeParams });
    return res.data;
}

export async function getLiveTvChannel(id: string): Promise<LiveTvChannelOut> {
    const res = await apiClient.get<LiveTvChannelOut>(ENDPOINTS.admin.liveTvChannel(id));
    return res.data;
}

export async function createLiveTvChannel(payload: LiveTvChannelCreate): Promise<LiveTvChannelOut> {
    const res = await apiClient.post<LiveTvChannelOut>(ENDPOINTS.admin.liveTvChannels, payload);
    return res.data;
}

export async function updateLiveTvChannel(id: string, payload: LiveTvChannelUpdate): Promise<LiveTvChannelOut> {
    const res = await apiClient.patch<LiveTvChannelOut>(ENDPOINTS.admin.liveTvChannel(id), payload);
    return res.data;
}

export async function deleteLiveTvChannel(id: string): Promise<void> {
    await apiClient.delete(ENDPOINTS.admin.liveTvChannel(id));
}

export async function toggleLiveTvLive(id: string, is_live: boolean): Promise<LiveTvChannelOut> {
    const res = await apiClient.patch<LiveTvChannelOut>(
        ENDPOINTS.admin.liveTvToggleLive(id),
        null,
        { params: { is_live } },
    );
    return res.data;
}

export async function regenerateLiveTvKey(id: string): Promise<LiveTvChannelOut> {
    const res = await apiClient.post<LiveTvChannelOut>(ENDPOINTS.admin.liveTvRegenerateKey(id));
    return res.data;
}
