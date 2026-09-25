/**
 * emerald/CategoryGrid.tsx
 *
 * Prime Video filter chip row — genre + format + year filter chips.
 * Three rows of filter chips (genre, format, year range).
 * Functional filter appearance — very utilitarian.
 */
"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

const genres = ["All Genres", "Action", "Comedy", "Drama", "Horror", "Sci-Fi", "Thriller", "Romance", "Documentary", "Kids", "Fantasy", "Crime"];
const formats = ["All Formats", "Prime", "4K Ultra HD", "HDR", "Dolby Vision", "Free to Watch"];
const years = ["All Years", "2025", "2024", "2023", "2022", "2010s", "2000s", "Classic"];

export default function CategoryGrid() {
    const [genre, setGenre] = useState("All Genres");
    const [format, setFormat] = useState("All Formats");
    const [year, setYear] = useState("All Years");
    const [sortOpen, setSortOpen] = useState(false);

    return (
        <section className="px-4 lg:px-10 space-y-2.5 py-2">
            {/* Genre chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
                {genres.map((g) => (
                    <button
                        key={g}
                        onClick={() => setGenre(g)}
                        className={`shrink-0 px-3 py-1.5 rounded-md text-[11px] font-medium border transition-all ${genre === g
                                ? "bg-primary/15 border-primary/50 text-primary"
                                : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground bg-secondary/50"
                            }`}
                    >
                        {g}
                    </button>
                ))}
            </div>

            {/* Format + Year + Sort row */}
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
                <span className="text-[11px] text-muted-foreground/50 shrink-0 font-medium">Filter:</span>

                {formats.map((f) => (
                    <button
                        key={f}
                        onClick={() => setFormat(f)}
                        className={`shrink-0 px-2.5 py-1 rounded text-[10px] font-semibold transition-all ${format === f
                                ? "bg-primary text-primary-foreground"
                                : "bg-secondary border border-border/40 text-muted-foreground hover:text-foreground"
                            }`}
                    >
                        {f}
                    </button>
                ))}

                <div className="w-px h-4 bg-border/50 shrink-0 mx-1" />

                {years.map((y) => (
                    <button
                        key={y}
                        onClick={() => setYear(y)}
                        className={`shrink-0 px-2.5 py-1 rounded text-[10px] font-semibold transition-all ${year === y
                                ? "bg-primary text-primary-foreground"
                                : "bg-secondary border border-border/40 text-muted-foreground hover:text-foreground"
                            }`}
                    >
                        {y}
                    </button>
                ))}

                <div className="ml-auto shrink-0">
                    <button
                        onClick={() => setSortOpen((v) => !v)}
                        className="flex items-center gap-1 px-3 py-1 rounded border border-border/50 text-[11px] text-muted-foreground hover:text-foreground transition-colors bg-secondary/50"
                    >
                        Sort <ChevronDown size={11} className={`transition-transform ${sortOpen ? "rotate-180" : ""}`} />
                    </button>
                </div>
            </div>
        </section>
    );
}
