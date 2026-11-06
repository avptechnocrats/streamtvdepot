import axios from "axios";
import publicApiClient from "./public-client";
import { TOKEN_KEYS } from "./client";
import type { ThumbnailView } from "./categories";

export interface SeriesItem {
    id: string;
    title: string;
    description: string | null;
    genre: string | null;
    categories: string[];
    language: string | null;
    languages?: string[];
    age_rating?: string | null;
    content_classification?: string | null;
    rating?: number | null;
    thumbnail_url: string | null;
    thumbnails?: { video_banner?: string | null; video_h_thumbnail?: string | null; video_w_thumbnail?: string | null };
    trailer_url: string | null;
    trailer_type?: "upload" | "url" | null;
    total_seasons: number;
    is_featured: boolean;
    is_slider?: boolean;
    is_series_slider?: boolean;
    access_type: "free" | "subscription" | "ppv" | "rental";
    created_at: string;
}

export interface SeriesEpisode {
    id: string;
    title: string;
    description: string | null;
    season_number: number;
    episode_number: number;
    duration_seconds: number | null;
    thumbnail_url: string | null;
    has_media: boolean;
}

export interface SeriesFilters {
    search?: string;
    category?: string;
    language?: string;
    sort?: "featured" | "latest" | "rating";
}

export async function fetchSeriesPage(page = 1, filters: SeriesFilters = {}, signal?: AbortSignal): Promise<{ items: SeriesItem[]; has_more: boolean }> {
    try {
        const { data } = await publicApiClient.get<SeriesItem[]>("/series", {
            params: { page, page_size: 30, ...filters }, signal,
        });
        return { items: data, has_more: data.length === 30 };
    } catch (error) {
        if (!axios.isAxiosError(error) || error.response?.status !== 404) throw error;
        const response = await fetchSeriesRows(page);
        const items = Array.from(new Map(response.rows.flatMap(row => row.items).map(series => [series.id, series])).values());
        const filtered = items.filter(series => (!filters.search || `${series.title} ${series.description || ""} ${series.genre || ""}`.toLowerCase().includes(filters.search.toLowerCase()))
            && (!filters.category || series.categories.includes(filters.category))
            && (!filters.language || (series.languages || [series.language]).includes(filters.language)));
        if (filters.sort === "rating") filtered.sort((first, second) => (second.rating ?? 0) - (first.rating ?? 0));
        else if (filters.sort === "latest") filtered.sort((first, second) => new Date(second.created_at).getTime() - new Date(first.created_at).getTime());
        return { items: filtered, has_more: response.has_more };
    }
}

export async function getSeries(id: string): Promise<SeriesItem> {
    const { data } = await publicApiClient.get<SeriesItem>(`/series/${encodeURIComponent(id)}`);
    return data;
}

export async function getSeriesEpisodes(id: string): Promise<SeriesEpisode[]> {
    const { data } = await publicApiClient.get<SeriesEpisode[]>(`/series/${encodeURIComponent(id)}/episodes`);
    return data;
}

export async function authorizeSeriesEpisode(seriesId: string, episodeId: string): Promise<string> {
    const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEYS.access) : null;
    const { data } = await publicApiClient.post<{ stream_url: string }>(
        `/series/${encodeURIComponent(seriesId)}/episodes/${encodeURIComponent(episodeId)}/playback`,
        null,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    );
    return data.stream_url;
}

export interface SeriesCategoryRow {
    category_id: string;
    category_name: string;
    category_slug: string;
    content_type: string;
    thumbnail_view?: ThumbnailView;
    items: SeriesItem[];
}

export interface SeriesRowsResponse {
    rows: SeriesCategoryRow[];
    page: number;
    page_size: number;
    has_more: boolean;
}

export async function fetchSeriesRows(page = 1): Promise<SeriesRowsResponse> {
    const { data } = await publicApiClient.get<SeriesRowsResponse>("/home-contents", {
        params: { content_type: "series", page, page_size: 10, items_per_row: 30 },
    });
    return { ...data, rows: data.rows.filter(row => row.content_type === "series") };
}

export function seriesArtwork(series: SeriesItem, landscape = false): string {
    const artwork = series.thumbnails;
    return (landscape ? artwork?.video_banner || artwork?.video_w_thumbnail : artwork?.video_h_thumbnail)
        || series.thumbnail_url || artwork?.video_banner || artwork?.video_w_thumbnail || "/images/hero-banner.jpg";
}