/**
 * ember/Banner.tsx
 *
 * Compact hero below the navbar: featured artwork spanning the full width,
 * a left-hand scrim carrying the title block, edge arrows and pill dots.
 * Always behaves as a slider (a single slide simply hides the controls).
 */
"use client";

import { Check, ChevronLeft, ChevronRight, Film, Info, Play, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type PointerEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { BannerTrailer, useBannerHover } from "@/components/BannerTrailer";
import BannerTitle from "@/components/BannerTitle";
import { useBannerVideos } from "@/hooks/use-banner-videos";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { useUserPrefs } from "@/hooks/use-user-prefs";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { addToWatchlist, getWatchlist, removeFromWatchlist } from "@/lib/services/watchlist";

const NAV_OFFSET = "pt-14";
const HERO_HEIGHT = "h-[480px] sm:h-[540px] lg:h-[clamp(600px,65svh,720px)]";

function EmptyBanner() {
    const { site_title, tagline } = useSiteSettings();
    return (
        <section className={`${NAV_OFFSET} bg-background`}>
            <div className={`relative ${HERO_HEIGHT} flex items-center justify-center bg-gradient-to-br from-background via-secondary/40 to-background`}>
                <div className="text-center px-6 space-y-3 max-w-xl">
                    <Film className="mx-auto text-primary" size={36} />
                    <h1 className="text-3xl md:text-5xl font-display font-800 text-foreground">
                        {site_title ?? "Your Platform"}
                    </h1>
                    <p className="text-muted-foreground">
                        {tagline ?? "Your content will appear here once uploaded."}
                    </p>
                </div>
            </div>
        </section>
    );
}

export default function Banner() {
    const { slides, isLoading } = useBannerVideos();
    const { prefs } = useUserPrefs();
    const { user } = useAuth();
    const router = useRouter();
    const queryClient = useQueryClient();
    const { data: watchlist = [] } = useQuery({
        queryKey: ["watchlist"],
        queryFn: getWatchlist,
        enabled: !!user,
        staleTime: 60_000,
    });
    const toggleList = useMutation({
        mutationFn: async ({ videoId, remove }: { videoId: string; remove: boolean }) => {
            await (remove ? removeFromWatchlist(videoId) : addToWatchlist(videoId));
        },
        onSuccess: (_data, { remove }) => {
            queryClient.invalidateQueries({ queryKey: ["watchlist"] });
            toast({ title: remove ? "Removed from My List" : "Added to My List" });
        },
        onError: () => toast({ title: "Couldn't update your list", variant: "destructive" }),
    });
    const [current, setCurrent] = useState(0);
    const { hovered, hoverProps } = useBannerHover();
    const trailerActive = hovered && prefs.bannerStyle === "video";

    const count = slides.length;
    const next = useCallback(() => setCurrent((i) => (i + 1) % Math.max(count, 1)), [count]);
    const prev = () => setCurrent((i) => (i - 1 + count) % count);
    const handleArrowPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
        if (event.pointerType === "mouse") {
            event.preventDefault();
            event.currentTarget.blur();
        }
    };

    useEffect(() => {
        if (count < 2 || trailerActive) return;
        const t = setTimeout(next, 6000);
        return () => clearTimeout(t);
    }, [current, count, next, trailerActive]);

    if (isLoading) {
        return (
            <section className={NAV_OFFSET}>
                <Skeleton className={`w-full ${HERO_HEIGHT} rounded-none`} />
            </section>
        );
    }
    if (count === 0) return <EmptyBanner />;

    const slide = slides[Math.min(current, count - 1)];
    const inList = watchlist.some(item => item.video_id === slide.id);
    const meta = [slide.year, slide.duration].filter(Boolean);
    const shadow = { textShadow: "0 2px 12px rgba(0,0,0,0.8)" };

    return (
        <section className={`${NAV_OFFSET} bg-background`}>
            <div {...hoverProps} className={`group/banner relative ${HERO_HEIGHT} overflow-hidden`}>
                {slides.map((s, i) => (
                    <img
                        key={s.id}
                        src={s.image}
                        alt={s.title}
                        className={`absolute inset-0 w-full h-full object-cover object-[70%_30%] transition-opacity duration-500 ${i === current ? "opacity-100" : "opacity-0"}`}
                    />
                ))}
                <BannerTrailer
                    key={slide.id}
                    src={slide.trailerUrl}
                    hlsSrc={slide.trailerHlsUrl}
                    hovered={trailerActive}
                    positionClassName="object-[70%_30%]"
                />
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(0,5,12,0.98)_0%,rgba(0,5,12,0.85)_24%,rgba(0,5,12,0.45)_46%,rgba(0,5,12,0)_72%)]" />
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(0deg,hsl(var(--background))_0%,rgba(0,5,12,0.85)_9%,rgba(0,5,12,0)_42%)]" />

                <div className="absolute inset-0 flex items-center px-6 pb-10 sm:px-14 sm:pb-6 lg:px-16">
                    <div key={slide.id} className="w-full max-w-xl space-y-4 sm:space-y-5 animate-fade-in">
                        <span className="inline-block px-2.5 py-0.5 text-xs font-semibold tracking-normal border border-primary/70 text-primary rounded bg-primary/10">
                            {slide.classification}
                        </span>
                        <BannerTitle
                            title={slide.title}
                            imageUrl={slide.titleImage}
                            className="font-display font-extrabold leading-[1.08] tracking-normal text-white text-4xl sm:text-5xl lg:text-6xl [overflow-wrap:anywhere] text-balance"
                            style={shadow}
                        >
                            {slide.title}
                        </BannerTitle>
                        {(meta.length > 0 || slide.rating) && (
                            <p className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm sm:text-base font-medium text-white/75" style={shadow}>
                                {meta.map((m, i) => (
                                    <span key={i} className="flex items-center gap-3">
                                        {i > 0 && <span aria-hidden="true" className="h-1 w-1 rounded-full bg-white/50" />}
                                        {m}
                                    </span>
                                ))}
                                {slide.rating && <span className="rounded-sm border border-white/45 px-1.5 py-0.5 text-xs sm:text-sm leading-none">{slide.rating}</span>}
                            </p>
                        )}
                        {slide.description && (
                            <p className="max-w-[52ch] text-base lg:text-lg leading-relaxed text-white/90 line-clamp-3" style={shadow}>
                                {slide.description}
                            </p>
                        )}
                        <div className="flex flex-wrap items-center gap-3 pt-2">
                            <Link
                                href={`/movies/${slide.id}?play=true`}
                                className="inline-flex items-center justify-center gap-2.5 h-12 px-5 sm:px-7 rounded-md text-base font-semibold text-white bg-[image:var(--ember-gradient)] hover:brightness-110 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                            >
                                <Play size={20} fill="currentColor" aria-hidden="true" /> Play Now
                            </Link>
                            <button
                                type="button"
                                aria-label={inList ? "Remove from My List" : "Add to My List"}
                                aria-pressed={inList}
                                title={inList ? "Remove from My List" : "Add to My List"}
                                disabled={toggleList.isPending}
                                onClick={() => {
                                    if (!user) {
                                        router.push("/login");
                                        return;
                                    }
                                    toggleList.mutate({ videoId: slide.id, remove: inList });
                                }}
                                className="group/action inline-flex shrink-0 items-center gap-2.5 h-12 w-12 sm:hover:w-[136px] sm:focus-visible:w-[136px] overflow-hidden px-[13px] rounded-md text-base font-semibold text-white bg-white/15 border border-white/20 backdrop-blur-sm hover:bg-white/25 transition-[width,background-color] duration-300 ease-out motion-reduce:transition-none disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                            >
                                {inList ? <Check size={20} className="shrink-0" aria-hidden="true" /> : <Plus size={20} className="shrink-0" aria-hidden="true" />}
                                <span className="whitespace-nowrap opacity-0 sm:group-hover/action:opacity-100 sm:group-focus-visible/action:opacity-100 transition-opacity duration-200 motion-reduce:transition-none">My List</span>
                            </button>
                            <Link
                                href={`/movies/${slide.id}`}
                                aria-label="More Info"
                                title="More Info"
                                className="group/action inline-flex shrink-0 items-center gap-2.5 h-12 w-12 sm:hover:w-[152px] sm:focus-visible:w-[152px] overflow-hidden px-[13px] rounded-md text-base font-semibold text-white bg-white/15 border border-white/20 backdrop-blur-sm hover:bg-white/25 transition-[width,background-color] duration-300 ease-out motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                            >
                                <Info size={20} className="shrink-0" aria-hidden="true" /> <span className="whitespace-nowrap opacity-0 sm:group-hover/action:opacity-100 sm:group-focus-visible/action:opacity-100 transition-opacity duration-200 motion-reduce:transition-none">More Info</span>
                            </Link>
                        </div>
                    </div>
                </div>

                {count > 1 && (
                    <>
                        <button
                            onClick={prev}
                            onPointerDown={handleArrowPointerDown}
                            className="absolute left-2 sm:left-5 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover/banner:opacity-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white [@media(hover:none)]:opacity-100"
                            aria-label="Previous slide"
                        >
                            <ChevronLeft size={32} />
                        </button>
                        <button
                            onClick={next}
                            onPointerDown={handleArrowPointerDown}
                            className="absolute right-2 sm:right-5 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover/banner:opacity-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white [@media(hover:none)]:opacity-100"
                            aria-label="Next slide"
                        >
                            <ChevronRight size={32} />
                        </button>
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                            {slides.map((s, i) => (
                                <button
                                    key={s.id}
                                    onClick={() => setCurrent(i)}
                                    className={`h-1 rounded-full transition-all ${i === current ? "w-8 bg-primary" : "w-5 bg-foreground/40 hover:bg-foreground/70"}`}
                                    aria-label={`Go to slide ${i + 1}`}
                                />
                            ))}
                        </div>
                    </>
                )}
            </div>
        </section>
    );
}
