"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Plus, Search, LayoutList, AlertTriangle, CheckCircle2, GripVertical, Grid3X3, Video, Music, Zap, Layers, Grid, RefreshCw } from "lucide-react";
import { listCategories, reorderCategories, deleteCategory, type CategoryOut, CATEGORY_CONTENT_TYPES } from "@/lib/api";
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
import { CategoryCard } from "./_components/CategoryCard";
import { CategoryRowSkeleton } from "./_components/Skeletons";
import { DeleteCategoryConfirm } from "./_components/DeleteCategoryConfirm";

type ContentTypeFilter = "all" | "video" | "audio" | "livestream" | "series" | "channel";

const PAGE_SIZE = 10;

const FILTER_TABS: { key: ContentTypeFilter; label: string }[] = [
    { key: "all", label: "All" },
    ...CATEGORY_CONTENT_TYPES.map((ct) => ({ key: ct.value as ContentTypeFilter, label: ct.label })),
];

function getContentTypeIcon(type: ContentTypeFilter): React.ElementType {
    const iconMap: Record<ContentTypeFilter, React.ElementType> = {
        all: Grid3X3,
        video: Video,
        audio: Music,
        livestream: Zap,
        series: Layers,
        channel: Grid,
    };
    return iconMap[type] || Grid3X3;
}

