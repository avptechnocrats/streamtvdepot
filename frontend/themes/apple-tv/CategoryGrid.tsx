/**
 * apple-tv/CategoryGrid.tsx
 *
 * Apple TV+ inspired categories — understated horizontal pill row.
 * Design language:
 *  - Pills with no background at rest, just coloured text
 *  - Active: filled primary (cyan/blue) pill, rounded-full
 *  - Inactive: plain white/muted text, no box
 *  - Clean, spacious, not monospace
 */
"use client";

import { useState } from "react";

const categories = [
    "All",
    "Movies",
    "TV Shows",
    "Action",
    "Comedy",
    "Drama",
    "Sci-Fi",
    "Documentary",
    "Kids",
];

export default function CategoryGrid() {
    const [active, setActive] = useState("All");

    return (
        <section className="px-6 lg:px-14 space-y-2">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
                {categories.map((name) => {
                    const isActive = active === name;
                    return (
                        <button
                            key={name}
                            onClick={() => setActive(name)}
                            className={`shrink-0 px-4 py-1.5 rounded-full text-[12px] font-medium transition-all duration-200 ${isActive
                                    ? "bg-primary text-black"
                                    : "text-white/50 hover:text-white/90"
                                }`}
                        >
                            {name}
                        </button>
                    );
                })}
            </div>
        </section>
    );
}
