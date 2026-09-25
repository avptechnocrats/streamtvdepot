"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
    Plus,
    Search,
    FileStack,
    Eye,
    EyeOff,
    Pencil,
    Trash2,
    AlertTriangle,
    CheckCircle2,
    Globe,
    FileText,
    Grid,
} from "lucide-react";
import { listPages, deletePage, updatePage, type PageOut, type PageStatus } from "@/lib/api";

type StatusFilter = "all" | PageStatus;

const STATUS_TABS: { key: StatusFilter; label: string; icon: React.ElementType }[] = [
    { key: "all", label: "All", icon: Grid },
    { key: "published", label: "Published", icon: Globe },
    { key: "draft", label: "Draft", icon: FileText },
];

function statusBadge(status: PageStatus) {
    if (status === "published")
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400">
                <Globe className="h-3 w-3" />
                Published
            </span>
        );
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground">
            <FileText className="h-3 w-3" />
            Draft
        </span>
    );
}

// ─── Delete confirm dialog ─────────────────────────────────────────────────────

function DeleteConfirm({
    page,
    onConfirm,
    onCancel,
    busy,
}: {
    page: PageOut;
    onConfirm: () => void;
    onCancel: () => void;
    busy: boolean;
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
                <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-red-500/10 p-2 shrink-0">
                        <AlertTriangle className="h-5 w-5 text-red-400" />
                    </div>
                    <div>
                        <p className="font-semibold text-foreground">Delete page?</p>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            <span className="font-medium text-foreground">&ldquo;{page.title}&rdquo;</span> will be permanently deleted.
                        </p>
                    </div>
                </div>
                <div className="flex gap-2 justify-end">
                    <button
                        onClick={onCancel}
                        disabled={busy}
                        className="px-4 h-8 rounded-lg text-sm font-medium border border-border hover:bg-secondary transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={busy}
                        className="px-4 h-8 rounded-lg text-sm font-medium bg-red-500 hover:bg-red-600 text-white transition-colors disabled:opacity-50"
                    >
                        {busy ? "Deleting…" : "Delete"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Page row ─────────────────────────────────────────────────────────────────

function PageRow({
    page,
    onDelete,
    onToggleStatus,
}: {
    page: PageOut;
    onDelete: (p: PageOut) => void;
    onToggleStatus: (p: PageOut) => void;
}) {
    return (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-card hover:bg-secondary/30 transition-colors group">
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground truncate">{page.title}</span>
                    {statusBadge(page.status)}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground flex-wrap">
                    <span className="font-mono">/{page.slug}</span>
                    {page.short_description && (
                        <span className="truncate max-w-xs">{page.short_description}</span>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                    onClick={() => onToggleStatus(page)}
                    title={page.status === "published" ? "Unpublish" : "Publish"}
                    className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                >
                    {page.status === "published"
                        ? <EyeOff className="h-3.5 w-3.5" />
                        : <Eye className="h-3.5 w-3.5" />
                    }
                </button>
                <Link
                    href={`/admin/pages/${page.id}`}
                    className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                    title="Edit"
                >
                    <Pencil className="h-3.5 w-3.5" />
                </Link>
                <button
                    onClick={() => onDelete(page)}
                    title="Delete"
                    className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-red-500/10 transition-colors text-muted-foreground hover:text-red-400"
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </button>
            </div>
        </div>
    );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function RowSkeleton() {
    return (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-card animate-pulse">
            <div className="flex-1 space-y-2">
                <div className="h-4 w-1/3 rounded bg-secondary" />
                <div className="h-3 w-1/4 rounded bg-secondary" />
            </div>
        </div>
    );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PagesPage() {
    const [pages, setPages] = useState<PageOut[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [confirmDelete, setConfirmDelete] = useState<PageOut | null>(null);
    const [deleteBusy, setDeleteBusy] = useState(false);
    const [toastMsg, setToastMsg] = useState<{ text: string; ok: boolean } | null>(null);

    function toast(text: string, ok = true) {
        setToastMsg({ text, ok });
        setTimeout(() => setToastMsg(null), 3500);
    }

    const fetchPages = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params: { page_size: number; search?: string; status?: PageStatus } = { page_size: 100 };
            if (search.trim()) params.search = search.trim();
            if (statusFilter !== "all") params.status = statusFilter;
            setPages(await listPages(params));
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to load pages");
        } finally {
            setLoading(false);
        }
    }, [search, statusFilter]);

    useEffect(() => {
        const t = setTimeout(fetchPages, 300);
        return () => clearTimeout(t);
    }, [fetchPages]);

    const handleDeleteConfirm = async () => {
        if (!confirmDelete) return;
        setDeleteBusy(true);
        try {
            await deletePage(confirmDelete.id);
            setPages((prev) => prev.filter((p) => p.id !== confirmDelete.id));
            toast(`"${confirmDelete.title}" deleted`);
        } catch {
            toast("Failed to delete page", false);
        } finally {
            setDeleteBusy(false);
            setConfirmDelete(null);
        }
    };

    const handleToggleStatus = async (page: PageOut) => {
        const newStatus: PageStatus = page.status === "published" ? "draft" : "published";
        try {
            const updated = await updatePage(page.id, { status: newStatus });
            setPages((prev) => prev.map((p) => (p.id === page.id ? updated : p)));
            toast(`"${page.title}" ${newStatus === "published" ? "published" : "moved to draft"}`);
        } catch {
            toast("Failed to update status", false);
        }
    };

    const filtered = pages.filter((p) => {
        if (statusFilter !== "all" && p.status !== statusFilter) return false;
        if (search.trim()) {
            const q = search.toLowerCase();
            return p.title.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q);
        }
        return true;
    });

    function countFor(key: StatusFilter) {
        if (key === "all") return pages.length;
        return pages.filter((p) => p.status === key).length;
    }

    return (
        <div className="p-6 space-y-6">

            {/* Header */}
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-foreground">Pages</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Manage static pages like Privacy Policy, Terms &amp; Conditions, FAQ, etc.
                    </p>
                </div>
                <Link
                    href="/admin/pages/new"
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors shrink-0"
                >
                    <Plus className="h-3.5 w-3.5" />
                    New Page
                </Link>
            </div>

            {/* Filters row */}
            <div className="flex flex-wrap items-center gap-3">
                {/* Status tabs */}
                <div className="flex gap-1 p-1 rounded-xl bg-surface-hover/50 border border-border w-fit">
                    {STATUS_TABS.map(({ key, label, icon: Icon }) => (
                        <button
                            key={key}
                            onClick={() => setStatusFilter(key)}
                            className={`flex items-center gap-2 px-3 py-0.5 rounded-lg text-sm font-medium transition-colors ${
                                statusFilter === key
                                    ? "bg-card text-foreground shadow-sm border border-border/50"
                                    : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            <Icon size={14} />
                            {label}
                            <span className="text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                                {countFor(key)}
                            </span>
                        </button>
                    ))}
                </div>

                {/* Search */}
                <div className="relative flex-1 min-w-[200px] max-w-xs">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search pages…"
                        className="w-full h-10 pl-8 pr-3 rounded-xl bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {error}
                </div>
            )}

            {/* List */}
            <div className="space-y-2">
                {loading ? (
                    Array.from({ length: 5 }).map((_, i) => <RowSkeleton key={i} />)
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col border border-border rounded-xl bg-white items-center justify-center py-16 text-center space-y-3">
                        <div className="rounded-xl bg-secondary p-4">
                            <FileStack className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <p className="text-sm font-medium text-foreground">No pages yet</p>
                        <p className="text-xs text-muted-foreground max-w-xs">
                            Create your first static page — Privacy Policy, Terms &amp; Conditions, FAQ, About Us…
                        </p>
                        <Link
                            href="/admin/pages/new"
                            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
                        >
                            <Plus className="h-3.5 w-3.5" />
                            New Page
                        </Link>
                    </div>
                ) : (
                    filtered.map((p) => (
                        <PageRow
                            key={p.id}
                            page={p}
                            onDelete={setConfirmDelete}
                            onToggleStatus={handleToggleStatus}
                        />
                    ))
                )}
            </div>

            {/* Delete confirm */}
            {confirmDelete && (
                <DeleteConfirm
                    page={confirmDelete}
                    onConfirm={handleDeleteConfirm}
                    onCancel={() => setConfirmDelete(null)}
                    busy={deleteBusy}
                />
            )}

            {/* Toast */}
            {toastMsg && (
                <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium border transition-all ${toastMsg.ok
                        ? "bg-card border-emerald-500/20 text-foreground"
                        : "bg-card border-red-500/20 text-foreground"
                    }`}>
                    {toastMsg.ok
                        ? <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                        : <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                    }
                    {toastMsg.text}
                </div>
            )}
        </div>
    );
}
