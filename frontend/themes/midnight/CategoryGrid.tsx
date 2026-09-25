/**
 * midnight/CategoryGrid.tsx
 *
 * HBO Max bold underline tab bar.
 * Just text tabs — active has a thick bottom border + full white color.
 * No pills, no boxes, no grid. Very editorial.
 * Also includes a "sub-filter" row with small muted type chips.
 */
"use client";

import { useState } from "react";

const mainTabs = ["All", "Series", "Movies", "Documentaries", "Sports", "Kids"];
const subFilters = ["Drama", "Comedy", "Thriller", "Sci-Fi", "Romance", "Horror", "Action", "Crime"];

export default function CategoryGrid() {
    const [activeTab, setActiveTab] = useState("All");
    const [activeSub, setActiveSub] = useState<string | null>(null);

    return (
        <section className="px-6 lg:px-14">
            {/* Main tab row */}
            <div className="flex items-end overflow-x-auto scrollbar-hide border-b border-border/40 gap-0">
                {mainTabs.map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`relative shrink-0 px-5 py-3 text-[13px] font-semibold transition-colors ${activeTab === tab
                                ? "text-foreground"
                                : "text-muted-foreground hover:text-foreground/80"
                            }`}
                    >
                        {tab}
                        {activeTab === tab && (
                            <span className="absolute bottom-0 left-0 right-0 h-[3px] bg-primary" />
                        )}
                    </button>
                ))}
            </div>

            {/* Sub-genre chips */}
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-3">
                {subFilters.map((f) => (
                    <button
                        key={f}
                        onClick={() => setActiveSub(activeSub === f ? null : f)}
                        className={`shrink-0 px-3.5 py-1 rounded-full text-[11px] font-medium border transition-all ${activeSub === f
                                ? "bg-primary/15 border-primary/50 text-primary"
                                : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground"
                            }`}
                    >
                        {f}
                    </button>
                ))}
            </div>
        </section>
    );
}
