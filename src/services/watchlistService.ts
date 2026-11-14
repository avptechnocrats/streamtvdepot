import { apiClient } from "@/api/client";
import { WatchlistItem } from "@/types/models";

export async function getWatchlist(): Promise<WatchlistItem[]> {
  const { data } = await apiClient.get<WatchlistItem[]>("/auth/user/watchlist");
  return data;
}

export async function addToWatchlist(videoId: string, contentType: "video" | "live_stream" | "series" = "video"): Promise<WatchlistItem> {
  const { data } = await apiClient.post<WatchlistItem>("/auth/user/watchlist", {
    video_id: videoId,
    content_type: contentType,
  });
  return data;
}

export async function removeFromWatchlist(videoId: string): Promise<void> {
  await apiClient.delete(`/auth/user/watchlist/${videoId}`);
}
