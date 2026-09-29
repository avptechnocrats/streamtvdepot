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
