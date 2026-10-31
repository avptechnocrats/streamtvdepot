/**
 * ember/Banner.tsx
 *
 * Compact hero below the navbar: featured artwork spanning the full width,
 * a left-hand scrim carrying the title block, edge arrows and pill dots.
 * Always behaves as a slider (a single slide simply hides the controls).
 */
"use client";

import { ChevronLeft, ChevronRight, Film, Play } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type PointerEvent } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useBannerVideos } from "@/hooks/use-banner-videos";
import { useSiteSettings } from "@/hooks/use-site-settings";

const NAV_OFFSET = "pt-14";
const HERO_HEIGHT = "h-[480px] sm:h-[540px] lg:h-[580px]";

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
    const [current, setCurrent] = useState(0);

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
        if (count < 2) return;
        const t = setTimeout(next, 6000);
        return () => clearTimeout(t);
    }, [current, count, next]);

    if (isLoading) {
        return (
            <section className={NAV_OFFSET}>
                <Skeleton className={`w-full ${HERO_HEIGHT} rounded-none`} />
            </section>
        );
    }
    if (count === 0) return <EmptyBanner />;

    const slide = slides[Math.min(current, count - 1)];
    const meta = [slide.year, slide.raw.content_classification, slide.duration, slide.rating].filter(Boolean);
    const shadow = { textShadow: "0 2px 12px rgba(0,0,0,0.8)" };

    return (
        <section className={`${NAV_OFFSET} bg-background`}>
            <div className={`group/banner relative ${HERO_HEIGHT} overflow-hidden`}>
                {slides.map((s, i) => (
                    <img
                        key={s.id}
                        src={s.image}
                        alt={s.title}
                        className={`absolute inset-0 w-full h-full object-cover object-[70%_30%] transition-opacity duration-500 ${i === current ? "opacity-100" : "opacity-0"}`}
                    />
                ))}
                <div className="absolute inset-0 bg-gradient-to-r from-background via-background/70 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background to-transparent" />

                <div className="absolute inset-0 flex items-center px-14 sm:px-16 lg:px-24">
                    <div key={slide.id} className="max-w-xl space-y-3 animate-fade-in">
                        <span className="inline-block px-2.5 py-0.5 text-xs font-semibold tracking-wide border border-primary/70 text-primary rounded bg-primary/10">
                            {slide.classification}
                        </span>
                        <h2
                            className="font-display font-800 uppercase leading-[1.05] text-foreground text-3xl sm:text-4xl lg:text-5xl"
                            style={shadow}
                        >
                            {slide.titleA && <span className="block text-[0.6em] tracking-wider">{slide.titleA}</span>}
                            <span className="block text-gradient-gold">{slide.titleB || slide.title}</span>
                        </h2>
                        {meta.length > 0 && (
                            <p className="flex flex-wrap items-center gap-x-2 text-xs sm:text-sm text-foreground/90" style={shadow}>
                                {meta.map((m, i) => (
                                    <span key={i} className="flex items-center gap-2">
                                        {i > 0 && <span className="text-foreground/40">|</span>}
                                        {m}
                                    </span>
                                ))}
                            </p>
                        )}
                        {slide.description && (
                            <p className="text-sm text-foreground/85 line-clamp-2 max-w-md" style={shadow}>
                                {slide.description}
                            </p>
                        )}
                        <div className="flex items-center gap-3 pt-1">
                            <Link
                                href={`/movies/${slide.id}?play=true`}
                                className="inline-flex items-center gap-2 h-10 px-6 rounded-md text-sm font-semibold text-white bg-[image:var(--ember-gradient)] hover:brightness-110 transition"
                            >
                                <Play size={16} fill="currentColor" /> Play Now
                            </Link>
                            <Link
                                href={`/movies/${slide.id}`}
                                className="inline-flex items-center h-10 px-6 rounded-md text-sm font-semibold text-foreground bg-secondary/80 border border-border hover:bg-secondary transition-colors"
                            >
                                More Info
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
