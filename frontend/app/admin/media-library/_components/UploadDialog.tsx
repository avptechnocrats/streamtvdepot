"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, X, ImageIcon, Film, Music, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { MediaAsset } from "./AssetRow";
import { formatBytes } from "./AssetRow";
import { uploadAssetToS3 } from "@/lib/upload/s3-upload";

// ─── Accepted MIME types ──────────────────────────────────────────────────────

const ACCEPTED_IMAGE = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ACCEPTED_VIDEO = ["video/mp4", "video/quicktime", "video/webm", "video/x-matroska", "video/avi", "video/x-msvideo"];
const ACCEPTED_AUDIO = ["audio/mpeg", "audio/mp4", "audio/wav", "audio/webm", "audio/ogg", "audio/flac", "audio/aac", "audio/x-wav"];
const ACCEPTED_ALL = [...ACCEPTED_IMAGE, ...ACCEPTED_VIDEO, ...ACCEPTED_AUDIO];

function typeIcon(contentType: string) {
    if (contentType.startsWith("video/")) return <Film size={32} className="text-blue-400" />;
    if (contentType.startsWith("audio/")) return <Music size={32} className="text-purple-400" />;
    return <ImageIcon size={32} className="text-muted-foreground" />;
}

// ─── UploadDialog ─────────────────────────────────────────────────────────────

interface UploadDialogProps {
    onClose: () => void;
    onUploaded: (asset: MediaAsset) => void;
    onUploadFailed?: (failed: {
        id: string;
        original_filename: string;
        content_type: string;
        file_size: number;
        uploaded_bytes: number;
        remaining_bytes: number;
        failed_error: string;
        failed_at: string;
        created_at: string;
        retry_source_file_key: string;
        file: File;
    }) => void;
}

type UploadState = "idle" | "uploading" | "success" | "error";

