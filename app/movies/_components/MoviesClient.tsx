"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { Play, Plus, Info, ChevronLeft, ChevronRight, Film } from "lucide-react";

import { useTheme } from "@/hooks/use-theme";
import { fetchHomeVideoRows, type HomeCategoryRow, type HomeVideoItem } from "@/lib/services";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BannerSkeleton } from "@/components/BannerSkeleton";
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

function getBannerImage(item: HomeVideoItem): string {
    return (
        item.thumbnails.video_banner ||
        item.thumbnails.video_h_thumbnail ||
        item.thumbnails.video_w_thumbnail ||
        "/images/hero-banner.jpg"
    );
}

function getItemYear(item: HomeVideoItem): string {
    const rawDate = item.publish_at || item.created_at;
    const date = new Date(rawDate);
    return Number.isNaN(date.getTime()) ? "" : date.getFullYear().toString();
}

function mapRowToMovies(row: HomeCategoryRow): Movie[] {
    return row.items.map((item) => ({
        id: item.id,
        title: item.title,
        image: getItemImage(item),
        year: getItemYear(item),
        rating: item.rating != null ? `★ ${item.rating.toFixed(1)}` : "",
    }));
}

function splitTitle(title: string): [string, string] {
    const words = title.trim().split(/\s+/);
    if (words.length === 1) return [title, ""];
    const last = words.pop()!;
    return [words.join(" "), last];
}

// ─── Hero Banner ──────────────────────────────────────────────────────────────

