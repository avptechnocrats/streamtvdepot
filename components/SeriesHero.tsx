"use client";

import type { ReactNode } from "react";
import { Check, Plus, Star } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BannerTrailer, useBannerAutoplay } from "@/components/BannerTrailer";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { seriesArtwork, type SeriesItem } from "@/lib/services/series";
import { addToWatchlist, getWatchlist, removeFromWatchlist } from "@/lib/services/watchlist";

export default function SeriesHero({ series, actions, afterListAction, navigation, previewEnabled = true }: { series: SeriesItem; actions: ReactNode; afterListAction?: ReactNode; navigation?: ReactNode; previewEnabled?: boolean }) {
    const { active, bannerRef } = useBannerAutoplay();
    const { user, isLoading: authLoading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const queryClient = useQueryClient();
    const { data: watchlist = [], isLoading: watchlistLoading, isError: watchlistError } = useQuery({
        queryKey: ["watchlist", user?.id], queryFn: getWatchlist, enabled: !!user, staleTime: 60_000,
    });
    const inList = watchlist.some(item => item.video_id === series.id && item.content_type === "series");
    const toggleList = useMutation({
        mutationFn: async ({ id, remove }: { id: string; remove: boolean }) => {
            if (remove) await removeFromWatchlist(id);
            else await addToWatchlist(id, "series");
        },
        onSuccess: async (_result, { remove }) => {
            await queryClient.invalidateQueries({ queryKey: ["watchlist"] });
            toast({ title: remove ? "Removed from My List" : "Added to My List" });
        },
        onError: () => toast({ title: "Couldn't update your list", variant: "destructive" }),
    });
    const trailer = series.trailer_url && /\.(mp4|webm|m3u8)(?:[?#]|$)/i.test(series.trailer_url) ? series.trailer_url : null;
    const year = new Date(series.created_at).getFullYear();

    return <section ref={bannerRef} aria-label={`${series.title} featured series`} className="group/banner relative z-10 isolate h-[480px] overflow-hidden bg-black text-white sm:h-[540px] lg:h-[clamp(600px,65svh,720px)]">
        <img key={series.id} src={seriesArtwork(series, true)} alt="" aria-hidden fetchPriority="high" width={1920} height={1080} className="absolute inset-0 h-full w-full object-cover object-[65%_35%]" onError={event => { if (!event.currentTarget.src.endsWith('/images/hero-banner.jpg')) event.currentTarget.src = '/images/hero-banner.jpg'; }} />
        {trailer && previewEnabled && <BannerTrailer key={`trailer-${series.id}`} src={/\.m3u8(?:[?#]|$)/i.test(trailer) ? null : trailer} hlsSrc={/\.m3u8(?:[?#]|$)/i.test(trailer) ? trailer : null} hovered={active} delayMs={1800} showSoundControl soundControlTopInset={88} soundControlAlignToNav />}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/90 via-black/45 to-transparent" />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/20" />
                <div className="absolute inset-0 z-10 flex items-center px-6 pb-10 sm:px-14 sm:pb-6 lg:px-16">
                    <div className="w-full">
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
                <div className="flex flex-wrap items-center gap-3">{actions}
                    <button type="button" aria-label={inList ? "Remove from My List" : "Add to My List"} aria-pressed={inList} title={watchlistError ? "My List unavailable" : inList ? "Remove from My List" : "Add to My List"} disabled={authLoading || toggleList.isPending || (!!user && (watchlistLoading || watchlistError))} onClick={() => {
                        if (!user) {
                            const query = searchParams.toString();
                            router.push(`/login?returnTo=${encodeURIComponent(`${pathname}${query ? `?${query}` : ""}`)}`);
                            return;
                        }
                        toggleList.mutate({ id: series.id, remove: inList });
                    }} className="group/action inline-flex h-12 w-12 shrink-0 items-center gap-2.5 overflow-hidden rounded-md border border-white/20 bg-white/15 px-[13px] text-base font-semibold text-white backdrop-blur-sm transition-[width,background-color] duration-300 hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-50 sm:hover:w-[136px] sm:focus-visible:w-[136px] motion-reduce:transition-none">
                        {inList ? <Check size={20} className="shrink-0" aria-hidden="true" /> : <Plus size={20} className="shrink-0" aria-hidden="true" />}
                        <span className="whitespace-nowrap opacity-0 transition-opacity duration-200 sm:group-hover/action:opacity-100 sm:group-focus-visible/action:opacity-100 motion-reduce:transition-none">My List</span>
                    </button>
                    {afterListAction}
                </div>
            </div>
                    </div>
        </div>
        {navigation}
    </section>;
}