/**
 * EPG (Electronic Program Guide) API Service
 */

import apiClient from "../client";
import { ENDPOINTS } from "../endpoints";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EPGChannelSummary {
    id: string;
    title: string;
    slug: string;
    source: "rtmp" | "srt";
    is_live: boolean;
    stream_status: "idle" | "live" | "error";
    thumbnails: {
        banner: string | null;
        portrait: string | null;
        wide: string | null;
    };
}

export interface EPGProgramOut {
    id: string;
    client_id: string;
    channel_id: string;
    video_id: string | null;
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
    created_at: string;
    updated_at: string;
}

export interface EPGProgramCreate {
    video_id?: string | null;
    title: string;
    description?: string | null;
    start_time: string;   // ISO-8601 UTC
    duration_minutes: number;
    category?: string | null;
    rating?: string | null;
    thumbnail_url?: string | null;
    sort_order?: number;
}

export interface EPGProgramUpdate {
    video_id?: string | null;
    title?: string;
    description?: string | null;
    start_time?: string;
    duration_minutes?: number;
    category?: string | null;
    rating?: string | null;
    thumbnail_url?: string | null;
    sort_order?: number;
}

export interface EPGReorderItem {
    id: string;
    sort_order: number;
}

export interface EPGImportResult {
    imported: number;
    skipped: number;
    errors: string[];
}

// Batch schedule save

export interface EPGScheduleProgramItem {
    video_id?: string | null;
    title: string;
    description?: string | null;
    duration_minutes: number;
    category?: string | null;
    rating?: string | null;
    thumbnail_url?: string | null;
}

export interface EPGScheduleSave {
    schedule_start: string;   // ISO-8601 UTC — start of first program
    playout_mode: "schedule" | "loop";
    programs: EPGScheduleProgramItem[];
}

// ─── Service Functions ────────────────────────────────────────────────────────

/** List all RTMP/SRT channels available for EPG scheduling. */
export async function listEPGChannels(): Promise<EPGChannelSummary[]> {
    const res = await apiClient.get<EPGChannelSummary[]>(ENDPOINTS.admin.epgChannels);
    return res.data;
}

/** List programs for a channel, optionally filtered to a specific date (YYYY-MM-DD). */
export async function listEPGPrograms(
    channelId: string,
    date?: string,
): Promise<EPGProgramOut[]> {
    const res = await apiClient.get<EPGProgramOut[]>(ENDPOINTS.admin.epgPrograms(channelId), {
        params: date ? { date } : undefined,
    });
    return res.data;
}

/** Create a single EPG program. end_time is calculated server-side. */
export async function createEPGProgram(
    channelId: string,
    payload: EPGProgramCreate,
): Promise<EPGProgramOut> {
    const res = await apiClient.post<EPGProgramOut>(
        ENDPOINTS.admin.epgPrograms(channelId),
        payload,
    );
    return res.data;
}

/** Update an EPG program. */
export async function updateEPGProgram(
    programId: string,
    payload: EPGProgramUpdate,
): Promise<EPGProgramOut> {
    const res = await apiClient.put<EPGProgramOut>(
        ENDPOINTS.admin.epgProgram(programId),
        payload,
    );
    return res.data;
}

/** Delete an EPG program. */
export async function deleteEPGProgram(programId: string): Promise<void> {
    await apiClient.delete(ENDPOINTS.admin.epgProgram(programId));
}

/** Bulk reorder programs (drag-drop). Returns updated programs in new order. */
export async function reorderEPGPrograms(
    channelId: string,
    items: EPGReorderItem[],
): Promise<EPGProgramOut[]> {
    const res = await apiClient.post<EPGProgramOut[]>(
        ENDPOINTS.admin.epgReorder(channelId),
        items,
    );
    return res.data;
}

/**
 * Import programs from an XMLTV XML file.
 * @param replace - when true, existing programs for the channel are cleared first
 */
export async function importEPGXMLTV(
    channelId: string,
    file: File,
    replace = false,
): Promise<EPGImportResult> {
    const form = new FormData();
    form.append("file", file);
    const res = await apiClient.post<EPGImportResult>(
        ENDPOINTS.admin.epgImport(channelId),
        form,
        {
            params: { replace },
            headers: { "Content-Type": "multipart/form-data" },
        },
    );
    return res.data;
}

/**
 * Batch-save a full schedule for a channel.
 * Replaces all existing programs on the same calendar date as schedule_start.
 * Returns saved programs in sequential order.
 */
export async function saveEPGSchedule(
    channelId: string,
    payload: EPGScheduleSave,
): Promise<EPGProgramOut[]> {
    const res = await apiClient.post<EPGProgramOut[]>(
        ENDPOINTS.admin.epgSchedule(channelId),
        payload,
    );
    return res.data;
}