export function UploadDialog({ onClose, onUploaded, onUploadFailed }: UploadDialogProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [uploadState, setUploadState] = useState<UploadState>("idle");
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [dragging, setDragging] = useState(false);
    const [percent, setPercent] = useState(0);
    const [uploadedBytes, setUploadedBytes] = useState(0);
    const [speedBps, setSpeedBps] = useState(0);
    const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
    const [stageLabel, setStageLabel] = useState("Preparing");

    const formatEta = (seconds: number | null) => {
        if (seconds == null || !Number.isFinite(seconds)) return "--";
        const rounded = Math.max(Math.round(seconds), 0);
        const mins = Math.floor(rounded / 60);
        const secs = rounded % 60;
        return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    };

    const handleFile = useCallback((f: File) => {
        if (!ACCEPTED_ALL.includes(f.type)) {
            setErrorMsg(`Unsupported file type: ${f.type}`);
            return;
        }
        setErrorMsg(null);
        setFile(f);
        setUploadState("idle");

        if (f.type.startsWith("image/")) {
            const url = URL.createObjectURL(f);
            setPreview(url);
        } else {
            setPreview(null);
        }
    }, []);

    const handleDrop = useCallback(
        (e: React.DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            setDragging(false);
            const dropped = e.dataTransfer.files[0];
            if (dropped) handleFile(dropped);
        },
        [handleFile],
    );

    const handleUpload = useCallback(async () => {
        if (!file) return;
        setUploadState("uploading");
        setErrorMsg(null);
        setPercent(0);
        setUploadedBytes(0);
        setSpeedBps(0);
        setEtaSeconds(null);
        setStageLabel("Preparing");

        try {
            const stageToLabel: Record<string, string> = {
                preparing: "Preparing",
                uploading: "Uploading",
                completing: "Completing multipart upload",
                registering: "Registering asset",
            };

            let width = 0;
            let height = 0;
            if (file.type.startsWith("image/")) {
                await new Promise<void>((resolve) => {
                    const img = new window.Image();
                    const objectUrl = URL.createObjectURL(file);
                    img.onload = () => {
                        URL.revokeObjectURL(objectUrl);
                        width = img.naturalWidth;
                        height = img.naturalHeight;
                        resolve();
                    };
                    img.onerror = () => {
                        URL.revokeObjectURL(objectUrl);
                        resolve();
                    };
                    img.src = objectUrl;
                });
            }

            const uploaded = await uploadAssetToS3(
                file,
                {
                    onProgress: (p) => {
                        setPercent(p.percent);
                        setUploadedBytes(p.uploadedBytes);
                        setSpeedBps(p.bytesPerSecond);
                        setEtaSeconds(p.etaSeconds);
                        setStageLabel(stageToLabel[p.stage] ?? "Uploading");
                    },
                },
                {
                    width: width || null,
                    height: height || null,
                    purpose: null,
                },
            );

            setPercent(100);
            setUploadedBytes(file.size);

            setUploadState("success");

            if (preview) URL.revokeObjectURL(preview);

            setTimeout(() => {
                onUploaded(uploaded as MediaAsset);
                onClose();
            }, 800);
        } catch (err: unknown) {
            setUploadState("error");
            const apiDetail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "";
            const rawMsg = err instanceof Error ? err.message : "";
            // Show API detail if clean, otherwise the throw message (already sanitised above), else generic.
            const isClean = (s: string) => s.length > 0 && !s.includes("<") && !s.includes("{");
            const msg = isClean(apiDetail) ? apiDetail : isClean(rawMsg) ? rawMsg : "Upload failed. Please try again.";
            setErrorMsg(msg);
            if (file && onUploadFailed) {
                const retryKey = `${file.name}:${file.size}:${file.lastModified}:${file.type}`;
                onUploadFailed({
                    id: `failed:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
                    original_filename: file.name,
                    content_type: file.type,
                    file_size: file.size,
                    uploaded_bytes: uploadedBytes,
                    remaining_bytes: Math.max(file.size - uploadedBytes, 0),
                    failed_error: msg,
                    failed_at: new Date().toISOString(),
                    created_at: new Date().toISOString(),
                    retry_source_file_key: retryKey,
                    file,
                });
            }
        }
    }, [file, preview, onUploaded, onClose, onUploadFailed, uploadedBytes]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl overflow-hidden">
                {/* Dialog header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                    <p className="text-sm font-semibold text-foreground">Upload File</p>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                        <X size={14} />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    {/* Drop zone */}
                    {!file ? (
                        <div
                            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                            onDragLeave={() => setDragging(false)}
                            onDrop={handleDrop}
                            onClick={() => inputRef.current?.click()}
                            className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 cursor-pointer transition-colors
                                ${dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"}`}
                        >
                            <Upload size={28} className="text-muted-foreground" />
                            <div className="text-center">
                                <p className="text-sm font-medium text-foreground">
                                    Drop a file or click to browse
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Images up to 50 MB · Video up to 500 GB (multipart above 5 GB) · Audio up to 100 MB
                                </p>
                            </div>
                            <input
                                ref={inputRef}
                                type="file"
                                accept={ACCEPTED_ALL.join(",")}
                                className="hidden"
                                onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) handleFile(f);
                                    e.target.value = "";
                                }}
                            />
                        </div>
                    ) : (
                        /* File preview / info */
                        <div className="flex items-center gap-4 p-4 rounded-xl border border-border bg-secondary/60">
                            {/* Preview thumbnail or icon */}
                            <div className="w-14 h-14 shrink-0 rounded-lg overflow-hidden bg-muted flex items-center justify-center border border-border">
                                {preview ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={preview} alt={file.name} className="w-full h-full object-cover" />
                                ) : (
                                    typeIcon(file.type)
                                )}
                            </div>

                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                                <p className="text-xs text-muted-foreground">{file.type} · {formatBytes(file.size)}</p>
                            </div>

                            {/* Clear file */}
                            {uploadState === "idle" && (
                                <button
                                    onClick={() => { setFile(null); setPreview(null); setErrorMsg(null); }}
                                    className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
                                >
                                    <X size={13} />
                                </button>
                            )}
                        </div>
                    )}

                    {/* Error */}
                    {errorMsg && (
                        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-red-500/20 bg-red-500/8 text-xs text-red-300">
                            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                            {errorMsg}
                        </div>
                    )}

                    {/* Upload state feedback */}
                    {uploadState === "success" && (
                        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-green-500/20 bg-green-500/8 text-xs text-green-400">
                            <CheckCircle2 size={13} />
                            Upload complete!
                        </div>
                    )}

                    {uploadState === "uploading" && file && (
                        <div className="space-y-2 rounded-lg border border-border bg-secondary/50 p-3">
                            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                <span>{stageLabel}</span>
                                <span>{percent.toFixed(1)}%</span>
                            </div>
                            <div className="h-2 rounded-full bg-muted overflow-hidden">
                                <div
                                    className="h-full bg-primary transition-[width] duration-150"
                                    style={{ width: `${Math.min(percent, 100)}%` }}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                                <div>Uploaded: <span className="text-foreground">{formatBytes(uploadedBytes)} / {formatBytes(file.size)}</span></div>
                                <div>Remaining: <span className="text-foreground">{formatBytes(Math.max(file.size - uploadedBytes, 0))}</span></div>
                                <div>Speed: <span className="text-foreground">{speedBps > 0 ? `${formatBytes(speedBps)}/s` : "--"}</span></div>
                                <div>ETA: <span className="text-foreground">{formatEta(etaSeconds)}</span></div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer actions */}
                <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border">
                    <button
                        onClick={onClose}
                        disabled={uploadState === "uploading"}
                        className="h-9 px-4 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleUpload}
                        disabled={!file || uploadState === "uploading" || uploadState === "success"}
                        className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition-all disabled:opacity-50 flex items-center gap-2"
                    >
                        {uploadState === "uploading" ? (
                            <>
                                <RefreshCw size={13} className="animate-spin" />
                                Uploading…
                            </>
                        ) : uploadState === "success" ? (
                            <>
                                <CheckCircle2 size={13} />
                                Done
                            </>
                        ) : (
                            <>
                                <Upload size={13} />
                                Upload
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
