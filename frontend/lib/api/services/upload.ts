import apiClient from "../client";
import { ENDPOINTS } from "../endpoints";

export interface VideoAssetRendition {
    asset_id: string;
    media_asset_rendition_id: string | null;
    transcode_status: "pending" | "processing" | "complete" | "failed" | null;
    transcode_progress: number | null;
    transcode_error: string | null;
    stream_ready: boolean;
    stream_url: string | null;
}

export async function getVideoAssetRendition(sourceUrl: string): Promise<VideoAssetRendition> {
    const { data } = await apiClient.get<VideoAssetRendition>(ENDPOINTS.admin.upload.videoRendition, {
        params: { source_url: sourceUrl },
    });
    return data;
}

export async function retryMediaAssetTranscode(assetId: string) {
    const { data } = await apiClient.post<{
        transcode_status: "pending" | "processing" | "complete" | "failed" | null;
        transcode_progress: number | null;
    }>(ENDPOINTS.admin.upload.transcodeAsset(assetId));
    return data;
}

/**
 * Delete a media asset (S3 object + DB record).
 * Silently ignores 404 — asset may have already been removed.
 */
export async function deleteMediaAsset(assetId: string): Promise<void> {
    try {
        await apiClient.delete(ENDPOINTS.admin.upload.deleteAsset(assetId));
    } catch (err: unknown) {
        // 404 = already gone, treat as success
        if ((err as { response?: { status?: number } })?.response?.status === 404) return;
        throw err;
    }
}
