"use client";

import type { ReactNode } from "react";
import { Star } from "lucide-react";
import { BannerTrailer, useBannerAutoplay } from "@/components/BannerTrailer";
import { seriesArtwork, type SeriesItem } from "@/lib/services/series";

export default function SeriesHero({ series, actions, navigation, previewEnabled = true }: { series: SeriesItem; actions: ReactNode; navigation?: ReactNode; previewEnabled?: boolean }) {
    const { active, bannerRef } = useBannerAutoplay();
    const trailer = series.trailer_url && /\.(mp4|webm|m3u8)(?:[?#]|$)/i.test(series.trailer_url) ? series.trailer_url : null;
    const year = new Date(series.created_at).getFullYear();

    return <section ref={bannerRef} aria-label={`${series.title} featured series`} className="relative isolate flex min-h-[min(580px,calc(100svh-120px))] items-end overflow-hidden bg-black pb-10 pt-28 text-white sm:pb-12 lg:min-h-[min(700px,calc(100svh-136px))]">
        <img key={series.id} src={seriesArtwork(series, true)} alt="" aria-hidden fetchPriority="high" width={1920} height={1080} className="absolute inset-0 h-full w-full object-cover object-[65%_35%]" onError={event => { if (!event.currentTarget.src.endsWith('/images/hero-banner.jpg')) event.currentTarget.src = '/images/hero-banner.jpg'; }} />
        {trailer && previewEnabled && <BannerTrailer key={`trailer-${series.id}`} src={/\.m3u8(?:[?#]|$)/i.test(trailer) ? null : trailer} hlsSrc={/\.m3u8(?:[?#]|$)/i.test(trailer) ? trailer : null} hovered={active} delayMs={1800} showSoundControl soundControlTopInset={88} soundControlAlignToNav />}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/90 via-black/45 to-transparent" />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/20" />
        <div className="storefront-row relative z-10 w-full">
            <div className="max-w-2xl space-y-4">
                <p className="flex items-center gap-2 text-sm font-bold uppercase"><span className="h-4 w-1 bg-primary" />Series</p>
                <h1 className="break-words text-4xl font-black leading-tight sm:text-5xl lg:text-6xl">{series.title}</h1>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-medium text-white/85 sm:text-sm">
                    {Number.isFinite(year) && <span>{year}</span>}
                    {series.age_rating && <span className="rounded border border-white/40 px-1.5 py-0.5 text-xs">{series.age_rating}</span>}
                    <span>{series.total_seasons} {series.total_seasons === 1 ? "Season" : "Seasons"}</span>
                    {series.rating != null && <span className="inline-flex items-center gap-1 text-amber-300"><Star size={13} fill="currentColor" />{series.rating.toFixed(1)}</span>}
                    {series.access_type === "free" && <span className="text-emerald-300">Free to watch</span>}
                </div>
                {series.genre && <p className="text-sm font-semibold text-white/85">{series.genre}</p>}
                {series.description && <p className="line-clamp-3 max-w-xl text-sm leading-relaxed text-white/80 sm:text-base">{series.description}</p>}
            </div>
            <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
                <div className="flex flex-wrap items-center gap-3">{actions}</div>
                {navigation}
            </div>
        </div>
    </section>;
}