export default function CategoriesPage() {
    const [categories, setCategories] = useState<CategoryOut[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [contentTypeFilter, setContentTypeFilter] = useState<ContentTypeFilter>("video");
    const [confirmDelete, setConfirmDelete] = useState<CategoryOut | null>(null);
    const [toastMsg, setToastMsg] = useState<{ text: string; ok: boolean } | null>(null);
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    function toast(text: string, ok = true) {
        setToastMsg({ text, ok });
        setTimeout(() => setToastMsg(null), 3000);
    }

    // Debounce search input
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => setDebouncedSearch(search), 350);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [search]);

    // Reset to page 1 whenever the filter changes
    useEffect(() => {
        setPage(1);
    }, [debouncedSearch, contentTypeFilter]);

    const fetchCategories = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params: { page: number; page_size: number; search?: string; content_type?: string } = { page, page_size: PAGE_SIZE };
            if (debouncedSearch) params.search = debouncedSearch;
            if (contentTypeFilter !== "all") params.content_type = contentTypeFilter;
            const result = await listCategories(params);
            setCategories(result.items);
            setTotal(result.total);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to load categories");
        } finally {
            setLoading(false);
        }
    }, [page, debouncedSearch, contentTypeFilter]);

    useEffect(() => {
        fetchCategories();
    }, [fetchCategories]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    const handleDeleteConfirm = async () => {
        if (!confirmDelete) return;
        try {
            await deleteCategory(confirmDelete.id);
            toast(`"${confirmDelete.name}" deleted`);
            fetchCategories();
        } catch {
            toast("Failed to delete category", false);
        } finally {
            setConfirmDelete(null);
        }
    };

    // Drag-drop: enabled only for a single-page result set (reordering can't span pages), viewing a specific content type, with no active search
    const canDrag = contentTypeFilter !== "all" && !debouncedSearch && totalPages <= 1;

    const handleDrop = async (dropIndex: number) => {
        if (dragIndex === null || dragIndex === dropIndex) {
            setDragIndex(null);
            setDragOverIndex(null);
            return;
        }
        const updated = [...categories];
        const [moved] = updated.splice(dragIndex, 1);
        updated.splice(dropIndex, 0, moved);
        const reordered = updated.map((cat, i) => ({ ...cat, sort_order: i * 10 }));
        setCategories(reordered);
        setDragIndex(null);
        setDragOverIndex(null);
        try {
            await reorderCategories(reordered.map((c) => ({ id: c.id, sort_order: c.sort_order })));
        } catch {
            toast("Failed to save order", false);
            fetchCategories();
        }
    };

    return (
        <div className="p-6 space-y-6">

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold text-foreground">Categories</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Organise your content into browsable categories
                    </p>
                </div>
                <Link
                    href="/admin/content/categories/new"
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition-all"
                >
                    <Plus size={15} /> New Category
                </Link>
            </div>

            {/* Search + filter tabs */}
            <div className="flex items-center justify-between gap-3">
                {/* Content type filter tabs */}
                <div className="flex gap-1 p-1 rounded-xl bg-surface-hover/50 border border-border w-fit flex-wrap">
                    {FILTER_TABS.map(({ key, label }) => {
                        const Icon = getContentTypeIcon(key);
                        return (
                            <button
                                key={key}
                                onClick={() => setContentTypeFilter(key)}
                                className={`flex items-center gap-2 px-3 py-0.5 rounded-lg text-sm font-medium transition-colors ${
                                    contentTypeFilter === key
                                        ? "bg-card text-foreground shadow-sm border border-border/50"
                                        : "text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                <Icon size={14} />
                                {label}
                            </button>
                        );
                    })}
                </div>

                <div className="flex items-center gap-2">
                    <div className="relative max-w-sm w-full">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search categories…"
                            className="w-full h-9 rounded-xl bg-secondary border border-border pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                        />
                    </div>
                    <button
                        onClick={() => fetchCategories()}
                        disabled={loading}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-secondary text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-50"
                        title="Refresh"
                    >
                        <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
                        Refresh
                    </button>
                </div>
            </div>

            {canDrag && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <GripVertical size={12} className="opacity-60" />
                    Drag rows to reorder — changes save automatically
                </p>
            )}

            {/* Error */}
            {error && (
                <div className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm text-red-300 border border-red-500/20 bg-red-500/8">
                    <AlertTriangle size={14} /> {error}
                </div>
            )}

            {/* List */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
                {/* Header row */}
                <div className="flex items-center gap-4 px-4 py-2.5 border-b border-border bg-muted/30">
                    {canDrag && <div className="w-5 shrink-0" />}
                    <div className="w-10 shrink-0" />
                    <p className="flex-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Name</p>
                    <p className="hidden sm:block w-28 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Slug</p>
                    <p className="hidden sm:block w-48 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Content Type</p>
                    <p className="hidden sm:block w-16 text-[11px] text-center font-semibold uppercase tracking-widest text-muted-foreground">Level</p>
                    {!canDrag && <p className="hidden md:block w-10 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground text-center">Sort</p>}
                    <div className="w-24 shrink-0" />
                </div>

                {loading ? (
                    Array.from({ length: 6 }).map((_, i) => <CategoryRowSkeleton key={i} />)
                ) : categories.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                        <LayoutList size={32} className="opacity-30" />
                        <p className="text-sm">
                            {search || contentTypeFilter !== "all"
                                ? "No categories match your filter"
                                : "No categories yet"}
                        </p>
                        {!search && contentTypeFilter === "all" && (
                            <Link
                                href="/admin/content/categories/new"
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border hover:border-primary/40 transition-colors"
                            >
                                <Plus size={13} /> Create first category
                            </Link>
                        )}
                    </div>
                ) : (
                    categories.map((cat, index) => (
                        <CategoryCard
                            key={cat.id}
                            category={cat}
                            onDelete={() => setConfirmDelete(cat)}
                            canDrag={canDrag}
                            isDragging={dragIndex === index}
                            isDragOver={dragOverIndex === index}
                            onDragStart={() => setDragIndex(index)}
                            onDragOver={() => setDragOverIndex(index)}
                            onDrop={() => handleDrop(index)}
                            onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                        />
                    ))
                )}
            </div>

            {!loading && total > 0 && (
                <div className="flex items-center justify-between gap-3">
                    <p className="w-full text-xs text-muted-foreground">
                        Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
                        {search && ` matching "${search}"`}
                        {contentTypeFilter !== "all" && ` in "${contentTypeFilter}"`}
                    </p>
                    {totalPages > 1 && (
                        <Pagination>
                            <PaginationContent>
                                <PaginationItem>
                                    <PaginationPrevious
                                        href="#"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            if (page > 1) setPage((p) => p - 1);
                                        }}
                                        aria-disabled={page <= 1}
                                        className={page <= 1 ? "pointer-events-none opacity-50" : ""}
                                    />
                                </PaginationItem>
                                {getPaginationItems(page, totalPages, 1).map((p, index) =>
                                    p === "ellipsis" ? (
                                        <PaginationItem key={`ellipsis-${index}`}>
                                            <PaginationEllipsis className="h-9 w-9" />
                                        </PaginationItem>
                                    ) : (
                                        <PaginationItem key={p}>
                                            <PaginationLink
                                                href="#"
                                                isActive={p === page}
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    setPage(p);
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
                                            if (page < totalPages) setPage((p) => p + 1);
                                        }}
                                        aria-disabled={page >= totalPages}
                                        className={page >= totalPages ? "pointer-events-none opacity-50" : ""}
                                    />
                                </PaginationItem>
                            </PaginationContent>
                        </Pagination>
                    )}
                </div>
            )}

            {/* Delete confirm */}
            {confirmDelete && (
                <DeleteCategoryConfirm
                    category={confirmDelete}
                    onCancel={() => setConfirmDelete(null)}
                    onConfirm={handleDeleteConfirm}
                />
            )}

            {/* Toast */}
            {toastMsg && (
                <div
                    className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all ${
                        toastMsg.ok
                            ? "bg-card border-border text-foreground"
                            : "bg-red-500/10 border-red-500/20 text-red-300"
                    }`}
                >
                    {toastMsg.ok ? (
                        <CheckCircle2 size={15} className="text-primary" />
                    ) : (
                        <AlertTriangle size={15} />
                    )}
                    {toastMsg.text}
                </div>
            )}
        </div>
    );
}
