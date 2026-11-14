import { publicApiClient } from "@/api/client";
import { ContentItem } from "@/types/models";

export interface LiveTvChannelOut {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  language: string[];
  source: "rtmp" | "srt" | "external";
  stream_url: string | null;
  is_live: boolean;
  access_type: "free" | "subscription" | "pay_per_view";
  is_featured: boolean;
  is_active?: boolean;
  thumbnails: {
    square?: string | null;
    banner: string | null;
    portrait: string | null;
    wide: string | null;
  };
}

export interface EpgProgram {
  id: string;
  channel_id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  category: string | null;
  rating: string | null;
  thumbnail_url: string | null;
}

interface ChannelEpgResponse {
  channel_id: string;
  programs: EpgProgram[];
}

// Public endpoint returns an array directly — matches Client's listVideos() contract
export async function fetchMovies(): Promise<ContentItem[]> {
  const { data } = await publicApiClient.get<ContentItem[]>("/videos", {
    params: { content_type: "movie" },
  });
  return data ?? [];
}

export async function fetchFeaturedVideos(): Promise<ContentItem[]> {
  const { data } = await publicApiClient.get<ContentItem[]>("/videos", {
    params: { is_slider: true, page_size: 10 },
  });
  return data ?? [];
}

export async function fetchFeaturedMovieRail(): Promise<ContentItem[]> {
  const { data } = await publicApiClient.get<ContentItem[]>("/videos", {
    params: { is_featured: true, page_size: 10 },
  });
  return data ?? [];
}

export async function fetchHomeMovieRail(sortBy: "rating" | "latest"): Promise<ContentItem[]> {
  const { data } = await publicApiClient.get<ContentItem[]>("/videos", {
    params: {
      sort_by: sortBy,
      page_size: 10,
      content_classification: "Movie",
    },
  });
  return data ?? [];
}

export async function fetchLiveTvChannels(): Promise<ContentItem[]> {
  const { data } = await publicApiClient.get<LiveTvChannelOut[]>("/live-streams");

  return (data ?? []).map((channel) => ({
    id: channel.id,
    title: channel.title,
    description: channel.description,
    content_type: "live_stream",
    video_url: channel.stream_url,
    thumbnails: {
      video_banner: channel.thumbnails.banner,
      video_h_thumbnail: channel.thumbnails.portrait,
      video_w_thumbnail: channel.thumbnails.wide,
    },
  }));
}

export async function listLiveTvChannels(): Promise<LiveTvChannelOut[]> {
  const { data } = await publicApiClient.get<LiveTvChannelOut[]>("/live-streams");
  return data ?? [];
}

export async function getLiveTvChannel(channelId: string): Promise<LiveTvChannelOut> {
  const { data } = await publicApiClient.get<LiveTvChannelOut>(`/live-streams/${channelId}`);
  return data;
}

export async function fetchLiveTvEpg(channelId: string, date?: string, days = 1): Promise<EpgProgram[]> {
  const params: Record<string, string | number> = { days };
  if (date) params.date = date;

  const { data } = await publicApiClient.get<ChannelEpgResponse>(`/live-streams/${channelId}/epg`, { params });
  return data.programs ?? [];
}

// Note: singular /video/{id} — matches Client's getVideo() contract
export async function fetchContentDetails(id: string): Promise<ContentItem> {
  const { data } = await publicApiClient.get<ContentItem>(`/video/${id}`);
  return data;
}
