/**
 * End-user watchlist service
 *
 * Wraps:
 *   GET    /auth/user/watchlist              — fetch watchlist
 *   POST   /auth/user/watchlist              — add item
 *   DELETE /auth/user/watchlist/{video_id}   — remove item
 *
 * Uses the authenticated apiClient (Bearer token injected automatically).
 */

import apiClient from "./client";

export interface WatchlistItem {
    id: string;
    video_id: string;
    added_at: string;
    title: string | null;
    thumbnail_url: string | null;
    duration: number | null;
    access_type: string | null;
}

export async function getWatchlist(): Promise<WatchlistItem[]> {
    const { data } = await apiClient.get<WatchlistItem[]>("/auth/user/watchlist");
    return data;
}

export async function addToWatchlist(videoId: string): Promise<WatchlistItem> {
    const { data } = await apiClient.post<WatchlistItem>("/auth/user/watchlist", {
        video_id: videoId,
    });
    return data;
}

export async function removeFromWatchlist(videoId: string): Promise<void> {
    await apiClient.delete(`/auth/user/watchlist/${videoId}`);
}