function HeroBanner({ rows }: { rows: HomeCategoryRow[] }) {
    const featured = rows
        .flatMap((r) => r.items)
        .find((item) => item.thumbnails.video_banner || item.thumbnails.video_h_thumbnail);
    const items = rows.flatMap((r) => r.items).slice(0, 8);

    const [currentIdx, setCurrentIdx] = useState(0);
    const [transitioning, setTransitioning] = useState(false);

    const goTo = useCallback(
        (idx: number) => {
            if (transitioning || idx === currentIdx) return;
            setTransitioning(true);
            setTimeout(() => {
                setCurrentIdx(idx);
                setTransitioning(false);
            }, 300);
        },
        [transitioning, currentIdx]
    );

    const prev = () => goTo((currentIdx - 1 + items.length) % items.length);
    const next = useCallback(
        () => goTo((currentIdx + 1) % items.length),
        [currentIdx, goTo, items.length]
    );

    useEffect(() => {
        if (items.length <= 1) return;
        const t = setTimeout(next, 7000);
        return () => clearTimeout(t);
    }, [currentIdx, next, items.length]);

    if (!featured || items.length === 0) return null;

    const slide = items[currentIdx];
    const [titleA, titleB] = splitTitle(slide.title);

    return (
        <section className="relative w-full h-[85vh] min-h-[500px] overflow-hidden">
            {/* Slide images */}
            {items.map((item, i) => (
                <img
                    key={item.id}
                    src={getBannerImage(item)}
                    alt={item.title}
                    className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${i === currentIdx ? "opacity-100" : "opacity-0"}`}
                    width={1920}
                    height={800}
                />
            ))}

            <div className="banner-overlay absolute inset-0" />
            <div className="banner-bottom-fade absolute inset-0 pointer-events-none" />

            {/* Content */}
            <div
                className={`absolute bottom-0 left-0 right-0 px-6 lg:px-12 pb-20 space-y-5 transition-opacity duration-300 ${transitioning ? "opacity-0" : "opacity-100"}`}
            >
                <span className="inline-block px-3 py-1 text-xs font-semibold tracking-wider uppercase bg-primary/20 text-primary border border-primary/30 rounded-full">
                    🎬 Movie
                </span>
                <h2 className="text-4xl md:text-6xl lg:text-7xl font-display font-800 leading-tight max-w-2xl text-white">
                    {titleA}
                    {titleB && (
                        <>
                            {" "}
                            <span className="text-gradient-gold">{titleB}</span>
                        </>
                    )}
                </h2>
                <div className="flex items-center gap-3">
                    <Button
                        asChild
                        className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold px-6 py-3 h-auto text-base gap-2"
                    >
                        <Link href={`/movies/${slide.id}`}>
                            <Play size={18} fill="currentColor" /> Watch Now
                        </Link>
                    </Button>
                    <Button
                        variant="outline"
                        className="bg-transparent border-white/40 text-white hover:bg-white/10 font-medium px-5 py-3 h-auto text-base gap-2"
                    >
                        <Plus size={18} /> My List
                    </Button>
                    <Button variant="ghost" className="text-white/70 hover:text-white hover:bg-white/10 p-3 h-auto">
                        <Info size={18} />
                    </Button>
                </div>
                <div className="flex items-center gap-2 text-xs text-white/70">
                    {getItemYear(slide) && <span>{getItemYear(slide)}</span>}
                    {slide.rating != null && (
                        <span className="px-1.5 py-0.5 border border-white/40 rounded text-[10px]">
                            ★ {slide.rating.toFixed(1)}
                        </span>
                    )}
                </div>
            </div>

            {/* Arrows */}
            {items.length > 1 && (
                <>
                    <button
                        onClick={prev}
                        className="absolute left-4 lg:left-8 top-1/2 -translate-y-1/2 z-10 p-2.5 rounded-full bg-background/40 backdrop-blur-sm border border-border/50 text-foreground hover:bg-background/70 transition-colors"
                        aria-label="Previous"
                    >
                        <ChevronLeft size={22} />
                    </button>
                    <button
                        onClick={next}
                        className="absolute right-4 lg:right-8 top-1/2 -translate-y-1/2 z-10 p-2.5 rounded-full bg-background/40 backdrop-blur-sm border border-border/50 text-foreground hover:bg-background/70 transition-colors"
                        aria-label="Next"
                    >
                        <ChevronRight size={22} />
                    </button>
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 z-10">
                        {items.map((_, i) => (
                            <button
                                key={i}
                                onClick={() => goTo(i)}
                                className={`transition-all duration-300 rounded-full ${i === currentIdx ? "w-6 h-2 bg-primary" : "w-2 h-2 bg-foreground/40 hover:bg-foreground/70"}`}
                                aria-label={`Go to slide ${i + 1}`}
                            />
                        ))}
                    </div>
                    <div className="absolute bottom-6 right-6 lg:right-12 text-xs text-muted-foreground font-medium tabular-nums z-10">
                        {currentIdx + 1} / {items.length}
                    </div>
                </>
            )}
        </section>
    );
}

// ─── Skeletons ────────────────────────────────────────────────────────────────

function ContentRowSkeleton() {
    return (
        <section className="px-6 lg:px-12 space-y-4">
            <Skeleton className="h-6 w-44 rounded" />
            <div className="flex gap-4 overflow-hidden py-2 px-1">
                {Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} className="content-card shrink-0 space-y-2">
                        <Skeleton className="w-full aspect-[2/3] rounded-lg" />
                        <Skeleton className="h-3.5 w-3/4 rounded" />
                        <Skeleton className="h-3 w-1/2 rounded" />
                    </div>
                ))}
            </div>
        </section>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MoviesClient() {
    const { activeTheme } = useTheme();
    const { ContentRow } = activeTheme.components;

    const [rows, setRows] = useState<HomeCategoryRow[]>([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [loading, setLoading] = useState(false);
    const [bannerReady, setBannerReady] = useState(false);

    useEffect(() => {
        let cancelled = false;
        async function loadPage() {
            setLoading(true);
            try {
                const data = await fetchHomeVideoRows({ page, contentType: "movie" });
                if (!cancelled) {
                    setRows((prev) => (page === 1 ? data.rows : [...prev, ...data.rows]));
                    setHasMore(data.has_more);
                    if (page === 1) setBannerReady(true);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        loadPage();
        return () => { cancelled = true; };
    }, [page]);

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
            {isInitialLoad && <BannerSkeleton />}
            {bannerReady && rows.length > 0 && <HeroBanner rows={rows} />}

            {/* Content rows */}
            <div className="space-y-10 py-10">
                {isInitialLoad ? (
                    <>
                        <ContentRowSkeleton />
                        <ContentRowSkeleton />
                        <ContentRowSkeleton />
                    </>
                ) : rows.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-4 px-6">
                        <Film size={56} className="opacity-30" />
                        <p className="text-lg font-medium">No movies available yet</p>
                        <p className="text-sm opacity-70">Check back soon for new content.</p>
                    </div>
                ) : (
                    <>
                        {rows.map((row) => (
                            <ContentRow
                                key={row.category_id}
                                title={row.category_name}
                                movies={mapRowToMovies(row)}
                            />
                        ))}
                        {hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
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
