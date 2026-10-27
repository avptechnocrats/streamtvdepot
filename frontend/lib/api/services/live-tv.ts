/**
 * Live TV Channels API Service
 */

import apiClient from "../client";
import { ENDPOINTS } from "../endpoints";

// ─── Constants ────────────────────────────────────────────────────────────────

// SRT will implement in future.
export const LIVE_TV_SOURCES = [
    { value: "rtmp", label: "Encoder or Streaming Software – RTMP" },
    { value: "external", label: "External Live Feed (M3U8 / HLS)" },
] as const;

export type LiveTvSource = (typeof LIVE_TV_SOURCES)[number]["value"];

/** Streaming engine for RTMP channels: our own RTMP server, or AWS MediaLive. */
export type LiveTvPipeline = "legacy" | "aws";

export interface LiveTvPipelineStatus {
    available: boolean;
    /** Server settings still missing when unavailable. */
    missing: string[];
}

export interface LiveTvPipelinesOut {
    default: LiveTvPipeline;
    legacy: LiveTvPipelineStatus;
    aws: LiveTvPipelineStatus;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LiveTvOptions {
    ads_enabled: boolean;
    ad_decision_server_url?: string | null;
    preroll_seconds?: number;
    record_vod: boolean;
}

export interface LiveTvManaged {
    /** provisioning | ready | error */
    status: "provisioning" | "ready" | "error";
    error: string | null;
    /** IDLE | STARTING | RUNNING | STOPPING … */
    channel_state: string | null;
    options: Partial<LiveTvOptions>;
    ingest_endpoints: { server: string; stream_key: string }[];
    vod_status: "harvesting" | "complete" | "failed" | null;
}

export interface LiveTvAdBreak {
    id: string;
    live_stream_id: string;
    duration_seconds: number;
    status: "requested" | "failed";
    error_message: string | null;
    created_at: string;
}

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
    /** Present when the channel runs on the managed AWS pipeline. */
    managed?: LiveTvManaged | null;
    /** Streaming engine of an RTMP channel. */
    pipeline?: LiveTvPipeline | null;
    vod_video_id?: string | null;
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
    live_options?: LiveTvOptions;
    pipeline?: LiveTvPipeline;
}

export interface LiveTvChannelUpdate extends Partial<LiveTvChannelCreate> { }

const MAX_ADMIN_CONTENT_PAGE_SIZE = 100;

// ─── Service functions ────────────────────────────────────────────────────────

export async function getLiveTvPipelines(): Promise<LiveTvPipelinesOut> {
    const res = await apiClient.get<LiveTvPipelinesOut>(ENDPOINTS.admin.liveTvPipelines);
    return res.data;
}

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


// ─── Managed pipeline ─────────────────────────────────────────────────────────

export async function startLiveTvChannel(id: string): Promise<LiveTvChannelOut> {
    const res = await apiClient.post<LiveTvChannelOut>(ENDPOINTS.admin.liveTvManaged(id, "start"));
    return res.data;
}

export async function stopLiveTvChannel(id: string): Promise<LiveTvChannelOut> {
    const res = await apiClient.post<LiveTvChannelOut>(ENDPOINTS.admin.liveTvManaged(id, "stop"));
    return res.data;
}

export async function retryLiveTvProvisioning(id: string): Promise<LiveTvChannelOut> {
    const res = await apiClient.post<LiveTvChannelOut>(ENDPOINTS.admin.liveTvManaged(id, "provision"));
    return res.data;
}

export async function updateLiveTvOptions(id: string, options: LiveTvOptions): Promise<LiveTvChannelOut> {
    const res = await apiClient.put<LiveTvChannelOut>(ENDPOINTS.admin.liveTvManaged(id, "options"), options);
    return res.data;
}

export async function exportLiveTvVod(id: string, range: { start: string; end: string }): Promise<LiveTvChannelOut> {
    const res = await apiClient.post<LiveTvChannelOut>(ENDPOINTS.admin.liveTvManaged(id, "export-vod"), range);
    return res.data;
}

/** Interrupt the live feed with a server-side ad break of the given length. */
export async function triggerLiveTvAdBreak(id: string, durationSeconds: number): Promise<LiveTvAdBreak> {
    const res = await apiClient.post<LiveTvAdBreak>(ENDPOINTS.admin.liveTvAdBreaks(id), {
        duration_seconds: durationSeconds,
    });
    return res.data;
}

export async function listLiveTvAdBreaks(id: string): Promise<LiveTvAdBreak[]> {
    const res = await apiClient.get<LiveTvAdBreak[]>(ENDPOINTS.admin.liveTvAdBreaks(id));
    return res.data;
}
export async function regenerateLiveTvKey(id: string): Promise<LiveTvChannelOut> {
    const res = await apiClient.post<LiveTvChannelOut>(ENDPOINTS.admin.liveTvRegenerateKey(id));
    return res.data;
}
