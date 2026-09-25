/**
 * Audios API Service
 *
 * GET    /admin/content/audios          – list audios (pagination + search)
 * POST   /admin/content/audios          – create audio
 * GET    /admin/content/audios/:id      – single audio
 * PATCH  /admin/content/audios/:id      – update audio
 * DELETE /admin/content/audios/:id      – delete audio
 */

import apiClient from "../client";
import { ENDPOINTS } from "../endpoints";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AudioStatus = "draft" | "published" | "archived";
export type AudioAccessType = "free" | "subscription" | "ppv" | "rental";

export interface AudioOut {
    id: string;
    client_id: string;
    title: string;
    description: string | null;
    artist: string | null;
    album: string | null;
    genre: string | null;
    categories: string[];
    duration_seconds: number | null;
    file_url: string | null;
    thumbnail_url: string | null;
    access_type: AudioAccessType;
    subscription_plan_ids: string[];
    status: AudioStatus;
    is_featured: boolean;
    created_at: string;
}

export interface AudioCreate {
    title: string;
    description?: string | null;
    artist?: string | null;
    album?: string | null;
    genre?: string | null;
    categories?: string[];
    duration_seconds?: number | null;
    file_url?: string | null;
    thumbnail_url?: string | null;
    access_type?: AudioAccessType;
    subscription_plan_ids?: string[];
    status?: AudioStatus;
    is_featured?: boolean;
}

export interface AudioUpdate extends Partial<AudioCreate> { }

export interface ListAudiosParams {
    page?: number;
    page_size?: number;
    search?: string;
    status?: AudioStatus;
}

const MAX_ADMIN_CONTENT_PAGE_SIZE = 100;

// ─── Service functions ────────────────────────────────────────────────────────

export async function listAudios(params: ListAudiosParams = {}): Promise<AudioOut[]> {
    const safeParams = {
        ...params,
        ...(params.page_size !== undefined
            ? { page_size: Math.min(params.page_size, MAX_ADMIN_CONTENT_PAGE_SIZE) }
            : {}),
    };
    const { data } = await apiClient.get<AudioOut[]>(ENDPOINTS.admin.audios, { params: safeParams });
    return data;
}

export async function listTrashAudios(): Promise<AudioOut[]> {
    const { data } = await apiClient.get<AudioOut[]>(ENDPOINTS.admin.audiosTrash);
    return data;
}

export async function getAudio(id: string): Promise<AudioOut> {
    const { data } = await apiClient.get<AudioOut>(ENDPOINTS.admin.audio(id));
    return data;
}

export async function createAudio(payload: AudioCreate): Promise<AudioOut> {
    const { data } = await apiClient.post<AudioOut>(ENDPOINTS.admin.audios, payload);
    return data;
}

export async function updateAudio(id: string, payload: AudioUpdate): Promise<AudioOut> {
    const { data } = await apiClient.patch<AudioOut>(ENDPOINTS.admin.audio(id), payload);
    return data;
}

export async function deleteAudio(id: string): Promise<void> {
    await apiClient.delete(ENDPOINTS.admin.audio(id));
}

export async function restoreAudio(id: string): Promise<AudioOut> {
    const { data } = await apiClient.post<AudioOut>(ENDPOINTS.admin.audioRestore(id));
    return data;
}

export async function permanentDeleteAudio(id: string): Promise<void> {
    await apiClient.delete(ENDPOINTS.admin.audioPermanent(id));
}
