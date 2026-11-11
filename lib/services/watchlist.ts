/**
 * End-user watchlist service
 *
 * Wraps:
 *   GET    /auth/user/watchlist              — fetch watchlist
 *   POST   /auth/user/watchlist              — add video or live channel
 *   DELETE /auth/user/watchlist/{video_id}   — remove item
 *
 * Uses the authenticated apiClient (Bearer token injected automatically).
 */

import apiClient from "./client";
import { getLiveTvChannel } from "./live-tv";

export interface WatchlistItem {
    id: string;
    video_id: string;
    added_at: string;
    title: string | null;
    thumbnail_url: string | null;
    duration: number | null;
    access_type: string | null;
    content_type?: "video" | "live_stream" | "series";
}

export async function getWatchlist(): Promise<WatchlistItem[]> {
    const { data } = await apiClient.get<WatchlistItem[]>("/auth/user/watchlist");
    return Promise.all(data.map(async item => {
        if (item.content_type || item.title) return item;
        try {
            const channel = await getLiveTvChannel(item.video_id);
            return {
                ...item,
                content_type: "live_stream" as const,
                title: channel.title,
                thumbnail_url: channel.thumbnails.wide || channel.thumbnails.portrait || channel.thumbnails.banner || channel.thumbnails.square || null,
                duration: null,
                access_type: channel.access_type,
            };
        } catch {
            return item;
        }
    }));
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
