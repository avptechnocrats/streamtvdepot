import apiClient from "@/lib/api/client";
import { ENDPOINTS } from "@/lib/api/endpoints";
import { TOKEN_KEYS, setTokens } from "@/lib/api/client";
import { refreshAccessToken } from "@/lib/api/services/auth";

const S3_SINGLE_PUT_LIMIT = 5 * 1024 * 1024 * 1024;
const MULTIPART_CONCURRENCY = 4;
const PART_MAX_RETRIES = 3;
const SESSION_PREFIX = "streamtvdepot:multipart-upload";
const SESSION_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export interface UploadProgress {
    stage: "preparing" | "uploading" | "completing" | "registering";
    uploadedBytes: number;
    totalBytes: number;
    percent: number;
    bytesPerSecond: number;
    remainingBytes: number;
    etaSeconds: number | null;
}

interface StoredMultipartSession {
    fileFingerprint: string;
    fileName: string;
    fileSize: number;
    contentType: string;
    uploadId: string;
    s3Key: string;
    partSize: number;
    totalParts: number;
    completedParts: UploadedPart[];
    updatedAt: number;
}

interface UploadCallbacks {
    onProgress?: (progress: UploadProgress) => void;
    onCheckpoint?: (session: StoredMultipartSession) => void;
}

interface UploadResult {
    id: string;
    url: string;
    display_url: string | null;
}

type ConfirmPayload = {
    s3_key: string;
    original_filename: string;
    content_type: string;
    file_size: number;
    width?: number | null;
    height?: number | null;
    purpose?: "thumbnail" | "banner" | null;
};

interface MultipartInitiateResponse {
    upload_id: string;
    s3_key: string;
    part_size: number;
    total_parts: number;
}

interface MultipartPresignPartResponse {
    upload_url: string;
    part_number: number;
}

interface ReconcileUploadResponse extends UploadResult {
    created_at?: string;
}

interface UploadedPart {
    part_number: number;
    etag: string;
}

interface UploadOptions {
    purpose?: Pick<ConfirmPayload, "width" | "height" | "purpose">;
}

function fileFingerprint(file: File): string {
    return `${file.name}:${file.size}:${file.lastModified}:${file.type}`;
}

function sessionStorageKey(fingerprint: string): string {
    return `${SESSION_PREFIX}:${fingerprint}`;
}

function saveSession(session: StoredMultipartSession): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(sessionStorageKey(session.fileFingerprint), JSON.stringify(session));
    } catch {
        // best effort only
    }
}

function loadSession(file: File): StoredMultipartSession | null {
    if (typeof window === "undefined") return null;
    try {
        const key = sessionStorageKey(fileFingerprint(file));
        const raw = window.localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as StoredMultipartSession;
        if (!parsed || Date.now() - parsed.updatedAt > SESSION_MAX_AGE_MS) {
            window.localStorage.removeItem(key);
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

function clearSession(file: File): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.removeItem(sessionStorageKey(fileFingerprint(file)));
    } catch {
        // best effort only
    }
}

function partSizeAtIndex(fileSize: number, partSize: number, partIndex: number): number {
    const start = partIndex * partSize;
    const end = Math.min(start + partSize, fileSize);
    return Math.max(end - start, 0);
}

function emitProgress(
    callbacks: UploadCallbacks,
    stage: UploadProgress["stage"],
    uploadedBytes: number,
    totalBytes: number,
    startedAt: number,
) {
    const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 0.001);
    const bytesPerSecond = uploadedBytes / elapsedSeconds;
    const remainingBytes = Math.max(totalBytes - uploadedBytes, 0);
    const etaSeconds = bytesPerSecond > 0 ? remainingBytes / bytesPerSecond : null;
    callbacks.onProgress?.({
        stage,
        uploadedBytes,
        totalBytes,
        percent: totalBytes > 0 ? (uploadedBytes / totalBytes) * 100 : 0,
        bytesPerSecond,
        remainingBytes,
        etaSeconds,
    });
}

