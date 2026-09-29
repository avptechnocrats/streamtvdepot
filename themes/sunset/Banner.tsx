/**
 * sunset/Banner.tsx
 *
 * Peacock/magazine-style hero.
 * Short (58vh) — NOT full-screen. Image on the right, editorial text panel on the left.
 * A warm gradient bleeds from the left panel into the image.
 * Below the hero: a featured "What's On Now" live-style strip.
 */
"use client";

import { Play, Plus, Check, Loader2 } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { useUserPrefs } from "@/hooks/use-user-prefs";
import { useBannerVideos, type BannerSlide } from "@/hooks/use-banner-videos";
import { BannerSkeleton } from "@/components/BannerSkeleton";
import { addToWatchlist, removeFromWatchlist, getWatchlist, type WatchlistItem } from "@/lib/services/watchlist";
import { toast } from "@/hooks/use-toast";

type FeaturedData = {
    id: string; image: string; tag: string; title: string;
    subtitle: string; desc: string; year: string; episodes: string;
};

function mapToFeatured(s: BannerSlide): FeaturedData {
    return {
        id: s.id,
        image: s.image,
        tag: s.classification,
        title: s.title,
        subtitle: s.raw.category ?? "Now Streaming",
        desc: s.description,
        year: s.year,
        episodes: s.duration || "Film",
    };
}

const whatsOn = [
    { image: "/images/movie-1.jpg", time: "8:00 PM", channel: "SV Live", title: "Shadow Walker" },
    { image: "/images/movie-3.jpg", time: "9:30 PM", channel: "SV2", title: "Dune III" },
    { image: "/images/movie-4.jpg", time: "10:00 PM", channel: "SV Plus", title: "Night Detective" },
    { image: "/images/movie-6.jpg", time: "11:00 PM", channel: "SV Live", title: "Gravity's Edge" },
];

export default function Banner() {
    const [current, setCurrent] = useState(0);
    const [fading, setFading] = useState(false);
    const { prefs } = useUserPrefs();
    const { slides: apiSlides, isLoading } = useBannerVideos();
    const featured = apiSlides.map(mapToFeatured);

    const goTo = useCallback((idx: number) => {
        if (fading) return;
        setFading(true);
        setTimeout(() => { setCurrent(idx); setFading(false); }, 300);
    }, [fading]);

    const next = useCallback(() => goTo((current + 1) % featured.length), [current, goTo, featured.length]);
    useEffect(() => { if (prefs.bannerStyle === "static") return; const t = setTimeout(next, 7000); return () => clearTimeout(t); }, [current, next, prefs.bannerStyle]);

    const f = featured[current];

    const { user } = useAuth();
    const queryClient = useQueryClient();
    const { data: watchlist = [] } = useQuery({
        queryKey: ["watchlist"],
        queryFn: getWatchlist,
        enabled: !!user,
        staleTime: 60_000,
    });
    const currentId = f?.id ?? "";
    const isInWatchlist = watchlist.some((i) => i.video_id === currentId);
    const watchlistMutation = useMutation<void | WatchlistItem>({
        mutationFn: () => isInWatchlist ? removeFromWatchlist(currentId) : addToWatchlist(currentId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["watchlist"] });
            toast({ title: isInWatchlist ? "Removed from My List" : "Added to My List" });
        },
        onError: () => toast({ title: "Couldn't update your list", variant: "destructive" }),
    });

    if (isLoading) return <BannerSkeleton />;

    return (
        <section className="pt-16">
            {/* ── Main feature — short editorial split ── */}
            <div className="relative flex h-[58vh] min-h-[400px] overflow-hidden">
                {/* Background image — right half */}
                {featured.map((fi, i) => (
                    <img
                        key={i} src={fi.image} alt={fi.title}
                        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${i === current ? "opacity-100" : "opacity-0"}`}
                        width={1920} height={800}
                    />
                ))}

                {/* Video background — shown when bannerStyle is "video" */}
                {prefs.bannerStyle === "video" && apiSlides.length > 0 && apiSlides[0].videoUrl && (
                    <video
                        autoPlay muted loop playsInline
                        poster={apiSlides[0].image}
                        className="absolute inset-0 w-full h-full object-cover z-[1]"
                    >
                        <source src={apiSlides[0].videoUrl} type="video/mp4" />
                    </video>
                )}
                {/* Gradient overlay: solid left → transparent right */}
                <div className="absolute inset-0 bg-gradient-to-r from-background from-40% via-background/85 to-background/15" />
                <div className="absolute inset-0 bg-gradient-to-t from-background/70 via-transparent to-transparent" />

                {/* Content — left side */}
                <div className={`relative z-10 flex flex-col justify-center px-8 lg:px-14 max-w-[560px] transition-opacity duration-300 ${fading ? "opacity-0" : "opacity-100"}`}>
                    <span className="inline-block text-[10px] font-black text-primary uppercase tracking-[0.25em] mb-3 px-2.5 py-1 bg-primary/15 rounded-sm w-fit">
                        {f.tag}
                    </span>
                    <h1 className="text-3xl md:text-5xl font-black text-foreground leading-tight tracking-tight mb-1"
                        style={{ textShadow: "0 1px 6px rgba(0,0,0,0.4)" }}>
                        {f.title}
                    </h1>
                    <p className="text-sm font-semibold text-primary mb-3">{f.subtitle}</p>
                    <p className="text-[13px] text-muted-foreground leading-relaxed mb-6 max-w-sm">
                        {f.desc}
                    </p>
                    <div className="flex items-center gap-3">
                        <Link href={`/movies/${f.id}`}>
                            <button className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-primary text-primary-foreground text-[13px] font-bold hover:bg-primary/90 transition-colors">
                                <Play size={14} fill="currentColor" /> Watch Now
                            </button>
                        </Link>
                        <button
                                onClick={() => watchlistMutation.mutate()}
                                disabled={watchlistMutation.isPending}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-border text-foreground text-[13px] font-medium hover:bg-surface-hover transition-colors disabled:opacity-60"
                            >
                                {watchlistMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : isInWatchlist ? <Check size={14} /> : <Plus size={14} />}
                                {isInWatchlist ? "Saved" : "Save"}
                            </button>
                    </div>
                    {/* Slide switchers */}
                    {prefs.bannerStyle === "slider" && (
                        <div className="flex gap-2 mt-6">
                            {featured.map((fi, i) => (
                                <button key={i} onClick={() => goTo(i)}
                                    className={`relative w-14 h-10 rounded overflow-hidden transition-all ${i === current ? "ring-2 ring-primary ring-offset-1 ring-offset-background" : "opacity-50 hover:opacity-80"}`}
                                >
                                    <img src={fi.image} alt={fi.title} className="w-full h-full object-cover" width={112} height={80} />
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* ── What's On Now strip ── */}
            <div className="px-8 lg:px-14 py-4 bg-secondary/40 border-y border-border/30">
                <div className="flex items-center gap-6 overflow-x-auto scrollbar-hide">
                    <p className="text-[11px] font-black text-primary uppercase tracking-[0.2em] shrink-0">Live Now</p>
                    {whatsOn.map((w, i) => (
                        <div key={i} className="flex items-center gap-2.5 shrink-0 group cursor-pointer">
                            <img src={w.image} alt={w.title} className="w-16 h-9 object-cover rounded group-hover:brightness-110 transition-all" width={128} height={72} />
                            <div>
                                <p className="text-[11px] font-semibold text-foreground leading-tight">{w.title}</p>
                                <p className="text-[10px] text-muted-foreground">{w.time} · {w.channel}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
