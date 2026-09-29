/**
 * dark-gold/ContentRow.tsx
 *
 * Classic cinema style: portrait cards, horizontal scroll.
 * This file is created to ensure movie cards are linked to their detail pages.
 */
"use client";

import { Play, Plus } from "lucide-react";
import { useRef } from "react";
import { useUserPrefs } from "@/hooks/use-user-prefs";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ContentRowProps } from "@/types/content";
import Image from "next/image";
import Link from "next/link";

export default function ContentRow({ title, movies }: ContentRowProps) {
    const rowRef = useRef<HTMLDivElement>(null);
    const { prefs } = useUserPrefs();

    const scroll = (dir: "left" | "right") => {
        rowRef.current?.scrollBy({ left: dir === "left" ? -420 : 420, behavior: "smooth" });
    };

    return (
        <section className="px-6 lg:px-12 space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-[15px] font-bold text-foreground tracking-tight">{title}</h3>
                <div className="flex items-center gap-1">
                    <button onClick={() => scroll("left")} className="w-7 h-7 rounded-full border border-border/60 text-muted-foreground hover:text-foreground hover:border-border transition-all flex items-center justify-center">
                        <ChevronLeft size={14} />
                    </button>
                    <button onClick={() => scroll("right")} className="w-7 h-7 rounded-full border border-border/60 text-muted-foreground hover:text-foreground hover:border-border transition-all flex items-center justify-center">
                        <ChevronRight size={14} />
                    </button>
                </div>
            </div>
            <div ref={rowRef} className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
                {movies.map((movie, i) => (
                    <Link
                        key={movie.id || `${movie.title}-${i}`}
                        href={movie.id ? `/movies/${movie.id}` : "#"}
                        className="flex-shrink-0 w-36 md:w-40 group/card cursor-pointer"
                        tabIndex={0}
                    >
                        <div className="relative w-full aspect-[2/3] rounded-lg overflow-hidden bg-secondary">
                            <Image
                                src={movie.image}
                                alt={movie.title}
                                fill
                                className="object-cover transition-transform duration-400 group-hover/card:scale-105"
                                sizes="(max-width: 640px) 50vw, 170px"
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover/card:bg-black/50 transition-colors duration-250 flex items-center justify-center gap-2 opacity-0 group-hover/card:opacity-100">
                                <button className="w-10 h-10 rounded-full bg-primary/90 flex items-center justify-center hover:bg-primary transition-colors">
                                    <Play size={14} fill="currentColor" className="text-primary-foreground translate-x-[1px]" />
                                </button>
                                <button className="w-7 h-7 rounded-full bg-white/20 border border-white/30 flex items-center justify-center hover:bg-white/30 transition-colors">
                                    <Plus size={12} className="text-white" />
                                </button>
                            </div>
                        </div>
                        {prefs.cardStyle === "detailed" && (
                            <div className="mt-2">
                                <p className="text-[12px] font-semibold text-foreground truncate leading-snug">{movie.title}</p>
                                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
                                    <span>{movie.year}</span>
                                    <span className="text-primary">{movie.rating}</span>
                                </div>
                            </div>
                        )}
                    </Link>
                ))}
            </div>
        </section>
    );
}
