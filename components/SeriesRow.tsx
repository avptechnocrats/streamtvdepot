"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Play, Star } from "lucide-react";
import { useRowScroll } from "@/hooks/use-row-scroll";
import { seriesArtwork, type SeriesItem } from "@/lib/services/series";

export function SeriesPoster({ series, landscape = false, rank }: { series: SeriesItem; landscape?: boolean; rank?: number }) {
    return <Link href={`/series/${encodeURIComponent(series.id)}`} title={series.title} data-series-card={series.id} className={`group/card min-w-0 shrink-0 snap-start rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-background ${landscape ? "w-56 sm:w-64 lg:w-72" : "w-36 sm:w-44 lg:w-48"}`}>
        <div className={`relative overflow-hidden rounded-lg bg-secondary ${landscape ? "aspect-video" : "aspect-[2/3]"}`}>
            <img src={seriesArtwork(series, landscape)} alt={series.title} width={landscape ? 576 : 384} height={landscape ? 324 : 576} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 motion-reduce:transition-none group-hover/card:scale-105 group-focus-visible/card:scale-105" onError={event => { if (!event.currentTarget.src.endsWith('/images/hero-banner.jpg')) event.currentTarget.src = '/images/hero-banner.jpg'; }} />
            <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/75 via-transparent to-transparent p-3 opacity-0 transition-opacity group-hover/card:opacity-100 group-focus-visible/card:opacity-100"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-black"><Play size={16} fill="currentColor" /></span></div>
            {rank != null && <span className="absolute left-2 top-2 flex h-7 min-w-7 items-center justify-center rounded bg-black/80 px-1.5 text-sm font-black text-white">{rank}</span>}
            {series.access_type === "free" && <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">FREE</span>}
        </div>
        <h3 className="mt-2 truncate text-sm font-semibold text-foreground">{series.title}</h3>
        <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>{series.total_seasons} {series.total_seasons === 1 ? "Season" : "Seasons"}</span>{series.rating != null && <span className="inline-flex items-center gap-1"><Star size={11} className="text-primary" />{series.rating.toFixed(1)}</span>}</div>
    </Link>;
}

export default function SeriesRow({ title, series, landscape = false, ranked = false }: { title: string; series: SeriesItem[]; landscape?: boolean; ranked?: boolean }) {
    const { scrollRef, canScrollLeft, canScrollRight } = useRowScroll(series.length);
    if (!series.length) return null;
    const scroll = (direction: number) => scrollRef.current?.scrollBy({ left: direction * scrollRef.current.clientWidth * 0.8, behavior: "smooth" });
    return <section aria-label={title} className="storefront-row">
        <h2 className="mb-4 text-lg font-bold sm:text-xl">{title}</h2>
        <div className={`group relative [--row-artwork-offset:4px] ${landscape ? "[--row-artwork-height:7.875rem] sm:[--row-artwork-height:9rem] lg:[--row-artwork-height:10.125rem]" : "[--row-artwork-height:13.5rem] sm:[--row-artwork-height:16.5rem] lg:[--row-artwork-height:18rem]"}`}>
            <button type="button" title={`Previous ${title}`} aria-label={`Previous ${title}`} disabled={!canScrollLeft} onClick={() => scroll(-1)} className="storefront-row-arrow -left-3"><ChevronLeft size={18} /></button>
            <div ref={scrollRef} className="flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory py-1 px-1 -mx-1">
                {series.map((item, index) => <SeriesPoster key={item.id} series={item} landscape={landscape} rank={ranked ? index + 1 : undefined} />)}
            </div>
            <button type="button" title={`Next ${title}`} aria-label={`Next ${title}`} disabled={!canScrollRight} onClick={() => scroll(1)} className="storefront-row-arrow -right-3"><ChevronRight size={18} /></button>
        </div>
    </section>;
}