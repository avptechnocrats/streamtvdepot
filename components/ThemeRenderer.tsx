
"use client";

import { useState, useEffect, useRef } from "react";

import { useTheme } from "@/hooks/use-theme";
import { fetchHomeVideoRows, type HomeCategoryRow } from "@/lib/services";
import { Skeleton } from "@/components/ui/skeleton";
import type { Movie } from "@/types/content";

function ContentRowSkeleton() {
    return (
        <section className="px-6 lg:px-12 space-y-4">
            {/* Row title */}
            <Skeleton className="h-6 w-44 rounded" />
            {/* Card strip */}
            <div className="flex gap-4 overflow-hidden py-2 px-1">
                {Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} className="content-card shrink-0 space-y-2">
                        {/* Poster — portrait 2:3 matching real card */}
                        <Skeleton className="w-full aspect-[2/3] rounded-lg" />
                        {/* Title line */}
                        <Skeleton className="h-3.5 w-3/4 rounded" />
                        {/* Meta line (year + rating) */}
                        <Skeleton className="h-3 w-1/2 rounded" />
                    </div>
                ))}
            </div>
        </section>
    );
}

function getMovieImage(row: HomeCategoryRow["items"][number]): string {
    return (
        row.thumbnails.video_h_thumbnail ||
        row.thumbnails.video_w_thumbnail ||
        row.thumbnails.video_banner ||
        "/images/hero-banner.jpg"
    );
}

function getMovieYear(row: HomeCategoryRow["items"][number]): string {
    const rawDate = row.publish_at || row.created_at;
    const date = new Date(rawDate);

    return Number.isNaN(date.getTime()) ? "" : date.getFullYear().toString();
}

function mapRowMovies(row: HomeCategoryRow): Movie[] {
    return row.items.map((item) => ({
        id: item.id,
        title: item.title,
        image: getMovieImage(item),
        year: getMovieYear(item),
        rating: item.rating !== null ? `★ ${item.rating.toFixed(1)}` : "",
    }));
}

export default function ThemeRenderer() {
    const { activeTheme } = useTheme();
    const {
        Banner,
        ContentRow,
        CategoryGrid,
    } = activeTheme.components;
    // Infinite scroll state
    const [rows, setRows] = useState<HomeCategoryRow[]>([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let cancelled = false;
        async function loadPage() {
            setLoading(true);
            try {
                const data = await fetchHomeVideoRows({ page });
                if (!cancelled) {
                    setRows(prev => page === 1 ? data.rows : [...prev, ...data.rows]);
                    setHasMore(data.has_more);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        loadPage();
        return () => { cancelled = true; };
    }, [page]);

    // Infinite scroll: IntersectionObserver
    const sentinelRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        if (!hasMore || loading) return;
        const sentinel = sentinelRef.current;
        if (!sentinel) return;
        const observer = new window.IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                setPage((p) => p + 1);
            }
        }, { threshold: 1 });
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [hasMore, loading]);

    return (
        <>
            <Banner />
            <div className="space-y-10 py-10">
                {rows.length === 0 && loading ? (
                    <>
                        <ContentRowSkeleton />
                        <ContentRowSkeleton />
                        <ContentRowSkeleton />
                    </>
                ) : (
                    <>
                        {rows.slice(0, 1).map((row) => (
                            <ContentRow
                                key={row.category_id}
                                title={row.category_name}
                                movies={mapRowMovies(row)}
                            />
                        ))}
                        {rows.length >= 1 && <CategoryGrid type="video" showName={false} />}
                        {rows.slice(1).map((row) => (
                            <ContentRow
                                key={row.category_id}
                                title={row.category_name}
                                movies={mapRowMovies(row)}
                            />
                        ))}
                        {/* Infinite scroll sentinel */}
                        {hasMore && (
                            <div ref={sentinelRef} style={{ height: 1 }} />
                        )}
                        {loading && (
                            <>
                                <ContentRowSkeleton />
                                <ContentRowSkeleton />
                            </>
                        )}
                    </>
                )}
            </div>
        </>
    );
}
