"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { uploadAssetToS3, type UploadProgress } from "@/lib/upload/s3-upload";
import type { MediaAsset } from "./AssetRow";

// ─── Limits (mirror backend/app/api/v1/admin/upload.py) ──────────────────────

const ACCEPTED_IMAGE = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ACCEPTED_VIDEO = ["video/mp4", "video/quicktime", "video/webm", "video/x-matroska", "video/avi", "video/x-msvideo"];
const ACCEPTED_AUDIO = ["audio/mpeg", "audio/mp4", "audio/wav", "audio/webm", "audio/ogg", "audio/flac", "audio/aac", "audio/x-wav"];
export const ACCEPTED_UPLOAD_TYPES = [...ACCEPTED_IMAGE, ...ACCEPTED_VIDEO, ...ACCEPTED_AUDIO];

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;
const MAX_IMAGE_SIZE = 50 * MB;
const MAX_VIDEO_SIZE = 500 * GB;
const MAX_AUDIO_SIZE = 100 * MB;

/** Files uploaded at the same time. Large files additionally upload parts in parallel. */
export const MAX_CONCURRENT_FILES = 3;
/** Minimum gap between React state updates caused by progress events, per file. */
const PROGRESS_THROTTLE_MS = 150;

// ─── Types ────────────────────────────────────────────────────────────────────

export type UploadItemStatus = "queued" | "uploading" | "failed";

export interface UploadItem {
    id: string;
    file: File;
    status: UploadItemStatus;
    stage: UploadProgress["stage"];
    percent: number;
    uploadedBytes: number;
    bytesPerSecond: number;
    etaSeconds: number | null;
    error?: string;
    previewUrl?: string;
}

export interface RejectedFile {
    name: string;
    reason: string;
}

interface UseUploadQueueOptions {
    onUploaded: (asset: MediaAsset) => void;
    onDrained?: (summary: { done: number; failed: number }) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function maxSizeFor(contentType: string): number {
    if (contentType.startsWith("video/")) return MAX_VIDEO_SIZE;
    if (contentType.startsWith("audio/")) return MAX_AUDIO_SIZE;
    return MAX_IMAGE_SIZE;
}

function sizeLabel(bytes: number): string {
    return bytes >= GB ? `${Math.round(bytes / GB)} GB` : `${Math.round(bytes / MB)} MB`;
}

const TYPE_BY_EXTENSION: Record<string, string> = {
    mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", mkv: "video/x-matroska", avi: "video/x-msvideo",
    mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg", flac: "audio/flac", aac: "audio/aac",
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
};
const TYPE_ALIASES: Record<string, string> = {
    "audio/mp3": "audio/mpeg", "audio/x-mp3": "audio/mpeg", "audio/x-flac": "audio/flac",
    "audio/wave": "audio/wav", "audio/vnd.wave": "audio/wav", "audio/x-m4a": "audio/mp4", "video/x-m4v": "video/mp4",
};

/** Browsers often report an empty or non-standard MIME type (.mkv, .flac, .m4a); map it to one the backend accepts. */
export function normalizeUploadFile(file: File): File {
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    const type = TYPE_ALIASES[file.type] ?? (file.type || TYPE_BY_EXTENSION[extension] || "");
    if (!type || type === file.type) return file;
    return new File([file], file.name, { type, lastModified: file.lastModified });
}

/** Extensions are included because file pickers drop files whose MIME type the OS cannot resolve. */
export const UPLOAD_ACCEPT = [
    ...ACCEPTED_UPLOAD_TYPES,
    ...Object.keys(TYPE_BY_EXTENSION).map((extension) => `.${extension}`),
].join(",");

export function validateUploadFile(file: File): string | null {
    if (!ACCEPTED_UPLOAD_TYPES.includes(file.type)) {
        return `Unsupported file type${file.type ? `: ${file.type}` : ""}`;
    }
    if (file.size <= 0) return "File is empty";
    const limit = maxSizeFor(file.type);
    if (file.size > limit) return `Exceeds the ${sizeLabel(limit)} limit`;
    return null;
}

function fileKey(file: File): string {
    return `${file.name}:${file.size}:${file.lastModified}:${file.type}`;
}

function readImageDimensions(file: File): Promise<{ width: number | null; height: number | null }> {
    if (!file.type.startsWith("image/")) return Promise.resolve({ width: null, height: null });
    return new Promise((resolve) => {
        const img = new window.Image();
        const objectUrl = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(objectUrl);
            resolve({ width: img.naturalWidth || null, height: img.naturalHeight || null });
        };
        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            resolve({ width: null, height: null });
        };
        img.src = objectUrl;
    });
}

