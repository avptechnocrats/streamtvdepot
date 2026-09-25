/**
 * Public Live Streams & EPG API Service
 *
 * No authentication required. Slug is sent via the global X-Client-Slug header.
 */

import apiClient from "../client";
import { ENDPOINTS } from "../endpoints";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PublicLiveStreamThumbnails {
    banner: string | null;
    portrait: string | null;
    wide: string | null;
}

export interface PublicLiveStreamOut {
    id: string;
    client_id: string;
    title: string;
    slug: string;
    description: string | null;
    categories: string[];
    language: string[];
    source: string;
    stream_url: string | null;
    stream_status: "idle" | "live" | "error";
    recording_status: "idle" | "recording" | "processing" | "ready" | "failed";
    recording_filename: string | null;
    recording_s3_key: string | null;
    recording_url: string | null;
    recording_started_at: string | null;
    recording_completed_at: string | null;
    thumbnails: PublicLiveStreamThumbnails;
    is_active: boolean;
    is_featured: boolean;
    is_live: boolean;
    geo_fencing: { blocked_countries: string[] };
    access_type: "free" | "subscription" | "pay_per_view";
    subscription_plan_ids: string[];
    created_at: string;
    updated_at: string;
}

export interface EPGProgramPublic {
    id: string;
    client_id: string;
    channel_id: string;
    title: string;
    description: string | null;
    start_time: string;   // ISO-8601 UTC
    end_time: string;     // ISO-8601 UTC
    duration_minutes: number;
    category: string | null;
    rating: string | null;
    thumbnail_url: string | null;
    sort_order: number;
    playout_mode: "schedule" | "loop";
    created_at: string | null;
    updated_at: string | null;
}

export interface PublicEPGResponse {
    channel_id: string;
    programs: EPGProgramPublic[];
}

// ─── Service functions ────────────────────────────────────────────────────────

export async function listPublicLiveStreams(params?: {
    slug?: string;
    page?: number;
    page_size?: number;
}): Promise<PublicLiveStreamOut[]> {
    const res = await apiClient.get<PublicLiveStreamOut[]>(ENDPOINTS.public.liveStreams, { params });
    return res.data;
}

export async function getPublicLiveStreamEPG(
    streamId: string,
    params?: { date?: string; days?: number },
): Promise<PublicEPGResponse> {
    const res = await apiClient.get<PublicEPGResponse>(
        ENDPOINTS.public.liveStreamEpg(streamId),
        { params },
    );
    return res.data;
}