function xhrPut(
    url: string,
    body: Blob,
    headers: Record<string, string>,
    onProgress?: (loaded: number) => void,
    attempt: number = 1,
): Promise<XMLHttpRequest> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", url, true);
        Object.entries(headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable && onProgress) {
                onProgress(event.loaded);
            }
        };

        xhr.onerror = () => {
            if (attempt < PART_MAX_RETRIES) {
                const retryDelay = Math.min(100 * Math.pow(2, attempt - 1), 3000);
                setTimeout(() => {
                    xhrPut(url, body, headers, onProgress, attempt + 1).then(resolve).catch(reject);
                }, retryDelay);
                return;
            }
            reject(new Error("Network error while uploading to storage"));
        };
        xhr.onabort = () => reject(new Error("Upload aborted"));
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(xhr);
                return;
            }
            const retryable = xhr.status === 408 || xhr.status >= 500;
            if (retryable && attempt < PART_MAX_RETRIES) {
                const retryDelay = Math.min(100 * Math.pow(2, attempt - 1), 3000);
                setTimeout(() => {
                    xhrPut(url, body, headers, onProgress, attempt + 1).then(resolve).catch(reject);
                }, retryDelay);
                return;
            }
            reject(
                new Error(
                    xhr.status === 403
                        ? "Upload not allowed. Storage permissions may need to be configured."
                        : xhr.status === 413
                            ? "File is too large to upload."
                            : "Upload failed. Please try again.",
                ),
            );
        };

        xhr.send(body);
    });
}

async function confirmUpload(payload: ConfirmPayload): Promise<UploadResult> {
    const { data } = await apiClient.post<UploadResult>(
        ENDPOINTS.admin.upload.confirm,
        payload,
        { timeout: 120_000 },
    );
    return data;
}

async function reconcileUpload(payload: ConfirmPayload): Promise<UploadResult> {
    const { data } = await apiClient.post<ReconcileUploadResponse>(
        ENDPOINTS.admin.upload.reconcile,
        payload,
        { timeout: 120_000 },
    );
    return data;
}

async function confirmUploadWithRefresh(payload: ConfirmPayload): Promise<UploadResult> {
    try {
        return await confirmUpload(payload);
    } catch (error) {
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status !== 401 || typeof window === "undefined") {
            throw error;
        }

        const refreshToken = window.localStorage.getItem(TOKEN_KEYS.refresh);
        if (!refreshToken) {
            throw error;
        }

        const tokens = await refreshAccessToken(refreshToken);
        setTokens(tokens.access_token, tokens.refresh_token);
        return await confirmUpload(payload);
    }
}

async function finalizeUpload(payload: ConfirmPayload): Promise<UploadResult> {
    try {
        return await confirmUploadWithRefresh(payload);
    } catch (error) {
        const status = (error as { response?: { status?: number } })?.response?.status;
        const shouldAttemptReconcile =
            status === undefined || status === 401 || status === 403 || status === 404 || status >= 500;
        if (!shouldAttemptReconcile) {
            throw error;
        }

        try {
            return await reconcileUpload(payload);
        } catch {
            throw error;
        }
    }
}

async function uploadSinglePut(
    file: File,
    callbacks: UploadCallbacks,
    confirmExtras?: Pick<ConfirmPayload, "width" | "height" | "purpose">,
): Promise<UploadResult> {
    const { data: presignData } = await apiClient.post<{
        upload_url: string;
        s3_key: string;
        storage_class?: string | null;
    }>(ENDPOINTS.admin.upload.presign, {
        filename: file.name,
        content_type: file.type,
        file_size: file.size,
        purpose: confirmExtras?.purpose ?? null,
    });

    const startedAt = Date.now();
    emitProgress(callbacks, "uploading", 0, file.size, startedAt);

    const headers: Record<string, string> = { "Content-Type": file.type };
    if (presignData.storage_class) {
        headers["x-amz-storage-class"] = presignData.storage_class;
    }

    await xhrPut(presignData.upload_url, file, headers, (loaded) => {
        emitProgress(callbacks, "uploading", loaded, file.size, startedAt);
    });

    emitProgress(callbacks, "registering", file.size, file.size, startedAt);
    return await finalizeUpload({
        s3_key: presignData.s3_key,
        original_filename: file.name,
        content_type: file.type,
        file_size: file.size,
        width: confirmExtras?.width ?? null,
        height: confirmExtras?.height ?? null,
        purpose: confirmExtras?.purpose ?? null,
    });
}

