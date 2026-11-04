
"use client";

import { useState, useEffect, useRef } from "react";

import { useTheme } from "@/hooks/use-theme";
import { fetchHomeVideoRows, type HomeCategoryRow } from "@/lib/services";
import ContentRowSkeleton from "@/components/ContentRowSkeleton";
import ManagedBannerSlot from "@/components/ManagedBannerSlot";
import LiveTvLogoRow from "@/components/LiveTvLogoRow";
import TopTenRow from "@/components/TopTenRow";
import NewReleasesRow from "@/components/NewReleasesRow";
import FeaturedRow from "@/components/FeaturedRow";
import type { Movie } from "@/types/content";

function getMovieImage(row: HomeCategoryRow["items"][number], landscape: boolean): string {
    return (
        (landscape ? row.thumbnails.video_w_thumbnail : row.thumbnails.video_h_thumbnail) ||
        row.thumbnails.video_banner ||
        row.thumbnails.video_h_thumbnail ||
        row.thumbnails.video_w_thumbnail ||
        "/images/hero-banner.jpg"
    );
}

function getMovieYear(row: HomeCategoryRow["items"][number]): string {
    const rawDate = row.publish_at || row.created_at;
    const date = new Date(rawDate);

    return Number.isNaN(date.getTime()) ? "" : date.getFullYear().toString();
}

function getRowVariant(view: HomeCategoryRow["thumbnail_view"]): "featured" | "landscape" | "wider-landscape" {
    if (view === "portrait") return "featured";
    if (view === "wider_landscape") return "wider-landscape";
    return "landscape";
}

function mapRowMovies(row: HomeCategoryRow): Movie[] {
    return row.items.map((item) => ({
        id: item.id,
        title: item.title,
        image: getMovieImage(item, row.thumbnail_view !== "portrait"),
        year: getMovieYear(item),
        rating: item.rating !== null ? `★ ${item.rating.toFixed(1)}` : "",
        categories: item.categories?.length ? item.categories : [row.category_name],
        ageRating: item.age_rating,
        duration: item.duration,
        classification: item.content_classification,
        previewImage: item.thumbnails.video_banner || item.thumbnails.video_w_thumbnail || getMovieImage(item, true),
        videoUrl: item.video_display_url,
        hlsUrl: item.hls_display_url || item.hls_url,
        trailerUrl: item.trailer_display_url,
        trailerHlsUrl: item.trailer_hls_url,
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
                    const categoryRows = data.rows.map(row => {
                        const items = [...row.items];
                        for (let index = items.length - 1; index > 0; index--) {
                            const randomIndex = Math.floor(Math.random() * (index + 1));
                            [items[index], items[randomIndex]] = [items[randomIndex], items[index]];
                        }
                        return { ...row, items };
                    });
                    setRows(prev => page === 1 ? categoryRows : [...prev, ...categoryRows]);
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
            <NewReleasesRow />
            <FeaturedRow />
            <ManagedBannerSlot page="/" position="top" />
            <div className={`space-y-10 py-10 ${activeTheme.id === "ember" ? "" : "lg:px-8"}`}>
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
                                href={`/categories/${row.category_slug}`}
                                variant={getRowVariant(row.thumbnail_view)}
                            />
                        ))}
                        {rows.length >= 1 && <CategoryGrid type="video" showName={false} />}
                        <ManagedBannerSlot page="/" position="middle_1" />
                        {rows.slice(1, 3).map((row) => (
                            <ContentRow
                                key={row.category_id}
                                title={row.category_name}
                                movies={mapRowMovies(row)}
                                href={`/categories/${row.category_slug}`}
                                variant={getRowVariant(row.thumbnail_view)}
                            />
                        ))}
                        <ManagedBannerSlot page="/" position="middle_2" />
                        {rows.slice(3).map((row) => (
                            <ContentRow key={row.category_id} title={row.category_name} movies={mapRowMovies(row)} href={`/categories/${row.category_slug}`} variant={getRowVariant(row.thumbnail_view)} />
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
