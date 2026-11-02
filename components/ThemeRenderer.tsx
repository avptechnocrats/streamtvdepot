
"use client";

import { useState, useEffect, useRef } from "react";

import { useTheme } from "@/hooks/use-theme";
import { fetchHomeVideoRows, type HomeCategoryRow } from "@/lib/services";
import ContentRowSkeleton from "@/components/ContentRowSkeleton";
import ManagedBannerSlot from "@/components/ManagedBannerSlot";
import LiveTvLogoRow from "@/components/LiveTvLogoRow";
import TopTenRow from "@/components/TopTenRow";
import type { Movie } from "@/types/content";

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
        categories: item.categories?.length ? item.categories : [row.category_name],
        ageRating: item.age_rating,
        duration: item.duration,
        classification: item.content_classification,
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
    const contentArea = useRef<HTMLDivElement>(null);
    const [minimumRowCount, setMinimumRowCount] = useState<number | null>(null);

    useEffect(() => {
        const area = contentArea.current;
        if (!area) return;
        function measureRow() {
            const viewport = window.innerWidth;
            const style = getComputedStyle(area!);
            const rowPadding = viewport >= 1024 ? (activeTheme.id === "ember" ? 112 : 80) : viewport >= 640 ? 48 : 32;
            const posterWidth = viewport >= 1024 ? 208 : viewport >= 640 ? 192 : 176;
            const gap = viewport >= 640 ? 24 : 20;
            const available = area!.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - rowPadding;
            setMinimumRowCount(Math.max(1, Math.ceil((available + gap) / (posterWidth + gap))));
        }
        measureRow();
        const observer = new ResizeObserver(measureRow);
        observer.observe(area);
        window.addEventListener("resize", measureRow);
        return () => { observer.disconnect(); window.removeEventListener("resize", measureRow); };
    }, [activeTheme.id]);
    const visibleRows = minimumRowCount === null ? [] : rows.filter(row => row.items.length >= minimumRowCount);

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
            } catch {
                if (!cancelled) {
                    setRows([]);
                    setHasMore(false);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        if (page > 1 && !hasMore) return;
        loadPage();
        return () => { cancelled = true; };
    }, [page, hasMore]);

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
            <LiveTvLogoRow />
            <TopTenRow />
            <ManagedBannerSlot page="/" position="top" />
            <div ref={contentArea} className={`space-y-10 py-10 ${activeTheme.id === "ember" ? "" : "lg:px-8"}`}>
                {rows.length === 0 && loading ? (
                    <>
                        <ContentRowSkeleton />
                        <ContentRowSkeleton />
                        <ContentRowSkeleton />
                    </>
                ) : (
                    <>
                        {visibleRows.slice(0, 1).map((row) => (
                            <ContentRow
                                key={row.category_id}
                                title={row.category_name}
                                movies={mapRowMovies(row)}
                                href={`/categories/${row.category_slug}`}
                            />
                        ))}
                        {rows.length >= 1 && <CategoryGrid type="video" showName={false} />}
                        <ManagedBannerSlot page="/" position="middle_1" />
                        {visibleRows.slice(1, 3).map((row) => (
                            <ContentRow
                                key={row.category_id}
                                title={row.category_name}
                                movies={mapRowMovies(row)}
                                href={`/categories/${row.category_slug}`}
                            />
                        ))}
                        <ManagedBannerSlot page="/" position="middle_2" />
                        {visibleRows.slice(3).map((row) => (
                            <ContentRow key={row.category_id} title={row.category_name} movies={mapRowMovies(row)} href={`/categories/${row.category_slug}`} />
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
            <ManagedBannerSlot page="/" position="bottom" />
        </>
    );
}
