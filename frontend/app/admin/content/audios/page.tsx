"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Search, Music, AlertTriangle, CheckCircle2, Clock, Trash2, RefreshCw } from "lucide-react";
import { listAudios, listTrashAudios, deleteAudio, restoreAudio, permanentDeleteAudio, type AudioOut } from "@/lib/api";
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
import { AudioCard } from "./_components/AudioCard";

type Tab = "all" | "published" | "drafts" | "trash";

const PAGE_SIZE = 10;

export default function AudiosPage() {
    const [audios, setAudios] = useState<AudioOut[]>([]);
    const [trash, setTrash] = useState<AudioOut[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tab, setTab] = useState<Tab>("all");
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [confirmDelete, setConfirmDelete] = useState<AudioOut | null>(null);
    const [toastMsg, setToastMsg] = useState<{ text: string; ok: boolean } | null>(null);

    function toast(text: string, ok = true) {
        setToastMsg({ text, ok });
        setTimeout(() => setToastMsg(null), 3000);
    }

    const fetchAudios = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const status = tab === "published" ? "published" : tab === "drafts" ? "draft" : undefined;
            setAudios(await listAudios({
                search: search || undefined,
                status,
            }));
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to load audios");
        } finally {
            setLoading(false);
        }
    }, [search, tab]);

    const fetchTrashAudiosList = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setTrash(await listTrashAudios());
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to load trash");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (tab === "trash") fetchTrashAudiosList();
        else fetchAudios();
    }, [fetchAudios, fetchTrashAudiosList, tab]);

    useEffect(() => {
        setPage(1);
    }, [search, tab]);

    const getFilteredAudios = (): AudioOut[] => {
        if (tab === "trash") return trash;
        if (tab === "all") return audios;
        if (tab === "published") return audios.filter((audio) => audio.status === "published");
        if (tab === "drafts") return audios.filter((audio) => audio.status === "draft");
        return audios;
    };

    const getTabCount = (tabName: Tab): number => {
        if (tabName === "trash") return trash.length;
        if (tabName === "all") return audios.length;
        if (tabName === "published") return audios.filter((audio) => audio.status === "published").length;
        if (tabName === "drafts") return audios.filter((audio) => audio.status === "draft").length;
        return 0;
    };

    const activeList = getFilteredAudios();
    const totalPages = Math.max(1, Math.ceil(activeList.length / PAGE_SIZE));
    const paginatedActiveList = activeList.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const pageItems = getPaginationItems(page, totalPages);

    const handleDeleteConfirm = async () => {
        if (!confirmDelete) return;
        try {
            await deleteAudio(confirmDelete.id);
            setAudios((prev) => prev.filter((a) => a.id !== confirmDelete.id));
            toast(`"${confirmDelete.title}" moved to trash`);
        } catch {
            toast("Failed to delete audio", false);
        } finally {
            setConfirmDelete(null);
        }
    };

    const handleRestore = async (audio: AudioOut) => {
        try {
            await restoreAudio(audio.id);
            setTrash((prev) => prev.filter((item) => item.id !== audio.id));
            toast(`"${audio.title}" restored`);
        } catch {
            toast("Failed to restore audio", false);
        }
    };

    const handlePermanentDelete = async (audio: AudioOut) => {
        try {
            await permanentDeleteAudio(audio.id);
            setTrash((prev) => prev.filter((item) => item.id !== audio.id));
            toast(`"${audio.title}" permanently deleted`);
        } catch {
            toast("Failed to delete audio", false);
        }
    };

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-xl font-bold text-foreground">Audios</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Manage your audio tracks and music library</p>
                </div>
                <Link
                    href="/admin/content/audios/new"
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition-all"
                >
                    <Plus size={16} /> Add Audio
                </Link>
            </div>

            {/* Tabs + Search */}
            <div className="flex items-center justify-between gap-3">
                <div className="flex gap-1 p-1 rounded-xl bg-surface-hover/50 border border-border w-fit">
                    {(["all", "published", "drafts", "trash"] as Tab[]).map((t) => {
                        const tabConfig: Record<Tab, { label: string; icon: typeof Music }> = {
                            all: { label: "All Audios", icon: Music },
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
                                    : "text-muted-foreground hover:text-foreground"}`}
                            >
                                <Icon size={14} />
                                {label}
                                <span
                                    className={`ml-1.5 text-[10px] bg-primary/15 text-primary px-1.5 rounded-full ${loading ? "animate-pulse" : ""}`}
                                >
                                    {loading ? 0 : getTabCount(t)}
                                </span>
                            </button>
                        );
                    })}
                </div>

                <div className="flex items-center gap-2">
                    {tab !== "trash" && (
                        <div className="py-0.5">
                            <div className="relative inline-block">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                                <input
                                    type="search"
                                    placeholder="Search audios…"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="h-9 w-full pl-9 pr-3 rounded-xl bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                                />
                            </div>
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={() => tab === "trash" ? fetchTrashAudiosList() : fetchAudios()}
                        disabled={loading}
                        className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-50 transition-colors"
                        title="Refresh list"
                    >
                        <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm text-red-300 border border-red-500/20 bg-red-500/8">
                    <AlertTriangle size={14} /> {error}
                </div>
            )}

            {/* List */}
            {tab !== "trash" && (
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                    <div className="flex items-center gap-4 px-4 py-2.5 border-b border-border bg-muted/30">
                        <div className="w-10 shrink-0" />
                        <p className="flex-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Title</p>
                        <p className="w-40 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Album</p>
                        <p className="w-24 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground text-center">Status</p>
                        <p className="w-20 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground text-center">Action</p>
                    </div>

                    {loading
                        ? Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-border last:border-0 bg-card animate-pulse">
                                <div className="w-10 h-10 rounded-lg bg-muted shrink-0" />
                                <div className="flex-1 space-y-2">
                                    <div className="h-4 bg-muted rounded w-1/3" />
                                    <div className="h-3 bg-muted rounded w-1/4" />
                                </div>
                                <div className="w-40 h-3 bg-muted rounded" />
                                <div className="w-24 h-5 bg-muted rounded mx-auto" />
                                <div className="w-20 h-5 bg-muted rounded mx-auto" />
                            </div>
                        ))
                        : activeList.length === 0
                            ? (
                                <div className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
                                    <div className="rounded-xl bg-secondary p-4">
                                        <Music size={40} className="opacity-20" />
                                    </div>
                                    <p className="text-sm">No audios found</p>
                                </div>
                            )
                            : paginatedActiveList.map((audio) => (
                                <AudioCard
                                    key={audio.id}
                                    audio={audio}
                                    onDelete={() => setConfirmDelete(audio)}
                                />
                            ))}
                </div>
            )}

            {tab !== "trash" && (
                <Pagination className="pt-2">
                    <PaginationContent>
                        <PaginationItem>
                            <PaginationPrevious
                                href="#"
                                onClick={(e) => {
                                    e.preventDefault();
                                    setPage((current) => Math.max(1, current - 1));
                                }}
                                className={page === 1 ? "pointer-events-none opacity-50" : ""}
                            />
                        </PaginationItem>

                        {pageItems.map((value, index) => (
                            <PaginationItem key={value === "ellipsis" ? `ellipsis-${index}` : value}>
                                {value === "ellipsis" ? (
                                    <PaginationEllipsis />
                                ) : (
                                    <PaginationLink
                                        href="#"
                                        isActive={page === value}
                                        onClick={(e) => {
                                            e.preventDefault();
                                            setPage(value);
                                        }}
                                    >
                                        {value}
                                    </PaginationLink>
                                )}
                            </PaginationItem>
                        ))}

                        <PaginationItem>
                            <PaginationNext
                                href="#"
                                onClick={(e) => {
                                    e.preventDefault();
                                    setPage((current) => Math.min(totalPages, current + 1));
                                }}
                                className={page === totalPages ? "pointer-events-none opacity-50" : ""}
                            />
                        </PaginationItem>
                    </PaginationContent>
                </Pagination>
            )}

            {tab === "trash" && (
                <div className="space-y-2">
                    {loading ? Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-4 px-4 py-3 rounded-xl border border-border bg-card animate-pulse">
                            <div className="w-12 h-12 rounded-lg bg-muted shrink-0" />
                            <div className="flex-1 space-y-2">
                                <div className="h-4 bg-muted rounded w-1/3" />
                                <div className="h-3 bg-muted rounded w-1/4" />
                            </div>
                            <div className="h-5 bg-muted rounded w-16 shrink-0" />
                        </div>
                    )) : getFilteredAudios().length === 0 ? (
                        <div className="py-16 flex flex-col border border-border rounded-xl bg-background items-center gap-3 text-muted-foreground">
                            <div className="rounded-xl bg-secondary p-4">
                                <Trash2 size={40} className="opacity-20" />
                            </div>
                            <p className="text-sm">No deleted audios found</p>
                        </div>
                    ) : getFilteredAudios().map((audio) => (
                        <div key={audio.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-lg bg-muted overflow-hidden shrink-0">
                                    {audio.thumbnail_url ? <img src={audio.thumbnail_url} alt={audio.title} className="w-full h-full object-cover" /> : <Music size={16} className="m-auto text-muted-foreground/40" />}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-medium truncate">{audio.title}</p>
                                    <p className="text-xs text-muted-foreground">Moved to trash</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <button onClick={() => handleRestore(audio)} className="px-3 py-1.5 rounded-lg bg-secondary text-sm font-medium hover:bg-primary/10 hover:text-primary">Restore</button>
                                <button onClick={() => handlePermanentDelete(audio)} className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-sm font-medium hover:bg-red-500/20">Delete</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Delete confirm dialog */}
            {confirmDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 space-y-4 shadow-2xl">
                        <h2 className="text-base font-semibold text-foreground">Delete Audio</h2>
                        <p className="text-sm text-muted-foreground">
                            Are you sure you want to delete{" "}
                            <span className="font-medium text-foreground">&ldquo;{confirmDelete.title}&rdquo;</span>?
                            This action cannot be undone.
                        </p>
                        <div className="flex gap-3 justify-end pt-2">
                            <button
                                type="button"
                                onClick={() => setConfirmDelete(null)}
                                className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleDeleteConfirm}
                                className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast */}
            {toastMsg && (
                <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium ${toastMsg.ok ? "bg-card border-border text-foreground" : "bg-red-500/10 border-red-500/20 text-red-300"}`}>
                    {toastMsg.ok ? <CheckCircle2 size={14} className="text-emerald-400" /> : <AlertTriangle size={14} />}
                    {toastMsg.text}
                </div>
            )}
        </div>
    );
}
