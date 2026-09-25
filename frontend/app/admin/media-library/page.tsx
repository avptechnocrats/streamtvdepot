"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
    ImageIcon, AlertTriangle,
    CheckCircle2, X, Upload, Search, Image, Video, Music, RefreshCw,
} from "lucide-react";
import apiClient from "@/lib/api/client";
import { ENDPOINTS } from "@/lib/api/endpoints";
import { deleteMediaAsset } from "@/lib/api";
import {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
    getPaginationItems,
} from "@/components/ui/pagination";
import { AssetRow } from "./_components/AssetRow";
import { AssetRowSkeleton } from "./_components/Skeletons";
import { UploadDialog } from "./_components/UploadDialog";
import { PreviewModal } from "./_components/PreviewModal";
import { DeleteConfirm } from "./_components/DeleteConfirm";
import type { MediaAsset } from "./_components/AssetRow";
import { uploadAssetToS3 } from "@/lib/upload/s3-upload";

const failedFileMap = new Map<string, File>();

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ msg, ok, onDismiss }: { msg: string; ok: boolean; onDismiss: () => void }) {
    return (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium
            ${ok ? "bg-card border-green-500/20 text-green-400" : "bg-card border-red-500/20 text-red-400"}`}>
            {ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
            {msg}
            <button onClick={onDismiss} className="ml-1 opacity-60 hover:opacity-100"><X size={13} /></button>
        </div>
    );
}

// ─── Type filter ──────────────────────────────────────────────────────────────

type TypeFilter = "all" | "image" | "video" | "audio";

const TYPE_TABS: { key: TypeFilter; label: string; icon: React.ElementType }[] = [
    { key: "all", label: "All", icon: ImageIcon },
    { key: "image", label: "Images", icon: Image },
    { key: "video", label: "Videos", icon: Video },
    { key: "audio", label: "Audio", icon: Music },
];

function matchesType(asset: MediaAsset, filter: TypeFilter): boolean {
    if (filter === "all") return true;
    return asset.content_type?.startsWith(`${filter}/`) ?? false;
}

// ─── Page ──────────────────────────────────────────────────────────────────────

const DISPLAY_PAGE_SIZE = 10;

export default function MediaLibraryPage() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [assets, setAssets] = useState<MediaAsset[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [tabCounts, setTabCounts] = useState<Record<TypeFilter, number>>({
        all: 0,
        image: 0,
        video: 0,
        audio: 0,
    });
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [search, setSearch] = useState("");
    const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
    const [confirmAsset, setConfirmAsset] = useState<MediaAsset | null>(null);
    const [previewAsset, setPreviewAsset] = useState<MediaAsset | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [uploadOpen, setUploadOpen] = useState(false);
    const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

    const totalPages = Math.max(1, Math.ceil(totalCount / DISPLAY_PAGE_SIZE));
    // Derive current page from URL query string
    const displayPage = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));

    function setDisplayPage(page: number) {
        const params = new URLSearchParams(searchParams.toString());
        if (page <= 1) {
            params.delete("page");
        } else {
            params.set("page", String(page));
        }
        router.replace(`?${params.toString()}`);
    }

    const upsertAsset = useCallback((asset: MediaAsset) => {
        setAssets((prev) => {
            const idx = prev.findIndex((a) => a.id === asset.id);
            if (idx === -1) return [asset, ...prev];
            const next = [...prev];
            next[idx] = { ...next[idx], ...asset };
            return next;
        });
    }, []);

    function showToast(msg: string, ok = true) {
        setToast({ msg, ok });
        setTimeout(() => setToast(null), 4000);
    }

    const fetchAssets = useCallback(async (manualRefresh = false) => {
        if (manualRefresh) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }

        try {
            const query = search.trim();
            const res = await apiClient.get<{
                items: MediaAsset[];
                counts: { all: number; image: number; video: number; audio: number };
            }>(ENDPOINTS.admin.upload.mediaLibrary, {
                params: {
                    page: displayPage,
                    page_size: DISPLAY_PAGE_SIZE,
                    ...(typeFilter !== "all" ? { media_type: typeFilter } : {}),
                    ...(query ? { search: query } : {}),
                },
            });

            setAssets(res.data.items);
            setTabCounts(res.data.counts);
            // The active tab's count from the API is the pagination total for the current filter/search.
            setTotalCount(res.data.counts[typeFilter]);
        } catch {
            showToast("Failed to load media assets.", false);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [displayPage, search, typeFilter]);

    useEffect(() => { fetchAssets(); }, [fetchAssets]);

    useEffect(() => {
        const tabParam = searchParams.get("tab");
        if (tabParam && (["all", "image", "video", "audio"] as const).includes(tabParam as TypeFilter)) {
            setTypeFilter(tabParam as TypeFilter);
        }
    }, [searchParams]);

    // Reset to page 1 whenever search or type filter changes
    useEffect(() => {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("page");
        if (typeFilter !== "all") params.set("tab", typeFilter);
        else params.delete("tab");
        router.replace(`?${params.toString()}`);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search, typeFilter]);

    const handleDelete = async () => {
        if (!confirmAsset) return;
        setDeleting(true);
        try {
            await deleteMediaAsset(confirmAsset.id);
            setAssets((prev) => {
                const next = prev.filter((a) => a.id !== confirmAsset.id);
                // If we deleted the last item on the current page, go back one page
                const newTotalPages = Math.max(1, Math.ceil(next.length / DISPLAY_PAGE_SIZE));
                if (displayPage > newTotalPages) setDisplayPage(newTotalPages);
                return next;
            });
            showToast(`"${confirmAsset.original_filename}" deleted.`);
        } catch (err: unknown) {
            const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            showToast(detail ?? "Failed to delete asset.", false);
        } finally {
            setDeleting(false);
            setConfirmAsset(null);
        }
    };

    // Counts for tab badges
    const counts: Record<TypeFilter, number> = {
        all: tabCounts.all,
        image: tabCounts.image,
        video: tabCounts.video,
        audio: tabCounts.audio,
    };

    useEffect(() => {
        if (displayPage > totalPages) {
            setDisplayPage(totalPages);
        }
    }, [displayPage, totalPages]);

    const pageSlice = assets;

    return (
        <div className="p-6 space-y-6">

            {/* ── Header ── */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold text-foreground">Media Library</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Upload and manage images, videos, and audio files for use across your platform
                    </p>
                </div>
                <button
                    onClick={() => setUploadOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition-all"
                >
                    <Upload size={14} /> Upload File
                </button>
            </div>

            {/* ── Tabs + Search + Refresh ── */}
            <div className="flex items-center justify-between gap-3">
                <div className="flex gap-1 p-1 rounded-xl bg-surface-hover/50 border border-border w-fit">
                    {TYPE_TABS.map(({ key, label, icon: Icon }) => (
                        <button
                            key={key}
                            onClick={() => setTypeFilter(key)}
                            className={`flex items-center gap-2 px-3 py-0.5 rounded-lg text-sm font-medium transition-colors ${
                                typeFilter === key
                                    ? "bg-card text-foreground shadow-sm border border-border/50"
                                    : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            <Icon size={14} />
                            {label}
                            <span className="text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                                {counts[key]}
                            </span>
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-2">
                    <div className="relative w-72 md:w-80">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by filename…"
                            className="w-full h-9 rounded-xl bg-secondary border border-border pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                        />
                    </div>

                    <button
                        onClick={() => fetchAssets(true)}
                        disabled={loading || refreshing}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-secondary text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-50"
                        title="Refresh"
                    >
                        <RefreshCw size={13} className={refreshing || loading ? "animate-spin" : ""} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* ── Table ── */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
                {/* Column headers */}
                <div className="flex items-center gap-4 px-4 py-2.5 border-b border-border bg-muted/30">
                    <div className="w-10 shrink-0" />
                    <p className="flex-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                        Filename
                    </p>
                    <p className="hidden sm:block w-16 shrink-0 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                        Type
                    </p>
                    <p className="hidden sm:block w-20 shrink-0 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                        Size
                    </p>
                    <p className="hidden md:block w-24 shrink-0 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                        Dimensions
                    </p>
                    <p className="hidden lg:block w-28 shrink-0 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                        Uploaded
                    </p>
                    <p className="hidden sm:block w-16 shrink-0 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                        Status
                    </p>
                    <div className="w-24 shrink-0" />
                </div>

                {loading && assets.length === 0 ? (
                    Array.from({ length: 8 }).map((_, i) => <AssetRowSkeleton key={i} />)
                ) : pageSlice.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                        <ImageIcon size={32} className="opacity-30" />
                        <p className="text-sm">
                            {search || typeFilter !== "all"
                                ? "No files match your filter"
                                : "No files uploaded yet"}
                        </p>
                        {!search && typeFilter === "all" && (
                            <button
                                onClick={() => setUploadOpen(true)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-border hover:border-primary/40 transition-colors"
                            >
                                <Upload size={12} /> Upload your first file
                            </button>
                        )}
                    </div>
                ) : (
                    pageSlice.map((asset) => (
                        <AssetRow
                            key={asset.id}
                            asset={asset}
                            onRetry={asset.upload_status === "failed" ? async () => {
                                const fileKey = asset.retry_source_file_key;
                                const srcFile = fileKey ? failedFileMap.get(fileKey) : undefined;
                                if (!srcFile) {
                                    showToast("Original file is not available anymore. Please upload again.", false);
                                    return;
                                }

                                upsertAsset({ ...asset, retrying: true, failed_error: undefined });
                                try {
                                    const uploaded = await uploadAssetToS3(srcFile, {
                                        onProgress: (p) => {
                                            upsertAsset({
                                                ...asset,
                                                upload_status: "failed",
                                                uploaded_bytes: p.uploadedBytes,
                                                remaining_bytes: p.remainingBytes,
                                                retrying: true,
                                                retry_source_file_key: fileKey,
                                            });
                                        },
                                    });
                                    setAssets((prev) => prev.filter((a) => a.id !== asset.id));
                                    setAssets((prev) => [uploaded as MediaAsset, ...prev]);
                                    showToast(`\"${srcFile.name}\" uploaded.`);
                                } catch (err: unknown) {
                                    const rawMsg = err instanceof Error ? err.message : "Upload failed. Please try again.";
                                    upsertAsset({
                                        ...asset,
                                        upload_status: "failed",
                                        retrying: false,
                                        failed_error: rawMsg,
                                    });
                                    showToast(rawMsg, false);
                                }
                            } : undefined}
                            onPreview={() => setPreviewAsset(asset)}
                            onDelete={() => setConfirmAsset(asset)}
                        />
                    ))
                )}
            </div>

            {/* Numbered pagination */}
            {!loading &&  totalCount > 0 && (
                <div className="flex items-center justify-between gap-3">
                    <p className="w-full text-xs text-muted-foreground">
                        Showing {(displayPage - 1) * DISPLAY_PAGE_SIZE + 1}–{Math.min(displayPage * DISPLAY_PAGE_SIZE, totalCount)} of {totalCount}
                    </p>
                    {totalPages > 1 && (
                        <Pagination>
                            <PaginationContent>
                                <PaginationItem>
                                    <PaginationPrevious
                                        href="#"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            if (displayPage > 1) setDisplayPage(displayPage - 1);
                                        }}
                                        aria-disabled={displayPage <= 1}
                                        className={displayPage <= 1 ? "pointer-events-none opacity-50" : ""}
                                    />
                                </PaginationItem>
                                {getPaginationItems(displayPage, totalPages, 1).map((p, index) =>
                                    p === "ellipsis" ? (
                                        <PaginationItem key={`ellipsis-${index}`}>
                                            <PaginationEllipsis className="h-9 w-9" />
                                        </PaginationItem>
                                    ) : (
                                        <PaginationItem key={p}>
                                            <PaginationLink
                                                href="#"
                                                isActive={p === displayPage}
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    setDisplayPage(p);
                                                }}
                                            >
                                                {p}
                                            </PaginationLink>
                                        </PaginationItem>
                                    )
                                )}
                                <PaginationItem>
                                    <PaginationNext
                                        href="#"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            if (displayPage < totalPages) setDisplayPage(displayPage + 1);
                                        }}
                                        aria-disabled={displayPage >= totalPages}
                                        className={displayPage >= totalPages ? "pointer-events-none opacity-50" : ""}
                                    />
                                </PaginationItem>
                            </PaginationContent>
                        </Pagination>
                    )}
                </div>
            )}

            {/* ── Upload dialog ── */}
            {uploadOpen && (
                <UploadDialog
                    onClose={() => setUploadOpen(false)}
                    onUploaded={(asset) => {
                        setAssets((prev) => [asset, ...prev]);
                        showToast(`"${asset.original_filename}" uploaded.`);
                    }}
                    onUploadFailed={(failed) => {
                        failedFileMap.set(failed.retry_source_file_key, failed.file);
                        setAssets((prev) => [
                            {
                                id: failed.id,
                                original_filename: failed.original_filename,
                                url: "",
                                display_url: null,
                                content_type: failed.content_type,
                                file_size: failed.file_size,
                                width: null,
                                height: null,
                                created_at: failed.created_at,
                                in_use: false,
                                upload_status: "failed",
                                uploaded_bytes: failed.uploaded_bytes,
                                remaining_bytes: failed.remaining_bytes,
                                failed_error: failed.failed_error,
                                failed_at: failed.failed_at,
                                retry_source_file_key: failed.retry_source_file_key,
                            },
                            ...prev,
                        ]);
                        showToast(`Upload failed for \"${failed.original_filename}\". You can retry from row action.`, false);
                    }}
                />
            )}

            {/* ── Preview modal ── */}
            {previewAsset && (
                <PreviewModal
                    asset={previewAsset}
                    onClose={() => setPreviewAsset(null)}
                    onDelete={() => { setConfirmAsset(previewAsset); setPreviewAsset(null); }}
                />
            )}

            {/* ── Delete confirm ── */}
            {confirmAsset && (
                <DeleteConfirm
                    asset={confirmAsset}
                    onCancel={() => setConfirmAsset(null)}
                    onConfirm={handleDelete}
                    loading={deleting}
                />
            )}

            {/* ── Toast ── */}
            {toast && <Toast msg={toast.msg} ok={toast.ok} onDismiss={() => setToast(null)} />}
        </div>
    );
}
