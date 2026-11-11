/**
 * Series API Service
 *
 * GET    /admin/content/series                              – list all series
 * POST   /admin/content/series                              – create series
 * GET    /admin/content/series/:id                          – single series
 * PATCH  /admin/content/series/:id                          – update series
 * DELETE /admin/content/series/:id                          – delete series
 * GET    /admin/content/series/:id/episodes                 – list episodes
 * POST   /admin/content/series/:id/episodes                 – create episode
 * PATCH  /admin/content/series/:id/episodes/:episodeId      – update episode
 * DELETE /admin/content/series/:id/episodes/:episodeId      – delete episode
 */

import apiClient from "../client";
import { ENDPOINTS } from "../endpoints";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SeriesStatus = "draft" | "published" | "archived";
export type SeriesAccessType = "free" | "subscription" | "ppv" | "rental";

export interface SeriesEditorSettings {
    languages?: string[];
    content_classification?: string | null;
    age_rating?: string | null;
    rating?: number | null;
    thumbnails?: { video_banner?: string | null; video_h_thumbnail?: string | null; video_w_thumbnail?: string | null };
    trailer_type?: "upload" | "url" | null;
    geo_fencing?: { blocked_countries: string[]; allowed_countries: string[] };
    publish_option?: "now" | "later";
    publish_at?: string | null;
    is_active?: boolean;
    is_slider?: boolean;
    is_series_slider?: boolean;
    is_category_only?: boolean;
    is_thumbnail?: boolean;
}

export interface SeriesOut extends SeriesEditorSettings {
    id: string;
    client_id: string;
    title: string;
    description: string | null;
    genre: string | null;
    categories: string[];
    language: string | null;
    thumbnail_url: string | null;
    trailer_url: string | null;
    access_type: SeriesAccessType;
    subscription_plan_ids: string[];
    status: SeriesStatus;
    is_featured: boolean;
    total_seasons: number;
    created_at: string;
}

export interface SeriesCreate extends SeriesEditorSettings {
    title: string;
    description?: string | null;
    genre?: string | null;
    categories?: string[];
    language?: string | null;
    thumbnail_url?: string | null;
    trailer_url?: string | null;
    access_type?: SeriesAccessType;
    subscription_plan_ids?: string[];
    status?: SeriesStatus;
    is_featured?: boolean;
    total_seasons?: number;
    episodes?: (Omit<EpisodeCreate, "series_id"> & { id?: string })[];
    deleted_episode_ids?: string[];
}

export interface SeriesUpdate extends Partial<SeriesCreate> { }

export interface EpisodeOut {
    id: string;
    client_id: string;
    series_id: string;
    title: string;
    description: string | null;
    season_number: number;
    episode_number: number;
    duration_seconds: number | null;
    video_url: string | null;
    thumbnail_url: string | null;
    status: SeriesStatus;
    created_at: string;
    media_asset_rendition_id?: string | null;
    transcode_status?: "pending" | "processing" | "complete" | "failed" | null;
    transcode_progress?: number | null;
    transcode_error?: string | null;
    stream_ready?: boolean;
}

export interface EpisodeCreate {
    series_id: string;
    title: string;
    description?: string | null;
    season_number: number;
    episode_number: number;
    duration_seconds?: number | null;
    video_url?: string | null;
    thumbnail_url?: string | null;
    status?: SeriesStatus;
}

export interface EpisodeUpdate extends Partial<Omit<EpisodeCreate, "series_id">> { }

export interface ListSeriesParams {
    page?: number;
    page_size?: number;
    search?: string;
    status?: SeriesStatus;
}

const MAX_ADMIN_CONTENT_PAGE_SIZE = 100;

// ─── Series service functions ─────────────────────────────────────────────────

export async function listSeries(params: ListSeriesParams = {}): Promise<SeriesOut[]> {
    const safeParams = {
        ...params,
        ...(params.page_size !== undefined
            ? { page_size: Math.min(params.page_size, MAX_ADMIN_CONTENT_PAGE_SIZE) }
            : {}),
    };
    const { data } = await apiClient.get<SeriesOut[]>(ENDPOINTS.admin.series, { params: safeParams });
    return data;
}

export async function listTrashSeries(): Promise<SeriesOut[]> {
    const { data } = await apiClient.get<SeriesOut[]>(ENDPOINTS.admin.seriesTrash);
    return data;
}

export async function getSeries(id: string): Promise<SeriesOut> {
    const { data } = await apiClient.get<SeriesOut>(ENDPOINTS.admin.seriesItem(id));
    return data;
}

export async function createSeries(payload: SeriesCreate): Promise<SeriesOut> {
    const { data } = await apiClient.post<SeriesOut>(ENDPOINTS.admin.series, payload);
    return data;
}

export async function saveSeriesEditor(payload: SeriesCreate, id?: string): Promise<SeriesOut> {
    const url = `${ENDPOINTS.admin.series}/editor`;
    const { data } = id
        ? await apiClient.patch<SeriesOut>(`${url}/${id}`, payload)
        : await apiClient.post<SeriesOut>(url, payload);
    return data;
}

export async function updateSeries(id: string, payload: SeriesUpdate): Promise<SeriesOut> {
    const { data } = await apiClient.patch<SeriesOut>(ENDPOINTS.admin.seriesItem(id), payload);
    return data;
}

export async function deleteSeries(id: string): Promise<void> {
    await apiClient.delete(ENDPOINTS.admin.seriesItem(id));
}

export async function restoreSeries(id: string): Promise<SeriesOut> {
    const { data } = await apiClient.post<SeriesOut>(ENDPOINTS.admin.seriesRestore(id));
    return data;
}

export async function permanentDeleteSeries(id: string): Promise<void> {
    await apiClient.delete(ENDPOINTS.admin.seriesPermanent(id));
}

// ─── Episodes service functions ───────────────────────────────────────────────

export async function listSeriesEpisodes(seriesId: string, season?: number): Promise<EpisodeOut[]> {
    const { data } = await apiClient.get<EpisodeOut[]>(
        ENDPOINTS.admin.seriesEpisodes(seriesId),
        season !== undefined ? { params: { season } } : undefined,
    );
    return data;
}

export async function retryEpisodeTranscode(seriesId: string, episodeId: string): Promise<EpisodeOut> {
    const { data } = await apiClient.post<EpisodeOut>(`${ENDPOINTS.admin.seriesEpisode(seriesId, episodeId)}/transcode`);
    return data;
}

export async function getEpisodeStreamPreview(seriesId: string, episodeId: string): Promise<{ stream_url: string }> {
    const { data } = await apiClient.get<{ stream_url: string }>(`${ENDPOINTS.admin.seriesEpisode(seriesId, episodeId)}/preview`);
    return data;
}

export async function createEpisode(seriesId: string, payload: EpisodeCreate): Promise<EpisodeOut> {
    const { data } = await apiClient.post<EpisodeOut>(ENDPOINTS.admin.seriesEpisodes(seriesId), payload);
    return data;
}

export async function updateEpisode(seriesId: string, episodeId: string, payload: EpisodeUpdate): Promise<EpisodeOut> {
    const { data } = await apiClient.patch<EpisodeOut>(ENDPOINTS.admin.seriesEpisode(seriesId, episodeId), payload);
    return data;
}

export async function deleteEpisode(seriesId: string, episodeId: string): Promise<void> {
    await apiClient.delete(ENDPOINTS.admin.seriesEpisode(seriesId, episodeId));
}
