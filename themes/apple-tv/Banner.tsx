/**
 * apple-tv/Banner.tsx
 *
 * Apple TV+ inspired hero — cinematic, clean, no cyber effects.
 * Design language:
 *  - Full-viewport image, content left-aligned
 *  - Gradient: black bleeds in from the left + bottom (not just bottom)
 *  - Title: large, clean, title-case — NOT all-caps, no text-shadow glow
 *  - "Play" button: solid white pill, dark text (Apple's style)
 *  - "More Info" button: semi-transparent dark/white pill
 *  - Meta row: muted small text — year · rating · duration
 *  - Slide indicators: small rounded dots at the bottom
 *  - No scan-line, no neon brackets, no corner decorations
 */
"use client";

import { Play, Info, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import { useUserPrefs } from "@/hooks/use-user-prefs";
import { useBannerVideos, type BannerSlide } from "@/hooks/use-banner-videos";
import { BannerSkeleton } from "@/components/BannerSkeleton";

type SlideData = {
    image: string; eyebrow: string; title: string;
    desc: string; year: string; rating: string; duration: string;
};

function mapToSlide(s: BannerSlide): SlideData {
    return {
        image: s.image,
        eyebrow: s.raw.content_classification ?? "Now Streaming",
        title: s.title,
        desc: s.description,
        year: s.year,
        rating: s.rating || "N/A",
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
        setTimeout(() => { setCurrent(idx); setTransitioning(false); }, 400);
    }, [transitioning]);

    const prev = () => goTo((current - 1 + slides.length) % slides.length);
    const next = useCallback(() => goTo((current + 1) % slides.length), [current, goTo, slides.length]);

    useEffect(() => {
        if (prefs.bannerStyle === "static") return;
        const t = setTimeout(next, 8000);
        return () => clearTimeout(t);
    }, [current, next, prefs.bannerStyle]);

    const slide = slides[current];

    if (isLoading) return <BannerSkeleton />;

    return (
        <section className="relative w-full h-[88vh] min-h-[500px] overflow-hidden">

            {/* Slide images */}
            {slides.map((s, i) => (
                <img
                    key={i}
                    src={s.image}
                    alt={s.title}
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

            {/* Gradient: black bleeds from left + bottom — strengthened for bright images */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/60 to-black/10" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30" />
            <div className="banner-overlay absolute inset-0" />

            {/* Content — LEFT aligned */}
            <div className={`absolute inset-0 z-10 flex flex-col justify-end pb-24 px-8 lg:px-16 max-w-2xl transition-opacity duration-400 ${transitioning ? "opacity-0" : "opacity-100"}`}>

                {/* Eyebrow */}
                <p className="text-[11px] font-semibold text-primary tracking-[0.18em] uppercase mb-3"
                    style={{ textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}>
                    {slide.eyebrow}
                </p>

                {/* Title */}
                <h1 className="text-4xl md:text-6xl font-bold text-white leading-[1.05] tracking-tight mb-4"
                    style={{ textShadow: "0 2px 8px rgba(0,0,0,0.95), 0 4px 20px rgba(0,0,0,0.7)" }}>
                    {slide.title}
                </h1>

                {/* Meta */}
                <div className="flex items-center gap-2 text-[12px] text-white/80 mb-4 font-medium"
                    style={{ textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}>
                    <span>{slide.year}</span>
                    <span className="border border-white/40 rounded px-1.5 py-0.5 text-[10px] bg-black/20 backdrop-blur-sm">{slide.rating}</span>
                    <span>{slide.duration}</span>
                </div>

                {/* Description */}
                <p className="text-[13px] text-white/85 leading-relaxed mb-7 max-w-lg hidden md:block"
                    style={{ textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}>
                    {slide.desc}
                </p>

                {/* Buttons — Apple style */}
                <div className="flex items-center gap-3">
                    <button className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-white text-black text-[13px] font-semibold hover:bg-white/90 active:scale-[0.97] transition-all">
                        <Play size={14} fill="currentColor" />
                        Play
                    </button>
                    <button className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-black/40 backdrop-blur-sm text-white text-[13px] font-medium hover:bg-black/55 active:scale-[0.97] transition-all border border-white/25">
                        <Info size={14} />
                        More Info
                    </button>
                </div>
            </div>

            {/* Slide controls — slider mode only */}
            {prefs.bannerStyle === "slider" && (
                <>
                    <button
                        onClick={prev}
                        className="absolute left-4 top-1/2 -translate-y-1/2 z-20 w-9 h-9 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-sm text-white/70 hover:bg-black/60 hover:text-white transition-all"
                    >
                        <ChevronLeft size={18} />
                    </button>
                    <button
                        onClick={next}
                        className="absolute right-4 top-1/2 -translate-y-1/2 z-20 w-9 h-9 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-sm text-white/70 hover:bg-black/60 hover:text-white transition-all"
                    >
                        <ChevronRight size={18} />
                    </button>
                    <div className="absolute bottom-9 left-8 lg:left-16 z-20 flex items-center gap-2">
                        {slides.map((_, i) => (
                            <button
                                key={i}
                                onClick={() => goTo(i)}
                                className={`rounded-full transition-all duration-300 ${i === current
                                    ? "w-5 h-[5px] bg-white"
                                    : "w-[5px] h-[5px] bg-white/35 hover:bg-white/60"
                                    }`}
                            />
                        ))}
                    </div>
                </>
            )}
        </section>
    );
}
