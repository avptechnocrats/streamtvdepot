/**
 * API Endpoint Definitions
 *
 * All paths are relative to NEXT_PUBLIC_API_URL (e.g. /api/v1).
 * Import these constants instead of hardcoding strings in service files.
 */

export const ENDPOINTS = {
    // ── DRM (any authenticated user — end_user, admin, superadmin) ───────────
    drm: {
        keyToken: (videoId: string) => `/drm/key-token/${videoId}`,
    },
    playback: {
        video: (videoId: string) => `/auth/user/my-subscriptions/playback/videos/${videoId}`,
        channelProgram: (channelId: string, videoId: string) =>
            `/auth/user/my-subscriptions/playback/channels/${channelId}/videos/${videoId}`,
    },
} as const;
