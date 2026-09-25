/**
 * sunset/ContentRow.tsx
 *
 * Peacock/magazine square cards — title ALWAYS visible at bottom.
 * 1:1 aspect ratio, warmer editorial feel.
 * Row is a horizontal scroll. Each card shows:
 *  - Square image
 *  - Warm accent top-left badge (genre)
 *  - Title + year always visible below (NOT hidden under hover)
 *  - On hover: dark overlay + centred play button
 */
"use client";

import { Play, Plus } from "lucide-react";
import { useRef } from "react";
import { useUserPrefs } from "@/hooks/use-user-prefs";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ContentRowProps } from "@/types/content";

const GENRES = ["Drama", "Action", "Comedy", "Sci-Fi", "Thriller", "Romance"];
const BADGE_COLORS = [
    "bg-orange-500/80",
    "bg-rose-500/80",
    "bg-amber-500/80",
    "bg-cyan-600/80",
    "bg-purple-600/80",
    "bg-emerald-600/80",
];

export default function ContentRow({ title, movies }: ContentRowProps) {
    const rowRef = useRef<HTMLDivElement>(null);
    const { prefs } = useUserPrefs();

    const scroll = (dir: "left" | "right") => {
        rowRef.current?.scrollBy({ left: dir === "left" ? -440 : 440, behavior: "smooth" });
    };

    return (
        <section className="px-6 lg:px-14 space-y-3">
            {/* Row header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="w-1 h-5 rounded-full bg-primary" />
                    <h3 className="text-[15px] font-bold text-foreground">{title}</h3>
                </div>
                <div className="flex items-center gap-1">
                    <button onClick={() => scroll("left")} className="w-7 h-7 rounded-full border border-border/60 text-muted-foreground hover:text-foreground hover:border-border transition-all flex items-center justify-center">
                        <ChevronLeft size={14} />
                    </button>
                    <button onClick={() => scroll("right")} className="w-7 h-7 rounded-full border border-border/60 text-muted-foreground hover:text-foreground hover:border-border transition-all flex items-center justify-center">
                        <ChevronRight size={14} />
                    </button>
                </div>
            </div>

            {/* Square card scroll */}
            <div ref={rowRef} className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
                {movies.map((movie, i) => {
                    const genre = GENRES[i % GENRES.length];
                    const badgeColor = BADGE_COLORS[i % BADGE_COLORS.length];

                    return (
                        <div key={`${movie.title}-${i}`} className="flex-shrink-0 w-40 md:w-44 group/card cursor-pointer">
                            {/* Square image */}
                            <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-secondary">
                                <img
                                    src={movie.image} alt={movie.title}
                                    className="w-full h-full object-cover transition-transform duration-400 group-hover/card:scale-105"
                                    loading="lazy" width={400} height={400}
                                />
                                {/* Genre badge top-left */}
                                <span className={`absolute top-2 left-2 ${badgeColor} text-white text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-sm`}>
                                    {genre}
                                </span>
                                {/* Hover overlay */}
                                <div className="absolute inset-0 bg-black/0 group-hover/card:bg-black/50 transition-colors duration-250 flex items-center justify-center gap-2 opacity-0 group-hover/card:opacity-100">
                                    <button className="w-10 h-10 rounded-full bg-primary/90 flex items-center justify-center hover:bg-primary transition-colors">
                                        <Play size={14} fill="currentColor" className="text-primary-foreground translate-x-[1px]" />
                                    </button>
                                    <button className="w-7 h-7 rounded-full bg-white/20 border border-white/30 flex items-center justify-center hover:bg-white/30 transition-colors">
                                        <Plus size={12} className="text-white" />
                                    </button>
                                </div>
                            </div>

                            {/* Card info — visible in detailed mode */}
                            {prefs.cardStyle === "detailed" && (
                                <div className="mt-2">
                                    <p className="text-[12px] font-semibold text-foreground truncate leading-snug">{movie.title}</p>
                                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
                                        <span>{movie.year}</span>
                                        <span className="text-primary">{movie.rating}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