async function uploadMultipart(
    file: File,
    callbacks: UploadCallbacks,
    confirmExtras?: Pick<ConfirmPayload, "width" | "height" | "purpose">,
): Promise<UploadResult> {
    const existingSession = loadSession(file);
    const initData = existingSession
        ? {
            upload_id: existingSession.uploadId,
            s3_key: existingSession.s3Key,
            part_size: existingSession.partSize,
            total_parts: existingSession.totalParts,
        }
        : (await apiClient.post<MultipartInitiateResponse>(
            ENDPOINTS.admin.upload.multipartInitiate,
            {
                filename: file.name,
                content_type: file.type,
                file_size: file.size,
                purpose: confirmExtras?.purpose ?? null,
            },
        )).data;

    const completedPartMap = new Map<number, string>();
    for (const part of existingSession?.completedParts ?? []) {
        completedPartMap.set(part.part_number, part.etag);
    }

    let session: StoredMultipartSession = existingSession ?? {
        fileFingerprint: fileFingerprint(file),
        fileName: file.name,
        fileSize: file.size,
        contentType: file.type,
        uploadId: initData.upload_id,
        s3Key: initData.s3_key,
        partSize: initData.part_size,
        totalParts: initData.total_parts,
        completedParts: [],
        updatedAt: Date.now(),
    };
    saveSession(session);
    callbacks.onCheckpoint?.(session);

    const loadedByPart = new Array<number>(initData.total_parts).fill(0);
    for (const partNumber of completedPartMap.keys()) {
        const partIndex = partNumber - 1;
        if (partIndex >= 0 && partIndex < loadedByPart.length) {
            loadedByPart[partIndex] = partSizeAtIndex(file.size, initData.part_size, partIndex);
        }
    }

    const startedAt = Date.now();

    const reportAggregate = () => {
        const uploadedBytes = loadedByPart.reduce((sum, n) => sum + n, 0);
        emitProgress(callbacks, "uploading", uploadedBytes, file.size, startedAt);
    };

    reportAggregate();

    const uploadPart = async (partIndex: number) => {
        const partNumber = partIndex + 1;
        if (completedPartMap.has(partNumber)) {
            return;
        }
        const start = partIndex * initData.part_size;
        const end = Math.min(start + initData.part_size, file.size);
        const blob = file.slice(start, end);

        const { data: partData } = await apiClient.post<MultipartPresignPartResponse>(
            ENDPOINTS.admin.upload.multipartPresignPart,
            {
                s3_key: initData.s3_key,
                upload_id: initData.upload_id,
                part_number: partNumber,
            },
        );

        const xhr = await xhrPut(partData.upload_url, blob, { "Content-Type": file.type }, (loaded) => {
            loadedByPart[partIndex] = loaded;
            reportAggregate();
        });

        loadedByPart[partIndex] = blob.size;
        const etagRaw = xhr.getResponseHeader("ETag") || "";
        const etag = etagRaw.replace(/^\"|\"$/g, "");
        if (!etag) {
            throw new Error(`Missing ETag for uploaded part ${partNumber}`);
        }

        completedPartMap.set(partNumber, etag);
        session = {
            ...session,
            completedParts: Array.from(completedPartMap.entries())
                .map(([pn, partEtag]) => ({ part_number: pn, etag: partEtag }))
                .sort((a, b) => a.part_number - b.part_number),
            updatedAt: Date.now(),
        };
        saveSession(session);
        callbacks.onCheckpoint?.(session);
        reportAggregate();
    };

    try {
        for (let i = 0; i < initData.total_parts; i += MULTIPART_CONCURRENCY) {
            const chunk: Promise<void>[] = [];
            for (let j = i; j < Math.min(i + MULTIPART_CONCURRENCY, initData.total_parts); j += 1) {
                chunk.push(uploadPart(j));
            }
            await Promise.all(chunk);
        }

        emitProgress(callbacks, "completing", file.size, file.size, startedAt);
        await apiClient.post(ENDPOINTS.admin.upload.multipartComplete, {
            s3_key: initData.s3_key,
            upload_id: initData.upload_id,
            parts: Array.from(completedPartMap.entries())
                .map(([pn, etag]) => ({ part_number: pn, etag }))
                .sort((a, b) => a.part_number - b.part_number),
        });

        emitProgress(callbacks, "registering", file.size, file.size, startedAt);
        const result = await finalizeUpload({
            s3_key: initData.s3_key,
            original_filename: file.name,
            content_type: file.type,
            file_size: file.size,
            width: confirmExtras?.width ?? null,
            height: confirmExtras?.height ?? null,
            purpose: confirmExtras?.purpose ?? null,
        });
        clearSession(file);
        return result;
    } catch (error) {
        const err = error as Error & { session?: StoredMultipartSession };
        err.session = session;
        throw error;
    }
}

export async function uploadAssetToS3(
    file: File,
    callbacks: UploadCallbacks = {},
    confirmExtras?: Pick<ConfirmPayload, "width" | "height" | "purpose">,
): Promise<UploadResult> {
    emitProgress(callbacks, "preparing", 0, file.size, Date.now());
    if (file.size > S3_SINGLE_PUT_LIMIT) {
        return await uploadMultipart(file, callbacks, confirmExtras);
    }
    return await uploadSinglePut(file, callbacks, confirmExtras);
}

export function getPendingUploadSession(file: File) {
    return loadSession(file);
}

export function clearPendingUploadSession(file: File) {
    clearSession(file);
}
