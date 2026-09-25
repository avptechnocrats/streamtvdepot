/**
 * cinema-red/Banner.tsx
 *
 * MUBI Film of the Day — full screen, one film at a time.
 * Completely centred: year · director · runtime on top, title dominates the screen,
 * a single "Watch Film" button at bottom centre.
 * Subtle vignette gradient. Minimal info, maximum atmosphere.
 * No multiple slides — one featured film rotates with a fade.
 */
"use client";

import { Play } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useUserPrefs } from "@/hooks/use-user-prefs";
import { useBannerVideos, type BannerSlide } from "@/hooks/use-banner-videos";
import { BannerSkeleton } from "@/components/BannerSkeleton";

type FilmData = {
    image: string; year: string; country: string; director: string;
    runtime: string; title: string; tagline: string; genre: string;
};

function mapToFilm(s: BannerSlide): FilmData {
    const director = s.raw.cast_crew.find((c) => c.role === "Director");
    return {
        image: s.image,
        year: s.year,
        country: "—",
        director: director ? director.name : "—",
        runtime: s.duration || "—",
        title: s.title,
        tagline: s.description || s.title,
        genre: s.raw.categories?.[0] ?? s.classification,
    };
}

export default function Banner() {
    const [current, setCurrent] = useState(0);
    const [visible, setVisible] = useState(true);
    const { prefs } = useUserPrefs();
    const { slides: apiSlides, isLoading } = useBannerVideos();
    const films = apiSlides.map(mapToFilm);

    const goTo = useCallback((idx: number) => {
        setVisible(false);
        setTimeout(() => { setCurrent(idx); setVisible(true); }, 600);
    }, []);

    const next = useCallback(() => goTo((current + 1) % films.length), [current, goTo, films.length]);
    useEffect(() => { if (prefs.bannerStyle === "static") return; const t = setTimeout(next, 10000); return () => clearTimeout(t); }, [current, next, prefs.bannerStyle]);

    const f = films[current];

    if (isLoading) return <BannerSkeleton />;

    return (
        <section className="relative w-full h-screen min-h-[600px] overflow-hidden">
            {/* Background images */}
            {films.map((fi, i) => (
                <img
                    key={i} src={fi.image} alt={fi.title}
                    className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${i === current ? "opacity-100" : "opacity-0"}`}
                    width={1920} height={1080}
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

            {/* Heavy vignette — all edges */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_20%,black/60_70%,black/90_100%)]" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/60" />

            {/* Content — fully centred */}
            <div className={`absolute inset-0 flex flex-col items-center justify-center text-center px-6 transition-opacity duration-600 ${visible ? "opacity-100" : "opacity-0"}`}>

                {/* Film metadata row */}
                <div className="flex items-center gap-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.25em] mb-8">
                    <span>{f.year}</span>
                    <span className="w-1 h-1 rounded-full bg-primary" />
                    <span>{f.country}</span>
                    <span className="w-1 h-1 rounded-full bg-primary" />
                    <span>Dir. {f.director}</span>
                    <span className="w-1 h-1 rounded-full bg-primary" />
                    <span>{f.runtime}</span>
                </div>

                {/* Genre label */}
                <p className="text-[11px] font-medium text-primary/70 tracking-[0.2em] uppercase mb-5">
                    {f.genre}
                </p>

                {/* Title — the centrepiece */}
                <h1 className="text-5xl md:text-7xl lg:text-8xl font-black text-white leading-[0.95] tracking-tight mb-5 max-w-4xl">
                    {f.title}
                </h1>

                {/* Tagline */}
                <p className="text-[14px] md:text-[16px] text-white/40 italic font-light mb-12 max-w-md leading-relaxed">
                    "{f.tagline}"
                </p>

                {/* Watch button */}
                <button className="flex items-center gap-3 px-8 py-3 border border-foreground/30 text-foreground text-[13px] font-semibold tracking-wider uppercase hover:bg-foreground/10 hover:border-foreground/60 transition-all rounded-sm">
                    <Play size={14} fill="currentColor" />
                    Watch Film
                </button>
            </div>

            {/* Film counter + switchers — slider mode only */}
            {prefs.bannerStyle === "slider" && (
                <div className="absolute bottom-8 right-8 flex items-center gap-3 z-10">
                    {films.map((_, i) => (
                        <button key={i} onClick={() => goTo(i)}
                            className={`transition-all duration-300 ${i === current ? "text-white font-bold text-[13px]" : "text-muted-foreground text-[11px] hover:text-foreground"}`}
                        >
                            {String(i + 1).padStart(2, "0")}
                        </button>
                    ))}
                </div>
            )}

            {/* "Film of the Day" label — bottom left */}
            <div className="absolute bottom-8 left-8 z-10">
                <p className="text-[10px] font-bold text-primary/60 uppercase tracking-[0.25em]">Film of the Day</p>
            </div>
        </section>
    );
}
