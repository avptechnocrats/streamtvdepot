/**
 * DRM key-token helper — viewer-facing.
 *
 * getDrmKeyToken(videoId)
 *   GET /drm/key-token/{id}
 *   Returns a short-lived JWT.  Pass it as `drmKeyToken` to <VideoPlayer>.
 *   Call this immediately before mounting the player, not on page load.
 */

import apiClient from "./client";
import { ENDPOINTS } from "./endpoints";

export interface KeyTokenResponse {
    token: string;
    video_id: string;
}

export interface PlaybackAuthorizationResponse {
    stream_url: string;
}

export interface LivePlaybackAuthorization {
    stream_url: string;
    ads_enabled: boolean;
    low_latency: boolean;
    cdn: {
        /** Cookie Domain attribute — must cover the CDN host. */
        domain: string;
        /** Unix seconds; renew before this. */
        expires: number;
        cookies: Record<string, string>;
    };
}

/**
 * Authorize a managed live channel. Returns the CDN playback URL plus short-lived
 * signed cookies the browser must hold before requesting any segment.
 */
export async function authorizeLivePlayback(channelId: string): Promise<LivePlaybackAuthorization> {
    const { data } = await apiClient.post<LivePlaybackAuthorization>(ENDPOINTS.playback.live(channelId));
    return data;
}

export async function getDrmKeyToken(
    videoId: string,
): Promise<KeyTokenResponse> {
    const { data } = await apiClient.get<KeyTokenResponse>(
        ENDPOINTS.drm.keyToken(videoId),
    );
    return data;
}

export async function authorizeVideoPlayback(
    videoId: string,
): Promise<PlaybackAuthorizationResponse> {
    const { data } = await apiClient.post<PlaybackAuthorizationResponse>(
        ENDPOINTS.playback.video(videoId),
    );
    return data;
}

/**
 * Authorize an EPG-scheduled program on a live channel. Linear playback is
 * gated by the CHANNEL's access, not the individual VOD's — so a free channel
 * plays its whole schedule (including subscription/rental programs) for anyone.
 */
export async function authorizeChannelProgramPlayback(
    channelId: string,
    videoId: string,
): Promise<PlaybackAuthorizationResponse> {
    const { data } = await apiClient.post<PlaybackAuthorizationResponse>(
        ENDPOINTS.playback.channelProgram(channelId, videoId),
    );
    return data;
}
