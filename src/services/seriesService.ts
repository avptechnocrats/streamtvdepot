import { publicApiClient } from "@/api/client";
import { useAuthStore } from "@/store/authStore";
import { ContentItem, HomeRow } from "@/types/models";

export interface SeriesOut {
  id: string;
  title: string;
  description: string | null;
  rating?: number | null;
  created_at: string;
  thumbnail_url: string | null;
  total_seasons: number;
  access_type: "free" | "subscription" | "ppv" | "rental";
  thumbnails?: {
    video_banner?: string | null;
    video_h_thumbnail?: string | null;
    video_w_thumbnail?: string | null;
  };
}

export interface SeriesEpisode {
  id: string;
  title: string;
  description: string | null;
  season_number: number;
  episode_number: number;
  duration_seconds: number | null;
  created_at?: string;
  thumbnail_url: string | null;
  has_media: boolean;
}

interface SeriesRowsResponse {
  rows: HomeRow[];
}

function mapSeries(series: SeriesOut): ContentItem {
  return {
    id: series.id,
    title: series.title,
    description: series.description,
    rating: series.rating,
    created_at: series.created_at,
    content_type: "series",
    thumbnails: {
      video_banner: series.thumbnails?.video_banner ?? null,
      video_h_thumbnail: series.thumbnails?.video_h_thumbnail || series.thumbnail_url,
      video_w_thumbnail: series.thumbnails?.video_w_thumbnail ?? null,
    },
  };
}

export async function fetchSeries(sort: "rating" | "latest"): Promise<ContentItem[]> {
  const { data } = await publicApiClient.get<SeriesOut[]>("/series", {
    params: { sort, page: 1, page_size: 30 },
  });
  return (data ?? []).map(mapSeries);
}

export async function fetchSeriesDetails(id: string): Promise<SeriesOut> {
  const { data } = await publicApiClient.get<SeriesOut>(`/series/${encodeURIComponent(id)}`);
  return data;
}

export async function fetchSeriesEpisodes(id: string): Promise<SeriesEpisode[]> {
  const { data } = await publicApiClient.get<SeriesEpisode[]>(`/series/${encodeURIComponent(id)}/episodes`);
  return data ?? [];
}

export async function authorizeSeriesEpisode(seriesId: string, episodeId: string): Promise<string> {
  const token = useAuthStore.getState().token;
  const { data } = await publicApiClient.post<{ stream_url: string }>(
    `/series/${encodeURIComponent(seriesId)}/episodes/${encodeURIComponent(episodeId)}/playback`,
    null,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  );
  return data.stream_url;
}

export async function fetchSeriesCategoryRows(): Promise<HomeRow[]> {
  const { data } = await publicApiClient.get<SeriesRowsResponse>("/home-contents", {
    params: { content_type: "series", page: 1, page_size: 10, items_per_row: 12 },
  });
  return (data.rows ?? []).filter((row) => row.content_type === "series");
}