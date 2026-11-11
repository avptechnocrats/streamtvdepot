"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRowScroll } from "@/hooks/use-row-scroll";
import { seriesArtwork, type SeriesItem } from "@/lib/services/series";
import { PosterCard } from "@/themes/ember/ContentRow";
import type { ContentRowProps, Movie } from "@/types/content";

function seriesToMovie(series: SeriesItem, landscape: boolean): Movie {
    const date = new Date(series.created_at);
    const trailer = series.trailer_url && /\.(mp4|webm|m3u8)(?:[?#]|$)/i.test(series.trailer_url) ? series.trailer_url : null;
    const hls = trailer && /\.m3u8(?:[?#]|$)/i.test(trailer) ? trailer : null;
    return {
        id: series.id,
        title: series.title,
        image: seriesArtwork(series, landscape),
        previewImage: seriesArtwork(series, true),
        year: Number.isNaN(date.getTime()) ? "" : String(date.getFullYear()),
        rating: series.rating != null ? `★ ${series.rating.toFixed(1)}` : "",
        categories: series.categories ?? [],
        ageRating: series.age_rating,
        classification: series.content_classification || "Series",
        trailerUrl: hls ? null : trailer,
        trailerHlsUrl: hls,
    };
}

export function SeriesPoster({ series, landscape = false, rank, variant }: { series: SeriesItem; landscape?: boolean; rank?: number; variant?: ContentRowProps["variant"] }) {
    const cardVariant = variant ?? (landscape ? "landscape" : "portrait");
    return <PosterCard movie={seriesToMovie(series, cardVariant === "landscape" || cardVariant === "wider-landscape")} contentType="series" rank={rank} variant={cardVariant} />;
}

export default function SeriesRow({ title, series, landscape = false, ranked = false, variant }: { title: string; series: SeriesItem[]; landscape?: boolean; ranked?: boolean; variant?: ContentRowProps["variant"] }) {
    const { scrollRef, canScrollLeft, canScrollRight } = useRowScroll(series.length);
    if (!series.length) return null;
    const cardVariant = variant ?? (landscape ? "landscape" : "portrait");
    const landscapeRow = (cardVariant === "landscape" || cardVariant === "wider-landscape") && !ranked;
    const scroll = (direction: number) => scrollRef.current?.scrollBy({ left: direction * scrollRef.current.clientWidth * 0.8, behavior: "smooth" });
    return <section aria-label={title} className="storefront-row overflow-x-clip [container-type:inline-size] space-y-3">
        <h2 className="text-lg md:text-xl font-display font-700 text-foreground">{title}</h2>
        <div className={`group relative ${ranked ? "[--rank-poster-width:9rem] sm:[--rank-poster-width:9.5rem] lg:[--rank-poster-width:10rem] [--row-artwork-height:13.5rem] sm:[--row-artwork-height:14.25rem] lg:[--row-artwork-height:15rem]" : landscapeRow ? "[--row-artwork-height:7.875rem] sm:[--row-artwork-height:8.4375rem] lg:[--row-artwork-height:9rem]" : "[--row-artwork-height:16.5rem] sm:[--row-artwork-height:18rem] lg:[--row-artwork-height:19.5rem]"}`}>
            <button type="button" title={`Previous ${title}`} aria-label={`Previous ${title}`} disabled={!canScrollLeft} onClick={() => scroll(-1)} className="storefront-row-arrow -left-3"><ChevronLeft size={18} /></button>
            <div ref={scrollRef} className={`pointer-events-none flex ${landscapeRow ? "gap-3" : "gap-5 sm:gap-6"} overflow-x-auto scrollbar-hide pt-32 pb-64 px-10 -mx-10`} style={{ marginTop: -124, marginBottom: -248 }}>
                {series.map((item, index) => <SeriesPoster key={item.id} series={item} variant={cardVariant} rank={ranked ? index + 1 : undefined} />)}
            </div>
            <button type="button" title={`Next ${title}`} aria-label={`Next ${title}`} disabled={!canScrollRight} onClick={() => scroll(1)} className="storefront-row-arrow -right-3"><ChevronRight size={18} /></button>
        </div>
    </section>;
}