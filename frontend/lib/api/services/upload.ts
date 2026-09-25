import apiClient from "../client";
import { ENDPOINTS } from "../endpoints";

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
