"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Plus, Search, CheckCircle2, AlertTriangle, Film, Clock, Trash2 } from "lucide-react";
import {
    listVideos, listTrashVideos, deleteVideo,
    restoreVideo, permanentDeleteVideo, type VideoOut, type VideoStatus,
} from "@/lib/api";
import { VideoCard } from "./_components/VideoCard";
import { TrashVideoCard } from "./_components/TrashVideoCard";
import { VideoCardSkeleton, TrashVideoCardSkeleton } from "./_components/Skeletons";
import { DeleteVideoConfirm } from "./_components/DeleteVideoConfirm";

const TRANSCODE_POLL_INTERVAL = 10_000; // ms

type Tab = "all" | "published" | "drafts" | "trash";

export default function VideosPage() {
    const [videos, setVideos] = useState<VideoOut[]>([]);
    const [trash, setTrash] = useState<VideoOut[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tab, setTab] = useState<Tab>("all");
    const [search, setSearch] = useState("");
    const [confirmDelete, setConfirmDelete] = useState<VideoOut | null>(null);
    const [toastMsg, setToastMsg] = useState<{ text: string; ok: boolean } | null>(null);

    // ── Shared transcode status poller ────────────────────────────────────────
    // Re-fetches the full listing while any video is in-progress.
    // One request covers all cards — no per-video status calls.
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (pollRef.current) clearInterval(pollRef.current);

        const hasActive = videos.some(
            (v) => v.transcode_status === "pending" || v.transcode_status === "processing",
        );
        if (!hasActive) return;

        pollRef.current = setInterval(async () => {
            try {
                const fresh = await listVideos({
                    search: search || undefined,
                });
                setVideos(fresh);
            } catch { /* ignore transient errors */ }
        }, TRANSCODE_POLL_INTERVAL);

        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [videos, search]);

    // ── Fetch ─────────────────────────────────────────────────────────────────

    const fetchActive = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setVideos(await listVideos({
                search: search || undefined,
            }));
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to load videos");
        } finally {
            setLoading(false);
        }
    }, [search]);

    const fetchTrash = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setTrash(await listTrashVideos());
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to load trash");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (tab === "trash") fetchTrash();
        else fetchActive();
    }, [tab, fetchActive, fetchTrash]);

    // ── Toast ─────────────────────────────────────────────────────────────────

    function toast(text: string, ok = true) {
        setToastMsg({ text, ok });
        setTimeout(() => setToastMsg(null), 3000);
    }

    // ── Handlers ──────────────────────────────────────────────────────────────

    const handleDeleteConfirm = async () => {
        if (!confirmDelete) return;
        try {
            await deleteVideo(confirmDelete.id);
            setVideos((prev) => prev.filter((v) => v.id !== confirmDelete.id));
            toast(`"${confirmDelete.title}" moved to trash`);
        } catch {
            toast("Failed to delete video", false);
        } finally {
            setConfirmDelete(null);
        }
    };

    const handleRestore = async (video: VideoOut) => {
        try {
            await restoreVideo(video.id);
            setTrash((prev) => prev.filter((v) => v.id !== video.id));
            toast(`"${video.title}" restored`);
        } catch {
            toast("Failed to restore video", false);
        }
    };

    const handlePermanentDelete = async (video: VideoOut) => {
        try {
            await permanentDeleteVideo(video.id);
            setTrash((prev) => prev.filter((v) => v.id !== video.id));
            toast(`"${video.title}" permanently deleted`);
        } catch {
            toast("Failed to delete video", false);
        }
    };

    // Called by VideoCard retry button — patches the shared videos array so the
    // page-level poller sees an active job and starts its interval immediately.
    const handleStatusChange = (id: string, status: VideoOut["transcode_status"]) => {
        setVideos((prev) =>
            prev.map((v) => v.id === id ? { ...v, transcode_status: status, transcode_progress: 0 } : v)
        );
    };

    // ── Get filtered videos by tab ─────────────────────────────────────────────
    const getFilteredVideos = (): VideoOut[] => {
        if (tab === "trash") return displayTrash;
        
        if (tab === "all") return displayVideos;
        if (tab === "published") return displayVideos.filter((v) => v.status === "published");
        if (tab === "drafts") return displayVideos.filter((v) => v.status === "draft");
        
        return displayVideos;
    };

    // ── Get tab count ──────────────────────────────────────────────────────────
    const getTabCount = (tabName: Tab): number => {
        if (tabName === "trash") return displayTrash.length;
        if (tabName === "all") return displayVideos.length;
        if (tabName === "published") return displayVideos.filter((v) => v.status === "published").length;
        if (tabName === "drafts") return displayVideos.filter((v) => v.status === "draft").length;
        return 0;
    };

    // ── Filtered list ─────────────────────────────────────────────────────────
    const displayVideos = videos;
    const displayTrash = trash;

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-xl font-bold text-foreground">Videos</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Manage your video content library</p>
                </div>
                <Link
                    href="/admin/content/videos/new"
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition-all"
                >
                    <Plus size={16} /> Add Video
                </Link>
            </div>

            {/* Tabs + Search */}
            <div className="flex items-center gap-4 flex-wrap">
                <div className="flex gap-1 p-1 rounded-xl bg-surface-hover/50 border border-border w-fit">
                    {(["all", "published", "drafts", "trash"] as Tab[]).map((t) => {
                        const tabConfig: Record<Tab, { label: string; icon: React.ElementType }> = {
                            all: { label: "All Videos", icon: Film },
                            published: { label: "Published", icon: CheckCircle2 },
                            drafts: { label: "Drafts", icon: Clock },
                            trash: { label: "Trash", icon: Trash2 },
                        };
                        const { label, icon: Icon } = tabConfig[t];
                        return (
                            <button
                                key={t}
                                onClick={() => setTab(t)}
                                className={`flex items-center gap-2 px-3 py-0.5 rounded-lg text-sm font-medium transition-colors ${tab === t
                                        ? "bg-card text-foreground shadow-sm border border-border/50"
                                        : "text-muted-foreground hover:text-foreground"
                                    }`}
                            >
                                <Icon size={14} />
                                {label}
                                <span
                                    className={`ml-1.5 text-[10px] bg-primary/15 text-primary px-1.5 rounded-full ${
                                        loading ? "animate-pulse" : ""
                                    }`}
                                >
                                    {loading ? 0 : (getTabCount(t) ?? 0)}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {tab !== "trash" && (
                    <div className="py-0.5">
                        <div className="relative inline-block">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                            <input
                                type="search"
                                placeholder="Search videos…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="h-9 w-64 pl-8 pr-3 rounded-lg bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Error */}
            {error && (
                <div className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm text-red-300 border border-red-500/20 bg-red-500/8">
                    <AlertTriangle size={14} /> {error}
                </div>
            )}

            {/* Active Videos Grid */}
            {tab !== "trash" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {loading
                        ? Array.from({ length: 8 }).map((_, i) => <VideoCardSkeleton key={i} />)
                        : getFilteredVideos().length === 0
                            ? (
                                <div className="col-span-full py-16 flex flex-col border border-border rounded-xl bg-background items-center gap-3 text-muted-foreground">
                                    <div className="rounded-xl bg-secondary p-4">
                                        <svg className="w-12 h-12 opacity-20" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M8 5v14l11-7z" />
                                        </svg>
                                    </div>
                                    <p className="text-sm">No videos found</p>
                                </div>
                            )
                            : getFilteredVideos().map((video) => (
                                <VideoCard
                                    key={video.id}
                                    video={video}
                                    onDelete={() => setConfirmDelete(video)}
                                    onStatusChange={handleStatusChange}
                                />
                            ))}
                </div>
            )}

            {/* Trash List */}
            {tab === "trash" && (
                <div className="space-y-3">
                    {loading
                        ? Array.from({ length: 3 }).map((_, i) => <TrashVideoCardSkeleton key={i} />)
                        : displayTrash.length === 0
                            ? (
                                <div className="py-16 flex flex-col border border-border rounded-xl bg-background items-center gap-3 text-muted-foreground">
                                    <div className="rounded-xl bg-secondary p-4">
                                        <svg className="w-12 h-12 opacity-20" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M8 5v14l11-7z" />
                                        </svg>
                                    </div>
                                    <p className="text-sm">Trash is empty</p>
                                </div>
                            )
                            : displayTrash.map((video) => (
                                <TrashVideoCard
                                    key={video.id}
                                    video={video}
                                    onRestore={() => handleRestore(video)}
                                    onDeleteForever={() => handlePermanentDelete(video)}
                                />
                            ))}
                </div>
            )}

            {/* Delete confirm dialog */}
            {confirmDelete && (
                <DeleteVideoConfirm
                    video={confirmDelete}
                    onCancel={() => setConfirmDelete(null)}
                    onConfirm={handleDeleteConfirm}
                />
            )}

            {/* Toast */}
            {toastMsg && (
                <div
                    className={`fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-xl text-sm font-medium z-50 ${toastMsg.ok
                            ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/25"
                            : "bg-red-500/15 text-red-300 border border-red-500/25"
                        }`}
                >
                    {toastMsg.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                    {toastMsg.text}
                </div>
            )}
        </div>
    );
}
