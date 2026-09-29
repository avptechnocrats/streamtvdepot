/**
 * neon-city/ContentRow.tsx
 *
 * Neon City theme content rows — landscape 16:9 cards.
 * Differences from dark-gold:
 *  - Card aspect ratio is 16:9 (widescreen) instead of 2:3 (portrait)
 *  - Cards are wider and shorter (TV/game thumbnail style)
 *  - Hover: neon glow border + title slides up from bottom
 *  - No cardStyle user pref — this theme always uses its own card design
 *  - Row title is monospace + bracketed like the hero badge
 */
"use client";

import { Play, Plus, Star } from "lucide-react";
import { useRef } from "react";
import { useUserPrefs } from "@/hooks/use-user-prefs";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ContentRowProps } from "@/types/content";
import Image from "next/image";
import Link from "next/link";

const GENRES = ["Action", "Drama", "Thriller", "Sci-Fi", "Mystery", "Adventure"];

export default function ContentRow({ title, movies }: ContentRowProps) {
    const rowRef = useRef<HTMLDivElement>(null);
    const { prefs } = useUserPrefs();

    const scroll = (dir: "left" | "right") => {
        if (!rowRef.current) return;
        rowRef.current.scrollBy({ left: dir === "left" ? -420 : 420, behavior: "smooth" });
    };

    return (
        <section className="px-6 lg:px-12 space-y-4">
            {/* Section heading — monospace neon style */}
            <div className="flex items-center justify-between">
                <h3 className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-primary">
                    <span className="text-muted-foreground/60">// </span>{title}
                </h3>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => scroll("left")}
                        className="w-7 h-7 flex items-center justify-center border border-primary/30 text-primary/60 hover:text-primary hover:border-primary hover:shadow-[0_0_8px_hsl(var(--primary)/0.4)] transition-all"
                    >
                        <ChevronLeft size={14} />
                    </button>
                    <button
                        onClick={() => scroll("right")}
                        className="w-7 h-7 flex items-center justify-center border border-primary/30 text-primary/60 hover:text-primary hover:border-primary hover:shadow-[0_0_8px_hsl(var(--primary)/0.4)] transition-all"
                    >
                        <ChevronRight size={14} />
                    </button>
                </div>
            </div>

            {/* Landscape card row */}
            <div
                ref={rowRef}
                className="flex gap-3 overflow-x-auto scrollbar-hide pb-2"
            >
                {movies.map((movie, i) => {
                    const genre = GENRES[i % GENRES.length];
                    return (
                        <Link
                            key={movie.id || `${movie.title}-${i}`}
                            href={movie.id ? `/movies/${movie.id}` : "#"}
                            className="flex-shrink-0 w-56 md:w-64 group/card cursor-pointer"
                            tabIndex={0}
                        >
                            {/* 16:9 landscape card */}
                            <div className="relative w-full aspect-video bg-secondary overflow-hidden border border-border/50 group-hover/card:border-primary/60 group-hover/card:shadow-[0_0_16px_hsl(var(--primary)/0.25)] transition-all duration-300">
                                <Image
                                    src={movie.image}
                                    alt={movie.title}
                                    fill
                                    className="object-cover transition-transform duration-500 group-hover/card:scale-110"
                                    sizes="(max-width: 640px) 50vw, 270px"
                                />

                                {/* Genre tag top-left */}
                                <div className="absolute top-0 left-0 z-10">
                                    <span className="block text-[9px] font-mono font-bold uppercase tracking-wider bg-primary text-primary-foreground px-2 py-0.5">
                                        {genre}
                                    </span>
                                </div>

                                {/* Hover overlay — slides up */}
                                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent translate-y-full group-hover/card:translate-y-0 transition-transform duration-300 ease-out flex flex-col justify-end p-3 gap-2">
                                    <p className="text-xs font-semibold text-foreground leading-tight line-clamp-1">{movie.title}</p>
                                    <div className="flex items-center gap-2">
                                        <button className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-primary text-primary-foreground text-[11px] font-bold hover:bg-primary/90 transition-colors shadow-[0_0_8px_hsl(var(--primary)/0.5)]">
                                            <Play size={10} fill="currentColor" />
                                            Play
                                        </button>
                                        <button className="w-8 h-7 flex items-center justify-center border border-white/20 text-white/70 hover:bg-white/10 transition-colors">
                                            <Plus size={12} />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Card footer — detailed mode only */}
                            {prefs.cardStyle === "detailed" && (
                                <>
                                    <div className="mt-1.5 flex items-center justify-between gap-2">
                                        <p className="text-xs font-medium text-foreground truncate">{movie.title}</p>
                                        <div className="flex items-center gap-1 text-[10px] text-primary shrink-0 font-mono">
                                            <Star size={9} fill="currentColor" />
                                            {movie.rating.replace("\u2605 ", "")}
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-muted-foreground font-mono">{movie.year}</p>
                                </>
                            )}
                        </Link>
                    );
                })}
            </div>
        </section>
    );
}
