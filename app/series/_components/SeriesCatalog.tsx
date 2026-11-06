"use client";

import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ArrowRight, ChevronLeft, ChevronRight, Clapperboard, Info, Loader2, Play, RotateCcw, Search, X } from "lucide-react";
import { fetchSeriesPage, fetchSeriesRows } from "@/lib/services/series";
import SeriesHero from "@/components/SeriesHero";
import SeriesRow, { SeriesPoster } from "@/components/SeriesRow";
import ManagedBannerSlot from "@/components/ManagedBannerSlot";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function SeriesCatalog() {
    const [search, setSearch] = useState("");
    const deferredSearch = useDeferredValue(search.trim());
    const [category, setCategory] = useState("");
    const [language, setLanguage] = useState("");
    const [sort, setSort] = useState<"featured" | "latest" | "rating">("featured");
    const [heroIndex, setHeroIndex] = useState(0);
    const filtered = !!(deferredSearch || category || language || sort !== "featured");
    const { data: spotlight } = useQuery({ queryKey: ["series-spotlight"], queryFn: ({ signal }) => fetchSeriesPage(1, {}, signal), staleTime: 60_000, retry: 1 });
    const { data: categoryRows } = useQuery({ queryKey: ["series-category-rows"], queryFn: () => fetchSeriesRows(1), staleTime: 60_000, retry: 1 });
    const { data, isPending, isError, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } = useInfiniteQuery({
        queryKey: ["series-catalog", deferredSearch, category, language, sort],
        initialPageParam: 1,
        queryFn: ({ pageParam, signal }) => fetchSeriesPage(pageParam, { search: deferredSearch || undefined, category: category || undefined, language: language || undefined, sort }, signal),
        getNextPageParam: (lastPage, pages) => lastPage.has_more ? pages.length + 1 : undefined,
        staleTime: 60_000,
        retry: 1,
    });
    const series = Array.from(new Map((data?.pages.flatMap(page => page.items) ?? []).map(item => [item.id, item])).values());
    const categoryItems = (categoryRows?.rows ?? []).flatMap(row => row.items);
    const hasCategorySeries = !filtered && categoryItems.length > 0;
    const titleCount = filtered ? series.length : new Set([...series, ...categoryItems].map(item => item.id)).size;
    const base = spotlight?.items ?? (filtered ? [] : series);
    const assignedHeroes = base.filter(item => item.is_series_slider);
    const featuredHeroes = base.filter(item => item.is_featured);
    const heroes = (assignedHeroes.length ? assignedHeroes : featuredHeroes.length ? featuredHeroes : base).slice(0, 5);
    const hero = heroes[heroIndex % Math.max(heroes.length, 1)];
    const categories = Array.from(new Map((categoryRows?.rows ?? []).map(row => [row.category_slug, row.category_name])).entries());
    const languages = Array.from(new Set(base.flatMap(item => item.languages?.length ? item.languages : item.language ? [item.language] : []))).sort();
    const topRated = [...series].sort((first, second) => (second.rating ?? 0) - (first.rating ?? 0)).filter(item => item.rating != null).slice(0, 10);
    const latest = [...series].sort((first, second) => new Date(second.created_at).getTime() - new Date(first.created_at).getTime()).slice(0, 10);
    const resetFilters = () => { setSearch(""); setCategory(""); setLanguage(""); setSort("featured"); };
    const CatalogHeading = hero ? "h2" : "h1";

    return <>
        {hero ? <SeriesHero series={hero} actions={<>
            <Button asChild size="lg" className="gap-2 px-5"><Link href={`/series/${hero.id}?play=true`}><Play size={18} fill="currentColor" />Watch Now</Link></Button>
            <Button asChild size="lg" variant="secondary" className="gap-2 bg-white/15 px-5 text-white hover:bg-white/25"><Link href={`/series/${hero.id}`}><Info size={18} /><span className="sm:hidden">Episodes</span><span className="hidden sm:inline">Episodes & Details</span></Link></Button>
        </>} navigation={heroes.length > 1 ? <div className="flex items-center gap-3">
            <button type="button" aria-label="Previous featured series" title="Previous featured series" onClick={() => setHeroIndex(index => (index - 1 + heroes.length) % heroes.length)} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-black/20 hover:bg-white/15"><ChevronLeft size={18} /></button>
            <div className="flex gap-2">{heroes.map((item, index) => <button key={item.id} type="button" title={item.title} aria-label={`Feature ${item.title}`} aria-pressed={heroIndex % heroes.length === index} onClick={() => setHeroIndex(index)} className={`h-1.5 rounded-full transition-all ${heroIndex % heroes.length === index ? "w-6 bg-white" : "w-2 bg-white/40 hover:bg-white/70"}`} />)}</div>
            <button type="button" aria-label="Next featured series" title="Next featured series" onClick={() => setHeroIndex(index => (index + 1) % heroes.length)} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-black/20 hover:bg-white/15"><ChevronRight size={18} /></button>
        </div> : undefined} /> : isPending ? <div aria-label="Loading featured series" role="status" className="relative min-h-[440px] bg-secondary/50 pt-32 pb-12"><div className="storefront-row space-y-5"><Skeleton className="h-4 w-20" /><Skeleton className="h-14 w-3/5 max-w-xl" /><Skeleton className="h-4 w-2/3 max-w-lg" /><Skeleton className="h-12 w-40" /></div></div> : <div className="h-20" />}

        <div className="storefront-row py-8 sm:py-10">
            <div className="flex flex-wrap items-center justify-between gap-5">
                <div className="flex items-baseline gap-3"><CatalogHeading className="text-2xl font-bold">Series</CatalogHeading>{!isPending && <span aria-live="polite" className="text-xs text-muted-foreground">{titleCount}{hasNextPage ? "+" : ""} titles</span>}</div>
                <div className="relative w-full sm:max-w-xs"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input type="search" aria-label="Search series" placeholder="Search series" value={search} onChange={event => setSearch(event.target.value)} className="h-10 w-full rounded-md border border-border bg-secondary/40 pl-9 pr-10 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary" />{search && <button type="button" title="Clear search" aria-label="Clear search" onClick={() => setSearch("")} className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground"><X size={15} /></button>}</div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 border-b border-border/50 pb-5 sm:flex sm:flex-wrap sm:items-center">
                <select aria-label="Series category" value={category} onChange={event => setCategory(event.target.value)} className="h-9 min-w-0 rounded-md border border-border bg-background px-2 text-xs sm:min-w-40 sm:text-sm"><option value="">All Categories</option>{categories.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}</select>
                <select aria-label="Series language" value={language} onChange={event => setLanguage(event.target.value)} className="h-9 min-w-0 rounded-md border border-border bg-background px-2 text-xs sm:min-w-40 sm:text-sm"><option value="">All Languages</option>{languages.map(value => <option key={value} value={value}>{value}</option>)}</select>
                <select aria-label="Sort series" value={sort} onChange={event => setSort(event.target.value as typeof sort)} className="h-9 min-w-0 rounded-md border border-border bg-background px-2 text-xs sm:ml-auto sm:min-w-40 sm:text-sm"><option value="featured">Recommended</option><option value="latest">Recently Added</option><option value="rating">Top Rated</option></select>
                {filtered && <button type="button" title="Reset filters" aria-label="Reset filters" onClick={resetFilters} className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground"><RotateCcw size={15} /></button>}
            </div>
        </div>

        {isPending ? <div role="status" aria-label="Loading series" className="storefront-row flex gap-3 overflow-hidden pb-12">{Array.from({ length: 7 }, (_, index) => <div key={index} className="w-36 shrink-0 space-y-3 sm:w-44"><Skeleton className="aspect-[2/3] w-full rounded-lg" /><Skeleton className="h-4 w-3/4" /></div>)}</div>
            : isError ? <section role="alert" className="storefront-row flex min-h-72 flex-col items-center justify-center gap-4 pb-16 text-center"><Clapperboard size={36} className="text-muted-foreground" /><h2 className="text-xl font-semibold">Series are temporarily unavailable</h2><Button variant="outline" onClick={() => void refetch()} className="gap-2"><RotateCcw size={15} />Try Again</Button></section>
            : !series.length && !hasCategorySeries ? <section className="storefront-row flex min-h-72 flex-col items-center justify-center gap-4 pb-16 text-center"><Clapperboard size={40} className="text-muted-foreground/60" /><h2 className="text-xl font-semibold">{filtered ? "No matching series" : "No series available yet"}</h2>{filtered ? <Button variant="outline" onClick={resetFilters}>Clear Filters</Button> : <Button asChild variant="outline" className="gap-2"><Link href="/movies">Browse Movies<ArrowRight size={15} /></Link></Button>}</section>
            : <>
                {!filtered && <div className="space-y-10 pb-10">
                    {topRated.length > 1 && <SeriesRow title="Top Rated Series" series={topRated} ranked />}
                    <SeriesRow title="Recently Added" series={latest} landscape />
                    <ManagedBannerSlot page="/series" position="top" />
                    {(categoryRows?.rows ?? []).map(row => <SeriesRow key={row.category_id} title={row.category_name} series={row.items} landscape={row.thumbnail_view !== "portrait"} />)}
                </div>}
                {series.length > 0 && <section aria-label={filtered ? "Series search results" : "All Series"} className="storefront-row pb-12">
                    <h2 className="mb-5 text-lg font-bold sm:text-xl">{filtered ? "Results" : "All Series"}</h2>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">{series.map(item => <div key={item.id} className="min-w-0 [&>a]:block [&>a]:w-full"><SeriesPoster series={item} /></div>)}</div>
                </section>}
                {hasNextPage && <div className="flex justify-center pb-12"><Button variant="outline" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()} className="gap-2">{isFetchingNextPage ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}Load More</Button></div>}
            </>}
        <ManagedBannerSlot page="/series" position="bottom" />
    </>;
}