"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, X, ImageIcon, Film, Music, AlertTriangle } from "lucide-react";
import { formatBytes } from "./AssetRow";
import { UPLOAD_ACCEPT, normalizeUploadFile, validateUploadFile, type RejectedFile } from "./useUploadQueue";

function typeIcon(contentType: string) {
    if (contentType.startsWith("video/")) return <Film size={16} className="text-blue-400" />;
    if (contentType.startsWith("audio/")) return <Music size={16} className="text-purple-400" />;
    return <ImageIcon size={16} className="text-muted-foreground" />;
}

function fileKey(file: File) {
    return `${file.name}:${file.size}:${file.lastModified}:${file.type}`;
}

interface UploadDialogProps {
    onClose: () => void;
    /** Hands the selected files to the upload queue. Returns the files the queue refused. */
    onSubmit: (files: File[]) => RejectedFile[];
}

export function UploadDialog({ onClose, onSubmit }: UploadDialogProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [files, setFiles] = useState<File[]>([]);
    const [rejected, setRejected] = useState<RejectedFile[]>([]);
    const [dragging, setDragging] = useState(false);

    const addFiles = useCallback((incoming: File[]) => {
        const valid: File[] = [];
        const problems: RejectedFile[] = [];
        for (const original of incoming) {
            const file = normalizeUploadFile(original);
            const reason = validateUploadFile(file);
            if (reason) problems.push({ name: file.name, reason });
            else valid.push(file);
        }
        setRejected(problems);
        if (valid.length === 0) return;
        setFiles((prev) => {
            const seen = new Set(prev.map(fileKey));
            const next = [...prev];
            for (const file of valid) {
                if (seen.has(fileKey(file))) continue;
                seen.add(fileKey(file));
                next.push(file);
            }
            return next;
        });
    }, []);

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setDragging(false);
        addFiles(Array.from(e.dataTransfer.files));
    };

    const handleSubmit = () => {
        if (files.length === 0) return;
        onSubmit(files);
        onClose();
    };

    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                    <p className="text-sm font-semibold text-foreground">Upload Files</p>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                        <X size={14} />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    {/* Drop zone */}
                    <div
                        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={handleDrop}
                        onClick={() => inputRef.current?.click()}
                        className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed cursor-pointer transition-colors
                            ${files.length > 0 ? "p-5" : "p-10"}
                            ${dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"}`}
                    >
                        <Upload size={26} className="text-muted-foreground" />
                        <div className="text-center">
                            <p className="text-sm font-medium text-foreground">
                                {files.length > 0 ? "Drop or click to add more files" : "Drop files or click to browse"}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                                Select multiple files at once · Images up to 50 MB · Video up to 500 GB · Audio up to 100 MB
                            </p>
                        </div>
                        <input
                            ref={inputRef}
                            type="file"
                            multiple
                            accept={UPLOAD_ACCEPT}
                            className="hidden"
                            onChange={(e) => {
                                addFiles(Array.from(e.target.files ?? []));
                                e.target.value = "";
                            }}
                        />
                    </div>

                    {/* Rejected files */}
                    {rejected.length > 0 && (
                        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-red-500/20 bg-red-500/8 text-xs text-red-300">
                            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                            <ul className="space-y-0.5 min-w-0">
                                {rejected.slice(0, 5).map((r, i) => (
                                    <li key={`${r.name}-${i}`} className="truncate">{r.name}: {r.reason}</li>
                                ))}
                                {rejected.length > 5 && <li>and {rejected.length - 5} more not added</li>}
                            </ul>
                        </div>
                    )}

                    {/* Selected files */}
                    {files.length > 0 && (
                        <div className="rounded-xl border border-border overflow-hidden">
                            <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                                <span>{files.length} {files.length === 1 ? "file" : "files"} selected</span>
                                <span>{formatBytes(totalBytes)}</span>
                            </div>
                            <ul className="max-h-60 overflow-y-auto divide-y divide-border">
                                {files.map((file) => (
                                    <li key={fileKey(file)} className="flex items-center gap-3 px-3 py-2">
                                        <div className="w-8 h-8 shrink-0 rounded-md bg-secondary border border-border flex items-center justify-center">
                                            {typeIcon(file.type)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm text-foreground truncate">{file.name}</p>
                                            <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                                        </div>
                                        <button
                                            onClick={() => setFiles((prev) => prev.filter((f) => f !== file))}
                                            title="Remove"
                                            className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
                                        >
                                            <X size={13} />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border">
                    <button
                        onClick={onClose}
                        className="h-9 px-4 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={files.length === 0}
                        className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition-all disabled:opacity-50 flex items-center gap-2"
                    >
                        <Upload size={13} />
                        {files.length > 1 ? `Upload ${files.length} files` : "Upload"}
                    </button>
                </div>
            </div>
        </div>
    );
}
