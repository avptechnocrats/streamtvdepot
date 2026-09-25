/**
 * midnight/ContentRow.tsx
 *
 * HBO Max editorial — landscape 16:9 grid layout.
 * NOT a horizontal scroll row — displays as a responsive CSS grid
 * (2 cols on mobile, 3 on md, 4 on lg, 5 on xl).
 * Each card: landscape image + bottom gradient + title always visible.
 * Hover: slight scale + a bright primary-coloured top border line.
 */
"use client";

import { Play, Plus } from "lucide-react";
import { useUserPrefs } from "@/hooks/use-user-prefs";
import type { ContentRowProps } from "@/types/content";

export default function ContentRow({ title, movies }: ContentRowProps) {
    const { prefs } = useUserPrefs();
    return (
        <section className="px-6 lg:px-14 space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-[15px] font-bold text-foreground tracking-tight">{title}</h3>
                <a href="#" className="text-[11px] font-semibold text-primary hover:underline">See All</a>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {movies.map((movie, i) => (
                    <div key={`${movie.title}-${i}`} className="group/card cursor-pointer">
                        {/* Landscape 16:9 */}
                        <div className="relative w-full aspect-video rounded-sm overflow-hidden bg-secondary">
                            <img
                                src={movie.image} alt={movie.title}
                                className="w-full h-full object-cover transition-transform duration-400 group-hover/card:scale-105"
                                loading="lazy" width={640} height={360}
                            />
                            {/* Always-visible bottom gradient + title */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                            <p className="absolute bottom-2 left-2.5 right-2.5 text-[12px] font-semibold text-white leading-tight line-clamp-1">
                                {movie.title}
                            </p>

                            {/* Top accent line on hover */}
                            <div className="absolute top-0 left-0 right-0 h-[3px] bg-primary scale-x-0 group-hover/card:scale-x-100 transition-transform duration-300 origin-left" />

                            {/* Action buttons on hover */}
                            <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover/card:opacity-100 transition-opacity duration-200">
                                <button className="w-9 h-9 rounded-full bg-primary/90 flex items-center justify-center hover:bg-primary transition-colors">
                                    <Play size={14} fill="currentColor" className="text-primary-foreground translate-x-[1px]" />
                                </button>
                                <button className="w-7 h-7 rounded-full bg-black/50 border border-white/20 flex items-center justify-center hover:bg-black/70 transition-colors">
                                    <Plus size={12} className="text-white" />
                                </button>
                            </div>
                        </div>

                        {prefs.cardStyle === "detailed" && (
                            <div className="mt-1.5">
                                <p className="text-[12px] font-medium text-foreground/80 truncate">{movie.title}</p>
                                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
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
