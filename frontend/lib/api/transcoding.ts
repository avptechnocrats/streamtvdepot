/**
 * Transcoding & DRM API helpers
 *
 * triggerTranscode(videoId, enableDrm)
 *   POST /admin/transcoding/videos/{id}/trigger
 *   Kicks off ABR HLS transcoding via AWS MediaConvert.
 *   Returns immediately; poll getTranscodeStatus() for progress.
 *
 * getTranscodeStatus(videoId)
 *   GET /admin/transcoding/videos/{id}/status
 *   Returns { transcode_status, transcode_progress, hls_url, drm_enabled }.
 *   Poll every ~5 s until transcode_status === "complete" | "failed".
 *
 * getDrmKeyToken(videoId)
 *   GET /admin/transcoding/videos/{id}/key-token
 *   Returns a short-lived JWT.  Pass it as `drmKeyToken` to <VideoPlayer>.
 *   Call this immediately before mounting the player, not on page load.
 *
 * pollUntilComplete(videoId, opts)
 *   Convenience wrapper that polls getTranscodeStatus() and resolves once
 *   the job finishes (or rejects on failure / timeout).
 */

import apiClient from "@/lib/api/client";
import { ENDPOINTS } from "@/lib/api/endpoints";

// ─── Shapes returned from the backend ─────────────────────────────────────────

export interface TriggerResponse {
    video_id: string;
    transcode_job_id: string;
    transcode_status: string;
    drm_enabled: boolean;
    message: string;
}

export interface TranscodeStatusResponse {
    video_id: string;
    transcode_status: "pending" | "processing" | "complete" | "failed" | null;
    transcode_progress: number | null;
    hls_url: string | null;
    drm_enabled: boolean;
    error_message: string | null;
}

export interface KeyTokenResponse {
    token: string;
    video_id: string;
}

// ─── API calls ────────────────────────────────────────────────────────────────

export async function triggerTranscode(
    videoId: string,
    enableDrm = true,
): Promise<TriggerResponse> {
    const { data } = await apiClient.post<TriggerResponse>(
        ENDPOINTS.admin.transcoding.trigger(videoId),
        { enable_drm: enableDrm },
    );
    return data;
}

export async function getTranscodeStatus(
    videoId: string,
): Promise<TranscodeStatusResponse> {
    const { data } = await apiClient.get<TranscodeStatusResponse>(
        ENDPOINTS.admin.transcoding.status(videoId),
    );
    return data;
}

export async function getDrmKeyToken(
    videoId: string,
): Promise<KeyTokenResponse> {
    const { data } = await apiClient.get<KeyTokenResponse>(
        ENDPOINTS.admin.transcoding.keyToken(videoId),
    );
    return data;
}

/**
 * Obtain a DRM key-access token using the current user's session JWT.
 * Works for end_user, client_admin, and superadmin roles.
 * Use this instead of getDrmKeyToken() in non-admin (client-facing) contexts.
 */
export async function getPublicDrmKeyToken(
    videoId: string,
): Promise<KeyTokenResponse> {
    const { data } = await apiClient.get<KeyTokenResponse>(
        ENDPOINTS.drm.keyToken(videoId),
    );
    return data;
}

// ─── Polling helper ───────────────────────────────────────────────────────────

interface PollOptions {
    /** ms between polls (default 5000) */
    intervalMs?: number;
    /** max ms to wait before rejecting (default 30 min) */
    timeoutMs?: number;
    /** called on every poll tick with the latest status */
    onProgress?: (status: TranscodeStatusResponse) => void;
}

/**
 * Poll transcoding status until the job reaches "complete" or "failed".
 * Resolves with the final status; rejects on failure or timeout.
 */
export function pollUntilComplete(
    videoId: string,
    {
        intervalMs = 5_000,
        timeoutMs = 30 * 60 * 1_000,
        onProgress,
    }: PollOptions = {},
): Promise<TranscodeStatusResponse> {
    return new Promise((resolve, reject) => {
        const deadline = Date.now() + timeoutMs;
        let timer: ReturnType<typeof setTimeout>;

        const tick = async () => {
            if (Date.now() > deadline) {
                reject(new Error("Transcoding polling timed out."));
                return;
            }
            try {
                const status = await getTranscodeStatus(videoId);
                onProgress?.(status);

                if (status.transcode_status === "complete") {
                    resolve(status);
                } else if (status.transcode_status === "failed") {
                    reject(new Error(`Transcoding failed for video ${videoId}.`));
                } else {
                    timer = setTimeout(tick, intervalMs);
                }
            } catch (err) {
                reject(err);
            }
        };

        timer = setTimeout(tick, intervalMs);
    });
}
