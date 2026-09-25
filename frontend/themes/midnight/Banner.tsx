/**
 * midnight/Banner.tsx
 *
 * HBO Max editorial split-screen hero.
 * Layout: full viewport, LEFT half = dark content panel, RIGHT half = movie image.
 * The image has a strong left-edge fade so panels blend together.
 * Content panel: eyebrow label, large title, stars rating row, description, buttons.
 * Below the split: a "Now Trending" horizontal scroll strip of small thumbnails.
 */
"use client";

import { Play, Plus, Star } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useUserPrefs } from "@/hooks/use-user-prefs";
import { useBannerVideos, type BannerSlide } from "@/hooks/use-banner-videos";
import { BannerSkeleton } from "@/components/BannerSkeleton";

type SlideData = {
    image: string; label: string; title: string; genre: string;
    year: string; rating: string; seasons: string; desc: string;
};

function mapToSlide(s: BannerSlide): SlideData {
    return {
        image: s.image,
        label: s.classification,
        title: s.title,
        genre: s.raw.categories?.[0] ?? s.classification,
        year: s.year,
        rating: s.raw.rating?.toFixed(1) ?? "N/A",
        seasons: s.duration || "Film",
        desc: s.description,
    };
}

const trending = [
    { image: "/images/movie-1.jpg", title: "Shadow Walker" },
    { image: "/images/movie-2.jpg", title: "Abyss" },
    { image: "/images/movie-3.jpg", title: "Dune: Part III" },
    { image: "/images/movie-4.jpg", title: "Night Detective" },
    { image: "/images/movie-5.jpg", title: "Cipher" },
    { image: "/images/movie-6.jpg", title: "Gravity's Edge" },
];

export default function Banner() {
    const [current, setCurrent] = useState(0);
    const [fading, setFading] = useState(false);
    const { prefs } = useUserPrefs();
    const { slides: apiSlides, isLoading } = useBannerVideos();
    const slides = apiSlides.map(mapToSlide);

    const goTo = useCallback((idx: number) => {
        if (fading) return;
        setFading(true);
        setTimeout(() => { setCurrent(idx); setFading(false); }, 350);
    }, [fading]);

    const next = useCallback(() => goTo((current + 1) % slides.length), [current, goTo, slides.length]);
    useEffect(() => { if (prefs.bannerStyle === "static") return; const t = setTimeout(next, 8000); return () => clearTimeout(t); }, [current, next, prefs.bannerStyle]);

    const s = slides[current];

    if (isLoading) return <BannerSkeleton />;

    return (
        <section className="pt-[88px]">
            {/* ── Split hero ── */}
            <div className="relative flex h-[70vh] min-h-[480px] overflow-hidden">

                {/* RIGHT — movie image */}
                <div className="absolute inset-0">
                    {slides.map((sl, i) => (
                        <img
                            key={i}
                            src={sl.image}
                            alt={sl.title}
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
                    {/* Left-to-right fade so content panel shows through */}
                    <div className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/10" />
                    <div className="absolute inset-0 bg-gradient-to-t from-background/60 via-transparent to-transparent" />
                </div>

                {/* LEFT — content panel */}
                <div className={`relative z-10 flex flex-col justify-center pl-8 lg:pl-14 pr-6 w-full max-w-[580px] transition-opacity duration-350 ${fading ? "opacity-0" : "opacity-100"}`}>
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-primary tracking-[0.25em] uppercase mb-4">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                        {s.label}
                    </span>

                    <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-foreground leading-[1.0] tracking-tight mb-3">
                        {s.title}
                    </h1>

                    <div className="flex items-center gap-3 text-sm text-muted-foreground mb-3">
                        <span className="flex items-center gap-1 text-primary font-semibold">
                            <Star size={13} fill="currentColor" /> {s.rating}
                        </span>
                        <span>{s.year}</span>
                        <span className="border border-border/60 rounded px-1.5 py-0.5 text-[11px]">{s.seasons}</span>
                        <span className="text-xs">{s.genre}</span>
                    </div>

                    <p className="text-[13px] text-muted-foreground leading-relaxed mb-7 max-w-md">
                        {s.desc}
                    </p>

                    <div className="flex items-center gap-3">
                        <button className="flex items-center gap-2 px-7 py-2.5 bg-primary text-primary-foreground text-[13px] font-bold rounded-sm hover:bg-primary/90 transition-colors">
                            <Play size={15} fill="currentColor" /> Play
                        </button>
                        <button className="flex items-center gap-2 px-5 py-2.5 bg-secondary text-secondary-foreground text-[13px] font-medium rounded-sm hover:bg-surface-hover transition-colors border border-border/50">
                            <Plus size={15} /> Watchlist
                        </button>
                    </div>

                    {/* Slide controls */}
                    {prefs.bannerStyle === "slider" && (
                        <div className="flex gap-2 mt-8">
                            {slides.map((_, i) => (
                                <button key={i} onClick={() => goTo(i)}
                                    className={`h-[3px] rounded-full transition-all duration-300 ${i === current ? "w-8 bg-primary" : "w-4 bg-border hover:bg-muted-foreground"}`}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Now Trending strip ── */}
            <div className="px-8 lg:px-14 pt-5 pb-2">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em] mb-3">Now Trending</p>
                <div className="flex gap-2.5 overflow-x-auto scrollbar-hide">
                    {trending.map((t, i) => (
                        <div key={i} className="flex-shrink-0 relative group cursor-pointer">
                            <img
                                src={t.image} alt={t.title} width={160} height={90}
                                className="w-36 h-20 object-cover rounded-sm group-hover:brightness-110 transition-all"
                            />
                            <span className="absolute bottom-1 left-1 text-[9px] font-bold text-white/80 bg-black/60 px-1 rounded">
                                #{i + 1}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
