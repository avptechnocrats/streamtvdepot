/**
 * cinema-red/ContentRow.tsx
 *
 * MUBI vertical stacked list — NOT a horizontal scroll row.
 * Each film is a horizontal row: landscape thumbnail on left, film details on right.
 * Shows: number · thumbnail · title · director · year · country · runtime.
 * Hover: primary-coloured left border appears, text brightens.
 * The "title" prop becomes a section heading above the list.
 */
"use client";

import { Play, Plus } from "lucide-react";
import { useUserPrefs } from "@/hooks/use-user-prefs";
import type { ContentRowProps } from "@/types/content";
import Image from "next/image";
import Link from "next/link";

const DIRECTORS = ["Ava DuVernay", "Park Chan-wook", "Denis Villeneuve", "Céline Sciamma", "Jordan Peele", "Yorgos Lanthimos", "Bong Joon-ho", "Sofia Coppola"];
const COUNTRIES = ["USA", "South Korea", "France", "UK", "Japan", "Italy", "Spain", "Germany"];
const RUNTIMES = ["95 min", "112 min", "127 min", "88 min", "143 min", "105 min", "118 min", "97 min"];

export default function ContentRow({ title, movies }: ContentRowProps) {
    const { prefs } = useUserPrefs();
    return (
        <section className="px-6 lg:px-12 mb-8">
            {/* Section heading */}
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-border/30">
                <h3 className="text-[13px] font-black text-foreground uppercase tracking-[0.15em]">{title}</h3>
                <a href="#" className="text-[11px] text-primary hover:underline">View all</a>
            </div>

            {/* Vertical list */}
            <div className="space-y-0 divide-y divide-border/20">
                {movies.map((movie, i) => {
                    const director = DIRECTORS[i % DIRECTORS.length];
                    const country = COUNTRIES[i % COUNTRIES.length];
                    const runtime = RUNTIMES[i % RUNTIMES.length];

                    return (
                        <Link
                            key={movie.id || `${movie.title}-${i}`}
                            href={movie.id ? `/movies/${movie.id}` : "#"}
                            className="flex items-center gap-4 py-3.5 group/item cursor-pointer border-l-2 border-transparent hover:border-primary hover:pl-2 transition-all duration-200"
                            tabIndex={0}
                        >
                            {/* Number */}
                            <span className="text-[12px] font-black text-muted-foreground/30 group-hover/item:text-muted-foreground w-5 text-right shrink-0 tabular-nums">
                                {String(i + 1).padStart(2, "0")}
                            </span>

                            {/* Thumbnail */}
                            <div className="relative w-24 aspect-video rounded-sm overflow-hidden bg-secondary shrink-0">
                                <img
                                    src={movie.image} alt={movie.title}
                                    className="w-full h-full object-cover group-hover/item:brightness-110 transition-all"
                                    loading="lazy" width={192} height={108}
                                />
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/item:opacity-100 transition-opacity bg-black/30">
                                    <Play size={14} fill="currentColor" className="text-white" />
                                </div>
                            </div>

                            {/* Details */}
                            <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-semibold text-foreground/80 group-hover/item:text-foreground transition-colors truncate">{movie.title}</p>
                                <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                                    {director} · {movie.year} · {country}
                                </p>
                                <p className="text-[10px] text-muted-foreground/40 mt-0.5">{runtime}</p>
                            </div>

                            {/* Actions — detailed mode only, appear on hover */}
                            {prefs.cardStyle === "detailed" && (
                                <div className="flex items-center gap-1.5 opacity-0 group-hover/item:opacity-100 transition-opacity shrink-0">
                                    <button className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-semibold border border-primary/50 text-primary hover:bg-primary/10 transition-colors rounded-sm">
                                        <Play size={10} fill="currentColor" /> Watch
                                    </button>
                                    <button className="p-1.5 border border-border/40 text-muted-foreground hover:text-foreground hover:border-border transition-colors rounded-sm">
                                        <Plus size={12} />
                                    </button>
                                </div>
                            )}
                        </Link>
                    );
                })}
            </div>
        </section>
    );
}
