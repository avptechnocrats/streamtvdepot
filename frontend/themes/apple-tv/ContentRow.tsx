/**
 * apple-tv/ContentRow.tsx
 *
 * Apple TV+ inspired content row — portrait poster cards, clean and minimal.
 * Design language:
 *  - Portrait 2:3 ratio cards (movie poster style)
 *  - Rounded corners (rounded-xl) — Apple's signature look
 *  - No visible border at rest; cards blend into the black bg
 *  - Hover: scale up (1.06) + a soft semi-transparent overlay with a white
 *    play circle centred on the card — no neon, no glow
 *  - Row title: clean medium weight, title-case, no monospace or brackets
 *  - Scroll arrows: minimal rounded-full ghost buttons
 */
"use client";

import { Play, Plus } from "lucide-react";
import { useRef } from "react";
import { useUserPrefs } from "@/hooks/use-user-prefs";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ContentRowProps } from "@/types/content";

export default function ContentRow({ title, movies }: ContentRowProps) {
    const rowRef = useRef<HTMLDivElement>(null);
    const { prefs } = useUserPrefs();

    const scroll = (dir: "left" | "right") => {
        if (!rowRef.current) return;
        rowRef.current.scrollBy({ left: dir === "left" ? -480 : 480, behavior: "smooth" });
    };

    return (
        <section className="px-6 lg:px-14 space-y-4">

            {/* Row header */}
            <div className="flex items-center justify-between">
                <h3 className="text-[15px] font-semibold text-white/90 tracking-tight">
                    {title}
                </h3>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => scroll("left")}
                        className="w-7 h-7 flex items-center justify-center rounded-full bg-white/8 text-white/60 hover:bg-white/15 hover:text-white transition-all"
                    >
                        <ChevronLeft size={14} />
                    </button>
                    <button
                        onClick={() => scroll("right")}
                        className="w-7 h-7 flex items-center justify-center rounded-full bg-white/8 text-white/60 hover:bg-white/15 hover:text-white transition-all"
                    >
                        <ChevronRight size={14} />
                    </button>
                </div>
            </div>

            {/* Card row */}
            <div
                ref={rowRef}
                className="flex gap-3 overflow-x-auto scrollbar-hide pb-3"
            >
                {movies.map((movie, i) => (
                    <div
                        key={`${movie.title}-${i}`}
                        className="flex-shrink-0 group/card cursor-pointer content-card"
                    >
                        {/* Poster card — 2:3 portrait */}
                        <div className="relative w-full aspect-[2/3] rounded-xl overflow-hidden bg-card">
                            <img
                                src={movie.image}
                                alt={movie.title}
                                className="w-full h-full object-cover transition-transform duration-500 group-hover/card:scale-[1.06]"
                                loading="lazy"
                                width={300}
                                height={450}
                            />

                            {/* Hover overlay — dark tint + play + add */}
                            <div className="absolute inset-0 bg-black/0 group-hover/card:bg-black/45 transition-all duration-300 flex flex-col items-center justify-center gap-2 opacity-0 group-hover/card:opacity-100">
                                <button className="w-11 h-11 rounded-full bg-white/90 flex items-center justify-center hover:bg-white transition-colors">
                                    <Play size={15} fill="#000" className="translate-x-[1px]" />
                                </button>
                                <button className="w-7 h-7 rounded-full bg-white/20 border border-white/30 flex items-center justify-center hover:bg-white/30 transition-colors">
                                    <Plus size={13} className="text-white" />
                                </button>
                            </div>
                        </div>

                        {/* Card label — detailed mode only */}
                        {prefs.cardStyle === "detailed" && (
                            <div className="mt-2 px-0.5">
                                <p className="text-[12px] font-medium text-white/80 truncate leading-tight">
                                    {movie.title}
                                </p>
                                <div className="flex items-center gap-1.5 text-[11px] text-white/35 mt-0.5">
                                    <span>{movie.year}</span>
                                    <span className="text-primary">{movie.rating}</span>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </section>
    );
}
