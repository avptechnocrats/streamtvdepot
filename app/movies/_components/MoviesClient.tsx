"use client";

import { useState, useEffect, useRef } from "react";
import { Film } from "lucide-react";

import { useTheme } from "@/hooks/use-theme";
import { fetchHomeVideoRows, type HomeCategoryRow, type HomeVideoItem } from "@/lib/services";
import ContentRowSkeleton from "@/components/ContentRowSkeleton";
import ManagedBannerSlot from "@/components/ManagedBannerSlot";
import TopTenRow from "@/components/TopTenRow";
import NewReleasesRow from "@/components/NewReleasesRow";
import FeaturedRow from "@/components/FeaturedRow";
import type { Movie } from "@/types/content";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getItemImage(item: HomeVideoItem): string {
    return (
        item.thumbnails.video_h_thumbnail ||
        item.thumbnails.video_w_thumbnail ||
        item.thumbnails.video_banner ||
        "/images/hero-banner.jpg"
    );
}

function getItemYear(item: HomeVideoItem): string {
    const rawDate = item.publish_at || item.created_at;
    const date = new Date(rawDate);
    return Number.isNaN(date.getTime()) ? "" : date.getFullYear().toString();
}

function getRowVariant(view: HomeCategoryRow["thumbnail_view"]): "featured" | "landscape" | "wider-landscape" {
    if (view === "portrait") return "featured";
    if (view === "wider_landscape") return "wider-landscape";
    return "landscape";
}

function mapMovie(item: HomeVideoItem, landscape = false, categories = item.categories ?? []): Movie {
    return {
        id: item.id,
        title: item.title,
        image: landscape ? item.thumbnails.video_w_thumbnail || item.thumbnails.video_banner || getItemImage(item) : getItemImage(item),
        year: getItemYear(item),
        rating: item.rating != null ? `★ ${item.rating.toFixed(1)}` : "",
        categories,
        ageRating: item.age_rating,
        duration: item.duration,
        classification: item.content_classification,
        previewImage: item.thumbnails.video_banner || item.thumbnails.video_w_thumbnail || getItemImage(item),
        videoUrl: item.video_display_url,
        hlsUrl: item.hls_display_url || item.hls_url,
        trailerUrl: item.trailer_display_url,
        trailerHlsUrl: item.trailer_hls_url,
    };
}

function mapRowToMovies(row: HomeCategoryRow): Movie[] {
    return row.items.map(item => mapMovie(item, row.thumbnail_view !== "portrait", item.categories?.length ? item.categories : [row.category_name]));
}

// ─── Skeletons ────────────────────────────────────────────────────────────────

// ─── Main component ───────────────────────────────────────────────────────────

export default function MoviesClient({ contentClassification = "Movie", pageTitle = "Movies" }: { contentClassification?: string; pageTitle?: string }) {
    const { activeTheme } = useTheme();
    const { Banner, ContentRow } = activeTheme.components;

    const [rows, setRows] = useState<HomeCategoryRow[]>([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [loading, setLoading] = useState(false);
    useEffect(() => {
        let cancelled = false;
        async function loadPage() {
            setLoading(true);
            try {
                const data = await fetchHomeVideoRows({ page, contentType: "video", contentClassification });
                if (!cancelled) {
                    const movieRows = data.rows.filter(row => row.content_type === "video").map(row => {
                        const items = row.items.filter(item => item.content_classification === contentClassification);
                        for (let index = items.length - 1; index > 0; index--) {
                            const randomIndex = Math.floor(Math.random() * (index + 1));
                            [items[index], items[randomIndex]] = [items[randomIndex], items[index]];
                        }
                        return { ...row, items };
                    }).filter(row => row.items.length > 0);
                    setRows((prev) => (page === 1 ? movieRows : [...prev, ...movieRows]));
                    setHasMore(data.has_more);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        loadPage();
        return () => { cancelled = true; };
    }, [page, contentClassification]);

    // Infinite scroll sentinel
    const sentinelRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        if (!hasMore || loading) return;
        const sentinel = sentinelRef.current;
        if (!sentinel) return;
        const observer = new window.IntersectionObserver(
            (entries) => { if (entries[0].isIntersecting) setPage((p) => p + 1); },
            { threshold: 1 }
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [hasMore, loading]);

    const isInitialLoad = rows.length === 0 && loading;

    return (
        <>
            {/* Hero Banner */}
            <Banner />
            <TopTenRow contentClassification={contentClassification} title={pageTitle === "Sports" ? "Top Rated Sports" : "Top 10 Movies of the Month"} />
            <NewReleasesRow contentClassification={contentClassification} />
            <FeaturedRow contentClassification={contentClassification} />
            {pageTitle === "Movies" && <ManagedBannerSlot page="/movies" position="top" />}

            {/* Content rows */}
            <div className={`space-y-10 py-10 ${activeTheme.id === "ember" ? "" : "lg:px-8"}`}>
                {isInitialLoad ? (
                    <>
                        <ContentRowSkeleton variant="landscape" />
                        <ContentRowSkeleton variant="landscape" />
                        <ContentRowSkeleton variant="landscape" />
                    </>
                ) : rows.length === 0 ? (
                    <>
                    <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-4 px-6">
                        <Film size={56} className="opacity-30" />
                        <p className="text-lg font-medium">No {pageTitle.toLowerCase()} available yet</p>
                        <p className="text-sm opacity-70">Check back soon for new content.</p>
                    </div>
                    {pageTitle === "Movies" && <ManagedBannerSlot page="/movies" position="middle_1" />}
                    {pageTitle === "Movies" && <ManagedBannerSlot page="/movies" position="middle_2" />}
                    </>
                ) : (
                    <>
                        {rows.slice(0, 1).map((row) => (
                            <ContentRow
                                key={row.category_id}
                                title={row.category_name}
                                movies={mapRowToMovies(row)}
                                variant={getRowVariant(row.thumbnail_view)}
                            />
                        ))}
                        {pageTitle === "Movies" && <ManagedBannerSlot page="/movies" position="middle_1" />}
                        {rows.slice(1, 3).map((row) => <ContentRow key={row.category_id} title={row.category_name} movies={mapRowToMovies(row)} variant={getRowVariant(row.thumbnail_view)} />)}
                        {pageTitle === "Movies" && <ManagedBannerSlot page="/movies" position="middle_2" />}
                        {rows.slice(3).map((row) => <ContentRow key={row.category_id} title={row.category_name} movies={mapRowToMovies(row)} variant={getRowVariant(row.thumbnail_view)} />)}
                        {loading && (
                            <>
                                <ContentRowSkeleton variant="landscape" />
                                <ContentRowSkeleton variant="landscape" />
                            </>
                        )}
                    </>
                )}
            </div>
            {hasMore && !isInitialLoad && <div ref={sentinelRef} style={{ height: 1 }} />}
            {pageTitle === "Movies" && <ManagedBannerSlot page="/movies" position="bottom" />}
        </>
    );
}
