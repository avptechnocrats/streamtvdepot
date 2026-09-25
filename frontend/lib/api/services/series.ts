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

export interface SeriesOut {
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

export interface SeriesCreate {
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
