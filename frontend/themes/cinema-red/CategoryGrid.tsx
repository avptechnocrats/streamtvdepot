/**
 * cinema-red/CategoryGrid.tsx
 *
 * Arthouse editorial curated-collections filter — text-only.
 * No coloured tiles, no icons, no pill backgrounds.
 * Just typographic links for curated collections (e.g. "Notebook", "Criterion", "By Director").
 * Active: foreground text + `text-primary` underline.
 * Inactive: muted text that brightens on hover.
 */
"use client";

import { useState } from "react";

const COLLECTIONS = [
    "Now Showing",
    "Notebook",
    "New Films",
    "Criterion Collection",
    "Award Winners",
    "By Director",
    "By Country",
    "By Decade",
    "Staff Picks",
];

const DECADES = ["2020s", "2010s", "2000s", "1990s", "1980s", "1970s", "Pre-1960"];

export default function CategoryGrid() {
    const [activeCollection, setActiveCollection] = useState("Now Showing");
    const [activeDecade, setActiveDecade] = useState<string | null>(null);

    return (
        <section className="px-6 lg:px-12 py-4 mb-2">
            {/* Primary curated tab bar */}
            <nav
                aria-label="Curated collections"
                className="flex flex-wrap gap-x-6 gap-y-2 mb-4 border-b border-border/30 pb-3"
            >
                {COLLECTIONS.map((col) => {
                    const isActive = activeCollection === col;
                    return (
                        <button
                            key={col}
                            onClick={() => setActiveCollection(col)}
                            className={[
                                "text-[12px] uppercase tracking-[0.12em] transition-colors pb-3 -mb-3",
                                isActive
                                    ? "text-foreground font-black border-b-2 border-primary"
                                    : "text-muted-foreground/50 hover:text-muted-foreground font-medium",
                            ].join(" ")}
                        >
                            {col}
                        </button>
                    );
                })}
            </nav>

            {/* Secondary decade filter — only shown for "By Decade" */}
            {activeCollection === "By Decade" && (
                <div className="flex flex-wrap gap-x-4 gap-y-2 mt-2">
                    {DECADES.map((dec) => {
                        const isActive = activeDecade === dec;
                        return (
                            <button
                                key={dec}
                                onClick={() => setActiveDecade(isActive ? null : dec)}
                                className={[
                                    "text-[11px] tracking-wide transition-colors",
                                    isActive
                                        ? "text-primary font-semibold underline underline-offset-4"
                                        : "text-muted-foreground/50 hover:text-muted-foreground",
                                ].join(" ")}
                            >
                                {dec}
                            </button>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
