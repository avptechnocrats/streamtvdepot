"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ArrowRight, ChevronLeft, ChevronRight, Clapperboard, Info, Loader2, Play, RotateCcw } from "lucide-react";
import { fetchSeriesPage, fetchSeriesRows, fetchSeriesSlider } from "@/lib/services/series";
import SeriesHero from "@/components/SeriesHero";
import SeriesRow from "@/components/SeriesRow";
import ManagedBannerSlot from "@/components/ManagedBannerSlot";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function SeriesCatalog() {
    const [heroIndex, setHeroIndex] = useState(0);
    const sentinelRef = useRef<HTMLDivElement>(null);
    const paginationRef = useRef<HTMLDivElement>(null);
    const { data: spotlight } = useQuery({
        queryKey: ["series-spotlight"],
        queryFn: ({ signal }) => fetchSeriesSlider(signal),
        staleTime: 60_000,
        retry: 1,
    });
    const categoryQuery = useInfiniteQuery({
        queryKey: ["series-category-rows"],
        initialPageParam: 1,
        queryFn: ({ pageParam }) => fetchSeriesRows(pageParam),
        getNextPageParam: (lastPage, pages) => (lastPage.has_more ? pages.length + 1 : undefined),
        staleTime: 60_000,
        retry: 1,
    });
    const { data, isPending, isError, refetch, hasNextPage, fetchNextPage, isFetchingNextPage, isFetchNextPageError } =
        useInfiniteQuery({
            queryKey: ["series-catalog"],
            initialPageParam: 1,
            queryFn: ({ pageParam, signal }) => fetchSeriesPage(pageParam, {}, signal),
            getNextPageParam: (lastPage, pages) => (lastPage.has_more ? pages.length + 1 : undefined),
            staleTime: 60_000,
            retry: 1,
        });
    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel || typeof IntersectionObserver === "undefined") return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (!entries[0].isIntersecting) return;
                if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) void fetchNextPage();
                if (
                    categoryQuery.hasNextPage &&
                    !categoryQuery.isFetchingNextPage &&
                    !categoryQuery.isFetchNextPageError
                )
                    void categoryQuery.fetchNextPage();
            },
            { rootMargin: "300px" },
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [
        hasNextPage,
        isFetchingNextPage,
        isFetchNextPageError,
        fetchNextPage,
        categoryQuery.hasNextPage,
        categoryQuery.isFetchingNextPage,
        categoryQuery.isFetchNextPageError,
        categoryQuery.fetchNextPage,
        isPending,
        categoryQuery.isPending,
    ]);
    const series = Array.from(
        new Map((data?.pages.flatMap((page) => page.items) ?? []).map((item) => [item.id, item])).values(),
    );
    const categoryRows = categoryQuery.data?.pages.flatMap((page) => page.rows) ?? [];
    const hasCategorySeries = categoryRows.some((row) => row.items.length > 0);
    const assignedHeroes = spotlight ?? series.filter((item) => item.is_series_slider);
    const featuredHeroes = series.filter((item) => item.is_featured);
    const heroes = assignedHeroes.length ? assignedHeroes : featuredHeroes.length ? featuredHeroes : series;
    const hero = heroes[heroIndex % Math.max(heroes.length, 1)];
    useEffect(() => {
        const container = paginationRef.current;
        const current = container?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
        if (!container || !current) return;
        const bounds = container.getBoundingClientRect();
        const item = current.getBoundingClientRect();
        container.scrollLeft += item.left + item.width / 2 - (bounds.left + bounds.width / 2);
    }, [heroIndex, heroes.length]);
    const topRated = [...series]
        .sort((first, second) => (second.rating ?? 0) - (first.rating ?? 0))
        .filter((item) => item.rating != null)
        .slice(0, 10);
    const latest = [...series]
        .sort((first, second) => new Date(second.created_at).getTime() - new Date(first.created_at).getTime())
        .slice(0, 10);

    return (
        <>
            {hero ? (
                <SeriesHero
                    series={hero}
                    slideCount={heroes.length}
                    onAdvance={() => setHeroIndex((index) => (index + 1) % heroes.length)}
                    actions={
                        <Link
                            href={`/series/${hero.id}?play=true`}
                            className="inline-flex h-12 items-center justify-center gap-2.5 rounded-md bg-[image:var(--ember-gradient)] px-5 text-base font-semibold text-white transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white sm:px-7"
                        >
                            <Play size={20} fill="currentColor" aria-hidden="true" />
                            Play Now
                        </Link>
                    }
                    afterListAction={
                        <Link
                            href={`/series/${hero.id}`}
                            aria-label="More Info"
                            title="More Info"
                            className="group/action inline-flex h-12 w-12 shrink-0 items-center gap-2.5 overflow-hidden rounded-md border border-white/20 bg-white/15 px-[13px] text-base font-semibold text-white backdrop-blur-sm transition-[width,background-color] duration-300 hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white sm:hover:w-[152px] sm:focus-visible:w-[152px] motion-reduce:transition-none"
                        >
                            <Info size={20} className="shrink-0" aria-hidden="true" />
                            <span className="whitespace-nowrap opacity-0 transition-opacity duration-200 sm:group-hover/action:opacity-100 sm:group-focus-visible/action:opacity-100 motion-reduce:transition-none">
                                More Info
                            </span>
                        </Link>
                    }
                    navigation={
                        heroes.length > 1 ? (
                            <>
                                <button
                                    type="button"
                                    aria-label="Previous featured series"
                                    title="Previous featured series"
                                    onClick={() => setHeroIndex((index) => (index - 1 + heroes.length) % heroes.length)}
                                    className="storefront-slider-arrow absolute left-2 sm:left-5 top-1/2 -translate-y-1/2 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover/banner:opacity-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white [@media(hover:none)]:opacity-100"
                                >
                                    <ChevronLeft size={32} />
                                </button>
                                <button
                                    type="button"
                                    aria-label="Next featured series"
                                    title="Next featured series"
                                    onClick={() => setHeroIndex((index) => (index + 1) % heroes.length)}
                                    className="storefront-slider-arrow absolute right-2 sm:right-5 top-1/2 -translate-y-1/2 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover/banner:opacity-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white [@media(hover:none)]:opacity-100"
                                >
                                    <ChevronRight size={32} />
                                </button>
                                <div
                                    ref={paginationRef}
                                    className="absolute bottom-0 left-1/2 -translate-x-1/2 z-20 flex max-w-[calc(100%-5rem)] items-center gap-2 overflow-x-auto scrollbar-hide"
                                >
                                    {heroes.map((item, index) => (
                                        <button
                                            key={item.id}
                                            type="button"
                                            title={item.title}
                                            aria-label={`Feature ${item.title}`}
                                            aria-pressed={heroIndex % heroes.length === index}
                                            onClick={() => setHeroIndex(index)}
                                            className="flex h-9 shrink-0 items-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                                        >
                                            <span
                                                aria-hidden="true"
                                                className={`h-1 rounded-full transition-all ${heroIndex % heroes.length === index ? "w-8 bg-primary" : "w-5 bg-foreground/40 hover:bg-foreground/70"}`}
                                            />
                                        </button>
                                    ))}
                                </div>
                            </>
                        ) : undefined
                    }
                />
            ) : isPending ? (
                <div
                    aria-label="Loading featured series"
                    role="status"
                    className="relative min-h-[440px] bg-secondary/50 pt-32 pb-12"
                >
                    <div className="storefront-row space-y-5">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-14 w-3/5 max-w-xl" />
                        <Skeleton className="h-4 w-2/3 max-w-lg" />
                        <Skeleton className="h-12 w-40" />
                    </div>
                </div>
            ) : (
                <div className="h-20" />
            )}

            <div className="space-y-10 py-10">
                {isPending || (categoryQuery.isPending && !series.length) ? (
                    <div
                        role="status"
                        aria-label="Loading series"
                        className="storefront-row flex gap-3 overflow-hidden"
                    >
                        {Array.from({ length: 7 }, (_, index) => (
                            <div key={index} className="w-36 shrink-0 space-y-3 sm:w-44">
                                <Skeleton className="aspect-[2/3] w-full rounded-lg" />
                                <Skeleton className="h-4 w-3/4" />
                            </div>
                        ))}
                    </div>
                ) : isError || (categoryQuery.isError && !series.length && !hasCategorySeries) ? (
                    <section
                        role="alert"
                        className="storefront-row flex min-h-72 flex-col items-center justify-center gap-4 text-center"
                    >
                        <Clapperboard size={36} className="text-muted-foreground" />
                        <h2 className="text-xl font-semibold">Series are temporarily unavailable</h2>
                        <Button
                            variant="outline"
                            onClick={() => {
                                if (isError) void refetch();
                                if (categoryQuery.isError) void categoryQuery.refetch();
                            }}
                            className="gap-2"
                        >
                            <RotateCcw size={15} />
                            Try Again
                        </Button>
                    </section>
                ) : !series.length && !hasCategorySeries ? (
                    <section className="storefront-row flex min-h-72 flex-col items-center justify-center gap-4 text-center">
                        <Clapperboard size={40} className="text-muted-foreground/60" />
                        <h2 className="text-xl font-semibold">No series available yet</h2>
                        <Button asChild variant="outline" className="gap-2">
                            <Link href="/movies">
                                Browse Movies
                                <ArrowRight size={15} />
                            </Link>
                        </Button>
                    </section>
                ) : (
                    <>
                        {topRated.length > 1 && <SeriesRow title="Top Rated Series" series={topRated} ranked />}
                        <SeriesRow title="Recently Added" series={latest} landscape />
                        <ManagedBannerSlot page="/series" position="top" />
                        {categoryRows.slice(0, 1).map((row) => (
                            <SeriesRow
                                key={row.category_id}
                                title={row.category_name}
                                series={row.items}
                                variant={
                                    row.thumbnail_view === "portrait"
                                        ? "featured"
                                        : row.thumbnail_view === "wider_landscape"
                                          ? "wider-landscape"
                                          : "landscape"
                                }
                            />
                        ))}
                        <ManagedBannerSlot page="/series" position="middle_1" />
                        {categoryRows.slice(1, 3).map((row) => (
                            <SeriesRow
                                key={row.category_id}
                                title={row.category_name}
                                series={row.items}
                                variant={
                                    row.thumbnail_view === "portrait"
                                        ? "featured"
                                        : row.thumbnail_view === "wider_landscape"
                                          ? "wider-landscape"
                                          : "landscape"
                                }
                            />
                        ))}
                        <ManagedBannerSlot page="/series" position="middle_2" />
                        {categoryRows.slice(3).map((row) => (
                            <SeriesRow
                                key={row.category_id}
                                title={row.category_name}
                                series={row.items}
                                variant={
                                    row.thumbnail_view === "portrait"
                                        ? "featured"
                                        : row.thumbnail_view === "wider_landscape"
                                          ? "wider-landscape"
                                          : "landscape"
                                }
                            />
                        ))}
                        {series.length > 0 && <SeriesRow title="All Series" series={series} />}
                        {(hasNextPage || categoryQuery.hasNextPage) && <div ref={sentinelRef} className="h-px" />}
                        {(isFetchingNextPage || categoryQuery.isFetchingNextPage) && (
                            <div
                                role="status"
                                className="storefront-row flex items-center gap-2 text-sm text-muted-foreground"
                            >
                                <Loader2 size={16} className="animate-spin" />
                                Loading series
                            </div>
                        )}
                        {(isFetchNextPageError || categoryQuery.isError) && (
                            <div
                                role="alert"
                                className="storefront-row flex items-center gap-3 text-sm text-muted-foreground"
                            >
                                Some series could not be loaded.
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        if (isFetchNextPageError) void fetchNextPage();
                                        if (categoryQuery.isFetchNextPageError) void categoryQuery.fetchNextPage();
                                        else if (categoryQuery.isError) void categoryQuery.refetch();
                                    }}
                                >
                                    <RotateCcw size={15} />
                                    Retry
                                </Button>
                            </div>
                        )}
                    </>
                )}
            </div>
            <ManagedBannerSlot page="/series" position="bottom" />
        </>
    );
}
