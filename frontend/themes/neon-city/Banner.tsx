/**
 * neon-city/Banner.tsx
 *
 * Neon City theme hero — always a full-screen slider (no static option).
 * Differences from dark-gold:
 *  - Scan-line overlay for a CRT/gaming screen aesthetic
 *  - Neon glow on the title text
 *  - Content is CENTER-aligned (vs left in dark-gold)
 *  - Buttons are outlined neon style (border + glow), not filled
 *  - Slide indicators at bottom are neon dot-dashes (not circles)
 *  - Badge is a bracketed monospace tag [FEATURED] not a star pill
 */
"use client";

import { Play, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import { useUserPrefs } from "@/hooks/use-user-prefs";
import { useBannerVideos, type BannerSlide } from "@/hooks/use-banner-videos";
import { BannerSkeleton } from "@/components/BannerSkeleton";

type SlideData = {
    image: string; badge: string; titleA: string; titleB: string;
    desc: string; match: string; year: string; formats: string[]; duration: string;
};

function mapToSlide(s: BannerSlide): SlideData {
    return {
        image: s.image,
        badge: `[ ${s.classification.toUpperCase()} ]`,
        titleA: s.titleA,
        titleB: s.titleB,
        desc: s.description,
        match: s.raw.rating ? `${Math.round(s.raw.rating * 10)}%` : "—",
        year: s.year,
        formats: ["4K"],
        duration: s.duration,
    };
}

export default function Banner() {
    const [current, setCurrent] = useState(0);
    const [transitioning, setTransitioning] = useState(false);
    const { prefs } = useUserPrefs();
    const { slides: apiSlides, isLoading } = useBannerVideos();
    const slides = apiSlides.map(mapToSlide);

    const goTo = useCallback((idx: number) => {
        if (transitioning) return;
        setTransitioning(true);
        setTimeout(() => { setCurrent(idx); setTransitioning(false); }, 350);
    }, [transitioning]);

    const prev = () => goTo((current - 1 + slides.length) % slides.length);
    const next = useCallback(() => goTo((current + 1) % slides.length), [current, goTo, slides.length]);

    useEffect(() => {
        if (prefs.bannerStyle === "static") return;
        const t = setTimeout(next, 7000);
        return () => clearTimeout(t);
    }, [current, next, prefs.bannerStyle]);

    const slide = slides[current];

    if (isLoading) return <BannerSkeleton />;

    return (
        <section className="relative w-full h-[90vh] min-h-[520px] overflow-hidden">
            {/* Slide images */}
            {slides.map((s, i) => (
                <img
                    key={i}
                    src={s.image}
                    alt={`${s.titleA} ${s.titleB}`}
                    className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${i === current ? "opacity-100" : "opacity-0"}`}
                    width={1920}
                    height={800}
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

            {/* Gradient overlay */}
            <div className="banner-overlay absolute inset-0" />

            {/* ── Scan-line CRT overlay (unique to Neon City) ── */}
            <div
                className="absolute inset-0 pointer-events-none z-10 opacity-[0.04]"
                style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, #000 2px, #000 4px)" }}
            />

            {/* ── Neon corner brackets (decorative) ── */}
            <div className="absolute top-24 left-8 w-8 h-8 border-t-2 border-l-2 border-primary/60 z-20 shadow-[0_0_10px_hsl(var(--primary)/0.5)]" />
            <div className="absolute top-24 right-8 w-8 h-8 border-t-2 border-r-2 border-primary/60 z-20 shadow-[0_0_10px_hsl(var(--primary)/0.5)]" />

            {/* ── Content — CENTER aligned ── */}
            <div className={`absolute inset-0 z-20 flex flex-col items-center justify-end pb-28 px-6 text-center transition-opacity duration-350 ${transitioning ? "opacity-0" : "opacity-100"}`}>

                {/* Badge */}
                <span className="inline-block text-[10px] font-mono font-bold tracking-[0.25em] text-primary border border-primary/50 px-3 py-1 mb-5 shadow-[0_0_10px_hsl(var(--primary)/0.4)]">
                    {slide.badge}
                </span>

                {/* Title */}
                <div className="mb-4">
                    <h1 className="text-5xl md:text-7xl font-display font-800 text-white leading-none uppercase tracking-tight"
                        style={{ textShadow: "0 0 30px hsl(var(--primary)/0.6), 0 0 60px hsl(var(--primary)/0.3)" }}>
                        {slide.titleA}
                    </h1>
                    <h1 className="text-5xl md:text-7xl font-display font-800 leading-none uppercase tracking-tight text-gradient-gold"
                        style={{ filter: "drop-shadow(0 0 20px hsl(var(--primary)/0.7))" }}>
                        {slide.titleB}
                    </h1>
                </div>

                {/* Meta */}
                <div className="flex items-center gap-3 mb-4 text-xs font-mono text-muted-foreground">
                    <span className="text-primary font-bold">{slide.match} Match</span>
                    <span>·</span>
                    <span>{slide.year}</span>
                    <span>·</span>
                    {slide.formats.map((f) => (
                        <span key={f} className="border border-muted-foreground/40 px-1.5 py-0.5 rounded-[2px] text-[10px]">{f}</span>
                    ))}
                    <span>·</span>
                    <span>{slide.duration}</span>
                </div>

                {/* Description */}
                <p className="max-w-lg text-sm text-muted-foreground mb-7 leading-relaxed hidden md:block">
                    {slide.desc}
                </p>

                {/* Neon outlined buttons */}
                <div className="flex items-center gap-3">
                    <button className="flex items-center gap-2 px-6 py-2.5 border border-primary text-primary text-sm font-semibold hover:bg-primary hover:text-primary-foreground transition-all shadow-[0_0_12px_hsl(var(--primary)/0.4)] hover:shadow-[0_0_20px_hsl(var(--primary)/0.7)]">
                        <Play size={16} fill="currentColor" />
                        Play
                    </button>
                    <button className="flex items-center gap-2 px-6 py-2.5 border border-white/20 text-white/80 text-sm font-semibold hover:bg-white/10 hover:border-white/40 transition-all">
                        <Plus size={16} />
                        Watchlist
                    </button>
                </div>
            </div>

            {/* ── Slide controls — slider mode only ── */}
            {prefs.bannerStyle === "slider" && (
                <>
                    <button onClick={prev} className="absolute left-4 top-1/2 -translate-y-1/2 z-20 w-9 h-9 flex items-center justify-center border border-primary/40 text-primary/80 hover:text-primary hover:border-primary hover:shadow-[0_0_12px_hsl(var(--primary)/0.5)] transition-all">
                        <ChevronLeft size={18} />
                    </button>
                    <button onClick={next} className="absolute right-4 top-1/2 -translate-y-1/2 z-20 w-9 h-9 flex items-center justify-center border border-primary/40 text-primary/80 hover:text-primary hover:border-primary hover:shadow-[0_0_12px_hsl(var(--primary)/0.5)] transition-all">
                        <ChevronRight size={18} />
                    </button>
                    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
                        {slides.map((_, i) => (
                            <button
                                key={i}
                                onClick={() => goTo(i)}
                                className={`h-[3px] rounded-none transition-all ${i === current
                                    ? "w-8 bg-primary shadow-[0_0_6px_hsl(var(--primary)/0.8)]"
                                    : "w-4 bg-white/30 hover:bg-white/50"
                                    }`}
                            />
                        ))}
                    </div>
                </>
            )}
        </section>
    );
}