function errorMessage(err: unknown): string {
    const apiDetail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
    const rawMsg = err instanceof Error ? err.message : "";
    const isClean = (s: unknown): s is string =>
        typeof s === "string" && s.length > 0 && !s.includes("<") && !s.includes("{");
    if (isClean(apiDetail)) return apiDetail;
    if (isClean(rawMsg)) return rawMsg;
    return "Upload failed. Please try again.";
}

let idCounter = 0;

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Client-side upload queue: runs up to MAX_CONCURRENT_FILES uploads at once, keeps the rest
 * queued, supports cancel / retry per file and reports a summary when the queue drains.
 */
export function useUploadQueue({ onUploaded, onDrained }: UseUploadQueueOptions) {
    const [items, setItems] = useState<UploadItem[]>([]);

    const filesRef = useRef(new Map<string, File>());
    const queueRef = useRef<string[]>([]);
    const activeRef = useRef(0);
    const controllersRef = useRef(new Map<string, AbortController>());
    const lastEmitRef = useRef(new Map<string, number>());
    const cancelledRef = useRef(new Set<string>());
    const statsRef = useRef({ done: 0, failed: 0 });
    const mountedRef = useRef(true);
    const callbacksRef = useRef({ onUploaded, onDrained });
    const previewUrlsRef = useRef(new Map<string, string>());

    useEffect(() => {
        callbacksRef.current = { onUploaded, onDrained };
    });

    const patch = useCallback((id: string, changes: Partial<UploadItem>) => {
        if (!mountedRef.current) return;
        setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...changes } : item)));
    }, []);

    const removeItem = useCallback((id: string) => {
        filesRef.current.delete(id);
        lastEmitRef.current.delete(id);
        const preview = previewUrlsRef.current.get(id);
        if (preview) {
            URL.revokeObjectURL(preview);
            previewUrlsRef.current.delete(id);
        }
        if (!mountedRef.current) return;
        setItems((prev) => prev.filter((item) => item.id !== id));
    }, []);

    const pumpRef = useRef<() => void>(() => undefined);

    const runItem = useCallback(async (id: string) => {
        const file = filesRef.current.get(id);
        if (!file) return;

        // Everything up to the first await must stay synchronous so the active counter is accurate.
        const controller = new AbortController();
        controllersRef.current.set(id, controller);
        activeRef.current += 1;
        lastEmitRef.current.set(id, 0);
        patch(id, {
            status: "uploading",
            stage: "preparing",
            percent: 0,
            uploadedBytes: 0,
            bytesPerSecond: 0,
            etaSeconds: null,
            error: undefined,
        });

        try {
            const { width, height } = await readImageDimensions(file);
            const uploaded = await uploadAssetToS3(
                file,
                {
                    signal: controller.signal,
                    onProgress: (p) => {
                        const now = Date.now();
                        const last = lastEmitRef.current.get(id) ?? 0;
                        const isEdge = p.percent >= 100 || p.stage !== "uploading";
                        if (!isEdge && now - last < PROGRESS_THROTTLE_MS) return;
                        lastEmitRef.current.set(id, now);
                        patch(id, {
                            stage: p.stage,
                            percent: p.percent,
                            uploadedBytes: p.uploadedBytes,
                            bytesPerSecond: p.bytesPerSecond,
                            etaSeconds: p.etaSeconds,
                        });
                    },
                },
                { width, height, purpose: null },
            );
            statsRef.current.done += 1;
            cancelledRef.current.delete(id);
            removeItem(id);
            try {
                callbacksRef.current.onUploaded({
                    original_filename: file.name,
                    content_type: file.type,
                    file_size: file.size,
                    width,
                    height,
                    created_at: new Date().toISOString(),
                    in_use: false,
                    ...uploaded,
                } as MediaAsset);
            } catch {
                // The upload itself succeeded; a UI callback error must not mark it failed.
            }
        } catch (err) {
            if (cancelledRef.current.has(id) || controller.signal.aborted) {
                cancelledRef.current.delete(id);
                removeItem(id);
            } else {
                statsRef.current.failed += 1;
                patch(id, { status: "failed", error: errorMessage(err) });
            }
        } finally {
            controllersRef.current.delete(id);
            activeRef.current -= 1;
            pumpRef.current();
        }
    }, [patch, removeItem]);

    const pump = useCallback(() => {
        if (!mountedRef.current) return;
        while (activeRef.current < MAX_CONCURRENT_FILES && queueRef.current.length > 0) {
            const nextId = queueRef.current.shift();
            if (nextId) void runItem(nextId);
        }
        const { done, failed } = statsRef.current;
        if (activeRef.current === 0 && queueRef.current.length === 0 && (done > 0 || failed > 0)) {
            statsRef.current = { done: 0, failed: 0 };
            callbacksRef.current.onDrained?.({ done, failed });
        }
    }, [runItem]);

    useEffect(() => {
        pumpRef.current = pump;
    }, [pump]);

    const addFiles = useCallback((incoming: File[]): RejectedFile[] => {
        const rejected: RejectedFile[] = [];
        const seen = new Set<string>();
        filesRef.current.forEach((file) => seen.add(fileKey(file)));

        const accepted: UploadItem[] = [];
        for (const original of incoming) {
            const file = normalizeUploadFile(original);
            const problem = validateUploadFile(file);
            if (problem) {
                rejected.push({ name: file.name, reason: problem });
                continue;
            }
            const key = fileKey(file);
            if (seen.has(key)) {
                rejected.push({ name: file.name, reason: "Already in the upload queue" });
                continue;
            }
            seen.add(key);

            idCounter += 1;
            const id = `upload-${Date.now()}-${idCounter}`;
            filesRef.current.set(id, file);
            let previewUrl: string | undefined;
            if (file.type.startsWith("image/")) {
                previewUrl = URL.createObjectURL(file);
                previewUrlsRef.current.set(id, previewUrl);
            }
            queueRef.current.push(id);
            accepted.push({
                id,
                file,
                status: "queued",
                stage: "preparing",
                percent: 0,
                uploadedBytes: 0,
                bytesPerSecond: 0,
                etaSeconds: null,
                previewUrl,
            });
        }

        if (accepted.length > 0) {
            setItems((prev) => [...prev, ...accepted]);
            pump();
        }
        return rejected;
    }, [pump]);

    /** Cancel an upload (aborts in-flight transfer) or dismiss a queued / failed item. */
    const cancel = useCallback((id: string) => {
        const controller = controllersRef.current.get(id);
        if (controller) {
            cancelledRef.current.add(id);
            controller.abort();
            return;
        }
        queueRef.current = queueRef.current.filter((queuedId) => queuedId !== id);
        removeItem(id);
    }, [removeItem]);

    const retry = useCallback((id: string) => {
        if (!filesRef.current.has(id) || queueRef.current.includes(id) || controllersRef.current.has(id)) return;
        patch(id, { status: "queued", error: undefined, percent: 0, uploadedBytes: 0 });
        queueRef.current.push(id);
        pump();
    }, [patch, pump]);

    const retryAllFailed = useCallback(() => {
        const failedIds = items
            .filter((item) =>
                item.status === "failed" &&
                filesRef.current.has(item.id) &&
                !queueRef.current.includes(item.id) &&
                !controllersRef.current.has(item.id))
            .map((item) => item.id);
        if (failedIds.length === 0) return;
        setItems((prev) =>
            prev.map((item) =>
                failedIds.includes(item.id)
                    ? { ...item, status: "queued", error: undefined, percent: 0, uploadedBytes: 0 }
                    : item,
            ),
        );
        queueRef.current.push(...failedIds);
        pump();
    }, [items, pump]);

    const hasPending = items.some((item) => item.status !== "failed");

    // Warn before closing the tab while uploads are queued or in flight.
    useEffect(() => {
        if (!hasPending) return;
        const handler = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = "";
        };
        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    }, [hasPending]);

    useEffect(() => {
        mountedRef.current = true;
        const previewUrls = previewUrlsRef.current;
        const queue = queueRef;
        return () => {
            // In-flight transfers keep running (and register their asset); queued files are dropped.
            mountedRef.current = false;
            queue.current = [];
            previewUrls.forEach((url) => URL.revokeObjectURL(url));
            previewUrls.clear();
        };
    }, []);

    return { items, hasPending, addFiles, cancel, retry, retryAllFailed };
}
