/**
 * emerald/Banner.tsx
 *
 * Amazon Prime Video style — feature billboard.
 * Left: large featured movie with "Top Pick" badge, description, buy/rent buttons.
 * Right: a vertical "Continue Watching" mini-list with progress bars.
 * Below: a "More to Watch" horizontal thumbnail strip.
 */
"use client";

import { Play, Plus, ThumbsUp, Download } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useUserPrefs } from "@/hooks/use-user-prefs";
import { useBannerVideos, type BannerSlide } from "@/hooks/use-banner-videos";
import { BannerSkeleton } from "@/components/BannerSkeleton";

type FeaturedData = {
    image: string; badge: string; title: string;
    desc: string; year: string; rating: string; duration: string; score: string;
};

function mapToFeatured(s: BannerSlide): FeaturedData {
    return {
        image: s.image,
        badge: s.classification,
        title: s.title,
        desc: s.description,
        year: s.year,
        rating: s.rating || "N/A",
        duration: s.duration,
        score: s.raw.rating ? `${Math.round(s.raw.rating * 10)}` : "97",
    };
}

const continueWatching = [
    { image: "/images/movie-1.jpg", title: "Shadow Walker", progress: 72, episode: "Ep. 4" },
    { image: "/images/movie-2.jpg", title: "Abyss", progress: 35, episode: "Ep. 2" },
    { image: "/images/movie-5.jpg", title: "Cipher", progress: 58, episode: "Ep. 6" },
];

export default function Banner() {
    const [current, setCurrent] = useState(0);
    const { prefs } = useUserPrefs();
    const { slides: apiSlides, isLoading } = useBannerVideos();
    const featured = apiSlides.map(mapToFeatured);
    const next = useCallback(() => setCurrent((c) => (c + 1) % featured.length), [featured.length]);
    useEffect(() => { if (prefs.bannerStyle === "static") return; const t = setTimeout(next, 9000); return () => clearTimeout(t); }, [current, next, prefs.bannerStyle]);
    const f = featured[current];

    if (isLoading) return <BannerSkeleton />;

    return (
        <section className="pt-[88px] bg-background">
            {/* ── Main billboard ── */}
            <div className="relative overflow-hidden">
                {/* Background image */}
                {featured.map((fi, i) => (
                    <img
                        key={i} src={fi.image} alt={fi.title}
                        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${i === current ? "opacity-100" : "opacity-0"}`}
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
                <div className="absolute inset-0 bg-gradient-to-r from-background via-background/70 to-background/20" />
                <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />

                <div className="relative z-10 flex items-stretch min-h-[62vh] px-6 lg:px-12">
                    {/* LEFT — main feature */}
                    <div className="flex-1 flex flex-col justify-end pb-10 max-w-[520px]">
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-black text-primary tracking-[0.22em] uppercase mb-3">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                            {f.badge}
                        </span>
                        <h1 className="text-4xl md:text-5xl font-black text-foreground tracking-tight leading-[1.05] mb-3">
                            {f.title}
                        </h1>
                        <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground mb-3">
                            <span className="text-primary font-bold">{f.score}% liked</span>
                            <span>{f.year}</span>
                            <span className="border border-border/60 px-1.5 py-0.5 rounded text-[10px]">{f.rating}</span>
                            <span>{f.duration}</span>
                        </div>
                        <p className="text-[13px] text-muted-foreground leading-relaxed mb-6 max-w-md">{f.desc}</p>
                        <div className="flex flex-wrap items-center gap-2">
                            <button className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground text-[13px] font-bold rounded-md hover:bg-primary/90 transition-colors">
                                <Play size={14} fill="currentColor" /> Watch Now
                            </button>
                            <button className="flex items-center gap-2 px-4 py-2.5 bg-secondary border border-border/50 text-foreground text-[13px] font-medium rounded-md hover:bg-surface-hover transition-colors">
                                <Plus size={14} /> Watchlist
                            </button>
                            <button className="flex items-center gap-2 px-4 py-2.5 bg-secondary border border-border/50 text-foreground text-[13px] font-medium rounded-md hover:bg-surface-hover transition-colors">
                                <ThumbsUp size={14} /> Like
                            </button>
                            <button className="p-2.5 bg-secondary border border-border/50 text-muted-foreground rounded-md hover:bg-surface-hover transition-colors">
                                <Download size={14} />
                            </button>
                        </div>
                    </div>

                    {/* RIGHT — Continue Watching panel */}
                    <div className="hidden lg:flex flex-col justify-end pb-10 pl-12 w-72 shrink-0">
                        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.18em] mb-3">Continue Watching</p>
                        <div className="space-y-3">
                            {continueWatching.map((w, i) => (
                                <div key={i} className="flex items-center gap-3 group cursor-pointer">
                                    <div className="relative w-24 aspect-video rounded overflow-hidden shrink-0">
                                        <img src={w.image} alt={w.title} className="w-full h-full object-cover group-hover:brightness-110 transition-all" width={192} height={108} />
                                        <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-border/50">
                                            <div className="h-full bg-primary transition-all" style={{ width: `${w.progress}%` }} />
                                        </div>
                                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <div className="w-6 h-6 rounded-full bg-primary/80 flex items-center justify-center">
                                                <Play size={9} fill="currentColor" className="text-primary-foreground translate-x-[0.5px]" />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[12px] font-semibold text-foreground/90 truncate">{w.title}</p>
                                        <p className="text-[10px] text-muted-foreground">{w.episode} · {w.progress}%</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
