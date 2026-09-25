/**
 * PPV Events API Service
 */

import apiClient from "../client";
import { ENDPOINTS } from "../endpoints";

// ─── Constants ────────────────────────────────────────────────────────────────

export const PPV_EVENT_SOURCES = [
    { value: "rtmp", label: "Encoder or Streaming Software – RTMP" },
    { value: "external", label: "External Live Feed (M3U8 / HLS)" },
] as const;

export type PpvEventSource = (typeof PPV_EVENT_SOURCES)[number]["value"];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PpvEventThumbnails {
    banner: string | null;       // 16:9
    portrait: string | null;     // 2:3
    wide: string | null;         // 3:2
}

export interface PpvEventOut {
    id: string;
    client_id: string;
    title: string;
    slug: string;
    description: string | null;
    category: string | null;
    source: PpvEventSource;
    /** HLS playback URL: auto-generated for RTMP, supplied for external feeds. */
    stream_url: string | null;
    /** RTMP stream key, available to authenticated client administrators only. */
    rtmp_key: string | null;
    rtmp_ingest_url: string | null;
    thumbnails: PpvEventThumbnails;
    geo_fencing: { blocked_countries: string[] };
    pricing_plan_id: string | null;
    is_active: boolean;
    is_live: boolean;
    created_at: string;
    updated_at: string;
}

export interface PpvEventCreate {
    title: string;
    slug: string;
    description?: string | null;
    category?: string | null;
    source: PpvEventSource;
    stream_url?: string | null;
    thumbnails: PpvEventThumbnails;
    geo_fencing?: { blocked_countries: string[] };
    pricing_plan_id?: string | null;
    is_active?: boolean;
    is_live?: boolean;
}

export interface PpvEventUpdate extends Partial<PpvEventCreate> { }

// ─── Service functions ────────────────────────────────────────────────────────

export async function listPpvEvents(params?: {
    search?: string;
    page?: number;
    page_size?: number;
}): Promise<PpvEventOut[]> {
    const res = await apiClient.get<PpvEventOut[]>(ENDPOINTS.admin.ppvEvents, { params });
    return res.data;
}

export async function getPpvEvent(id: string): Promise<PpvEventOut> {
    const res = await apiClient.get<PpvEventOut>(ENDPOINTS.admin.ppvEvent(id));
    return res.data;
}

export async function createPpvEvent(payload: PpvEventCreate): Promise<PpvEventOut> {
    const res = await apiClient.post<PpvEventOut>(ENDPOINTS.admin.ppvEvents, payload);
    return res.data;
}

export async function updatePpvEvent(id: string, payload: PpvEventUpdate): Promise<PpvEventOut> {
    const res = await apiClient.patch<PpvEventOut>(ENDPOINTS.admin.ppvEvent(id), payload);
    return res.data;
}

export async function regeneratePpvEventKey(id: string): Promise<PpvEventOut> {
    const res = await apiClient.post<PpvEventOut>(ENDPOINTS.admin.ppvEventRegenerateKey(id));
    return res.data;
}

export async function togglePpvEventLive(id: string, isLive: boolean): Promise<PpvEventOut> {
    const res = await apiClient.patch<PpvEventOut>(ENDPOINTS.admin.ppvEventToggleLive(id), null, {
        params: { is_live: isLive },
    });
    return res.data;
}

export async function deletePpvEvent(id: string): Promise<void> {
    await apiClient.delete(ENDPOINTS.admin.ppvEvent(id));
}
