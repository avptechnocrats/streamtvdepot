/**
 * emerald/ContentRow.tsx
 *
 * Prime Video mixed-layout row.
 * First item in each row is a "spotlight" card — 2× wider.
 * Rest are standard portrait cards.
 * Spotlight card shows title + description + buttons overlay.
 * Standard cards: portrait 2:3 with title below.
 */
"use client";

import { Play, Plus, Star } from "lucide-react";
import { useRef } from "react";
import { useUserPrefs } from "@/hooks/use-user-prefs";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ContentRowProps } from "@/types/content";

export default function ContentRow({ title, movies }: ContentRowProps) {
    const rowRef = useRef<HTMLDivElement>(null);
    const { prefs } = useUserPrefs();

    const scroll = (dir: "left" | "right") => {
        rowRef.current?.scrollBy({ left: dir === "left" ? -460 : 460, behavior: "smooth" });
    };

    const [spotlight, ...rest] = movies;

    return (
        <section className="px-4 lg:px-10 space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between px-2">
                <h3 className="text-[14px] font-bold text-foreground">{title}</h3>
                <div className="flex items-center gap-1">
                    <button onClick={() => scroll("left")} className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors">
                        <ChevronLeft size={16} />
                    </button>
                    <button onClick={() => scroll("right")} className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors">
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>

            {/* Card row */}
            <div ref={rowRef} className="flex gap-2.5 overflow-x-auto scrollbar-hide pb-2">
                {/* Spotlight card — 2× wider, landscape */}
                {spotlight && (
                    <div className="flex-shrink-0 w-64 group/spot cursor-pointer">
                        <div className="relative w-full aspect-[16/11] rounded-md overflow-hidden bg-secondary">
                            <img
                                src={spotlight.image} alt={spotlight.title}
                                className="w-full h-full object-cover transition-transform duration-400 group-hover/spot:scale-105"
                                loading="lazy" width={512} height={352}
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                            {/* PLUS badge */}
                            <span className="absolute top-2 left-2 text-[8px] font-black bg-primary text-primary-foreground px-1.5 py-0.5 rounded-sm">PLUS</span>
                            <div className="absolute bottom-0 left-0 right-0 p-3">
                                <p className="text-[13px] font-bold text-white mb-1">{spotlight.title}</p>
                                <div className="flex items-center gap-1.5 text-[10px] text-white/60 mb-2">
                                    <Star size={9} fill="currentColor" className="text-primary" />
                                    <span>{spotlight.rating.replace("★ ", "")}</span>
                                    <span>·</span>
                                    <span>{spotlight.year}</span>
                                </div>
                                <div className="flex gap-1.5 opacity-0 group-hover/spot:opacity-100 transition-opacity">
                                    <button className="flex items-center gap-1 px-3 py-1 bg-primary text-primary-foreground text-[11px] font-bold rounded hover:bg-primary/90 transition-colors">
                                        <Play size={9} fill="currentColor" /> Play
                                    </button>
                                    <button className="p-1 bg-black/40 border border-white/20 rounded text-white/70 hover:bg-black/60 transition-colors">
                                        <Plus size={12} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Standard portrait cards */}
                {rest.map((movie, i) => (
                    <div key={`${movie.title}-${i}`} className="flex-shrink-0 w-28 group/card cursor-pointer">
                        <div className="relative w-full aspect-[2/3] rounded-md overflow-hidden bg-secondary">
                            <img
                                src={movie.image} alt={movie.title}
                                className="w-full h-full object-cover transition-transform duration-300 group-hover/card:scale-105"
                                loading="lazy" width={224} height={336}
                            />
                            {/* Hover play */}
                            <div className="absolute inset-0 bg-black/0 group-hover/card:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover/card:opacity-100">
                                <div className="w-8 h-8 rounded-full bg-primary/90 flex items-center justify-center">
                                    <Play size={11} fill="currentColor" className="text-primary-foreground translate-x-[0.5px]" />
                                </div>
                            </div>
                        </div>
                        {prefs.cardStyle === "detailed" && (
                            <>
                                <p className="mt-1.5 text-[11px] font-medium text-foreground/80 truncate leading-snug">{movie.title}</p>
                                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                    <span>{movie.year}</span>
                                    <span className="text-primary">{movie.rating}</span>
                                </div>
                            </>
                        )}
                    </div>
                ))}
            </div>
        </section>
    );
}
