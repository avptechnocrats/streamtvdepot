"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Film, Music, X, CheckCircle2, Copy, Check, Upload, Search, FolderOpen } from "lucide-react";
import { ENDPOINTS } from "@/lib/api/endpoints";
import apiClient from "@/lib/api/client";
import { resolveMediaUrl } from "@/lib/media";

export interface MediaAsset {
    id: string;
    original_filename: string;
    url: string;
    display_url: string | null;
    content_type: string;
    width: number | null;
    height: number | null;
}

const LIB_PAGE_SIZE = 20;

export default function MediaLibraryModal({
    open,
    onClose,
    onSelect,
    onUploadFile,
    usedUrls = [],
    filterType = "image",
    defaultTab = "upload",
}: {
    open: boolean;
    onClose: () => void;
    onSelect: (url: string, filename: string) => void;
    /** When provided, the Upload tab is shown. Called with the picked File; modal closes immediately after. */
    onUploadFile?: (file: File) => void;
    usedUrls?: string[];
    filterType?: "image" | "video" | "audio";
    defaultTab?: "upload" | "library";
}) {
    const [tab, setTab] = useState<"upload" | "library">(defaultTab);
    const [search, setSearch] = useState("");
    const [dragging, setDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [assets, setAssets] = useState<MediaAsset[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const pageRef = useRef(1);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    function copyUrl(url: string, id: string) {
        navigator.clipboard.writeText(url).then(() => {
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), 1800);
        });
    }

    const fetchPage = useCallback(async (type: "image" | "video" | "audio", page: number, replace: boolean, query: string) => {
        if (replace) setLoading(true); else setLoadingMore(true);
        try {
            const params: Record<string, unknown> = { page, page_size: LIB_PAGE_SIZE, media_type: type };
            if (query.trim()) params.search = query.trim();
            const res = await apiClient.get<{ items: MediaAsset[] }>(ENDPOINTS.admin.upload.mediaLibrary, { params });
            setAssets((prev) => replace ? res.data.items : [...prev, ...res.data.items]);
            setHasMore(res.data.items.length === LIB_PAGE_SIZE);
            pageRef.current = page + 1;
        } finally {
            if (replace) setLoading(false); else setLoadingMore(false);
        }
    }, []);

    // Reset and fetch when modal opens or filterType changes
    useEffect(() => {
        if (!open) return;
        setTab(defaultTab);
        setSearch("");
        setDragging(false);
        pageRef.current = 1;
        setAssets([]);
        setHasMore(false);
        fetchPage(filterType, 1, true, "");
    }, [open, filterType, defaultTab, fetchPage]);

    // Debounced search: re-fetch from page 1 when search term changes
    const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (!open) return;
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = setTimeout(() => {
            pageRef.current = 1;
            setAssets([]);
            setHasMore(false);
            fetchPage(filterType, 1, true, search);
        }, 350);
        return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const handleFilePick = useCallback((file: File) => {
        if (onUploadFile) {
            onUploadFile(file);
            onClose();
        }
    }, [onUploadFile, onClose]);

    const filteredAssets = assets;

    if (!open) return null;

    const accept = filterType === "image"
        ? "image/jpeg,image/png,image/webp"
        : filterType === "audio"
            ? "audio/mpeg,audio/mp4,audio/wav,audio/webm,audio/ogg,audio/flac,audio/aac,audio/*"
            : "video/mp4,video/quicktime,video/x-matroska,video/*";
    const showUploadTab = !!onUploadFile;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl border border-border bg-card shadow-2xl">

                {/* ── Header ─────────────────────────────────────────────── */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
                    {showUploadTab ? (
                        <div className="flex items-center gap-1 bg-secondary rounded-xl p-1">
                            <button
                                type="button"
                                onClick={() => setTab("upload")}
                                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${tab === "upload" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                            >
                                Upload from Computer
                            </button>
                            <button
                                type="button"
                                onClick={() => setTab("library")}
                                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${tab === "library" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                            >
                                Media Library
                            </button>
                        </div>
                    ) : (
                        <h2 className="text-base font-semibold text-foreground">Media Library</h2>
                    )}
                    <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                        <X size={16} />
                    </button>
                </div>

                {/* ── Body ───────────────────────────────────────────────── */}
                <div className="flex-1 overflow-y-auto min-h-0 p-5 space-y-4">

                    {/* ── Upload tab ─────────────────────────────────────── */}
                    {tab === "upload" && showUploadTab ? (
                        <div key="tab-upload" className="space-y-4">
                            <div
                                onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFilePick(f); }}
                                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                                onDragLeave={() => setDragging(false)}
                                onClick={() => fileInputRef.current?.click()}
                                className={`border-2 border-dashed rounded-2xl p-16 flex flex-col items-center gap-4 text-center cursor-pointer transition-colors ${dragging ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/50 text-muted-foreground hover:text-foreground"}`}
                            >
                                <Upload size={36} className="opacity-50" />
                                <div className="space-y-1">
                                    <p className="text-sm font-semibold">Drag & drop your file here</p>
                                    <p className="text-xs opacity-60">
                                        {filterType === "image" ? "JPG, PNG or WebP" : filterType === "audio" ? "MP3, AAC, WAV, FLAC, OGG or WebM" : "MP4, MOV or MKV"}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                                    className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition-all"
                                >
                                    <FolderOpen size={15} /> Browse Files
                                </button>
                            </div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept={accept}
                                className="hidden"
                                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFilePick(f); }}
                            />
                        </div>

                    ) : (
                        /* ── Library tab ─────────────────────────────────── */
                        <div key="tab-library" className="space-y-4">
                            {/* Search */}
                            <div className="relative">
                                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                                <input
                                    type="text"
                                    placeholder="Search by filename…"
                                    value={search ?? ""}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="w-full h-9 rounded-lg bg-secondary border border-border pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                                />
                            </div>

                            {/* Grid */}
                            {loading ? (
                                <div className="grid grid-cols-4 gap-3">
                                    {Array.from({ length: 8 }).map((_, i) => (
                                        <div key={i} className="aspect-square rounded-xl bg-muted animate-pulse" />
                                    ))}
                                </div>
                            ) : filteredAssets.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
                                    <Film size={32} className="opacity-30" />
                                    <p className="text-sm">
                                        {search ? "No results matching your search" : `No ${filterType} assets yet`}
                                    </p>
                                    {showUploadTab && !search && (
                                        <button
                                            type="button"
                                            onClick={() => setTab("upload")}
                                            className="mt-2 flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                                        >
                                            <Upload size={12} /> Upload your first {filterType}
                                        </button>
                                    )}
                                </div>
                            ) : filterType === "video" || filterType === "audio" ? (
                                <>
                                    <div className="grid grid-cols-4 gap-3">
                                        {filteredAssets.map((asset) => {
                                            const src = resolveMediaUrl(asset) ?? asset.url;
                                            const inUse = usedUrls.some((u) => u && (u === src || u === asset.url));
                                            return (
                                                <div key={asset.id}
                                                    role="button" tabIndex={0}
                                                    onClick={() => { onSelect(src, asset.original_filename); onClose(); }}
                                                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(src, asset.original_filename); onClose(); } }}
                                                    className={`group relative aspect-square rounded-xl overflow-hidden border transition-colors bg-secondary cursor-pointer ${inUse ? "border-primary" : "border-border hover:border-primary"}`}
                                                >
                                                    <div className="w-full h-full flex items-center justify-center bg-black/30 group-hover:bg-black/50 transition-colors">
                                                        {filterType === "audio" ? <Music size={40} className="text-primary opacity-60" /> : <Film size={40} className="text-primary opacity-60" />}
                                                    </div>
                                                    {inUse && (
                                                        <div className="absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-primary text-primary-foreground text-[10px] font-semibold shadow">
                                                            <CheckCircle2 size={9} /> In Use
                                                        </div>
                                                    )}
                                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                                        <CheckCircle2 size={20} className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                                                    </div>
                                                    <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1 bg-black/60">
                                                        <p className="text-[10px] text-white truncate">{asset.original_filename}</p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {hasMore && (
                                        <button type="button" onClick={() => fetchPage(filterType, pageRef.current, false, search)} disabled={loadingMore}
                                            className="w-full flex items-center justify-center gap-2 h-9 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50">
                                            {loadingMore ? <Loader2 size={13} className="animate-spin" /> : null}
                                            {loadingMore ? "Loading…" : "Load more"}
                                        </button>
                                    )}
                                </>
                            ) : (
                                <>
                                    <div className="grid grid-cols-4 gap-3">
                                        {filteredAssets.map((asset) => {
                                            const src = resolveMediaUrl(asset) ?? asset.url;
                                            const inUse = usedUrls.some((u) => u && (u === src || u === asset.url));
                                            return (
                                                <div key={asset.id}
                                                    role="button" tabIndex={0}
                                                    onClick={() => { onSelect(src, asset.original_filename); onClose(); }}
                                                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(src, asset.original_filename); onClose(); } }}
                                                    className={`group relative aspect-square rounded-xl overflow-hidden border transition-colors bg-secondary cursor-pointer ${inUse ? "border-primary" : "border-border hover:border-primary"}`}
                                                >
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img src={src} alt={asset.original_filename} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
                                                    {inUse && (
                                                        <div className="absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-primary text-primary-foreground text-[10px] font-semibold shadow">
                                                            <CheckCircle2 size={9} /> In Use
                                                        </div>
                                                    )}
                                                    <button type="button" onClick={(e) => { e.stopPropagation(); copyUrl(src, asset.id); }} title="Copy URL"
                                                        className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/70 text-white text-[10px] font-medium shadow">
                                                        {copiedId === asset.id ? <Check size={9} /> : <Copy size={9} />}
                                                        {copiedId === asset.id ? "Copied" : "Copy"}
                                                    </button>
                                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                                                        <CheckCircle2 size={20} className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                                                    </div>
                                                    <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <p className="text-[10px] text-white truncate">{asset.original_filename}</p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {hasMore && (
                                        <button type="button" onClick={() => fetchPage(filterType, pageRef.current, false, search)} disabled={loadingMore}
                                            className="w-full flex items-center justify-center gap-2 h-9 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50">
                                            {loadingMore ? <Loader2 size={13} className="animate-spin" /> : null}
                                            {loadingMore ? "Loading…" : "Load more"}
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
