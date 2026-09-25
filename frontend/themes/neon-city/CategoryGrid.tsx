/**
 * neon-city/CategoryGrid.tsx
 *
 * Neon City theme categories — horizontal scrollable pill row.
 * Differences from dark-gold:
 *  - Single horizontal scroll row (not a 2/3/6-column grid)
 *  - Rounded-full pill buttons with neon glow on hover/active
 *  - More compact, gaming HUD aesthetic
 *  - First item ("All") is active by default
 */
"use client";

import { Film, Tv, Zap, Smile, Sword, Telescope, LayoutGrid } from "lucide-react";
import { useState } from "react";

const categories = [
    { name: "All", icon: LayoutGrid },
    { name: "Action", icon: Zap },
    { name: "Comedy", icon: Smile },
    { name: "Drama", icon: Film },
    { name: "Fantasy", icon: Sword },
    { name: "Sci-Fi", icon: Telescope },
    { name: "TV Shows", icon: Tv },
];

export default function CategoryGrid() {
    const [active, setActive] = useState("All");

    return (
        <section className="px-6 lg:px-12 space-y-3">
            {/* Section label */}
            <h3 className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-primary">
                <span className="text-muted-foreground/60">// </span>Browse Genre
            </h3>

            {/* Horizontal pill scroll */}
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
                {categories.map(({ name, icon: Icon }) => {
                    const isActive = active === name;
                    return (
                        <button
                            key={name}
                            onClick={() => setActive(name)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-none border text-xs font-mono font-semibold uppercase tracking-wider shrink-0 transition-all ${isActive
                                    ? "border-primary text-primary bg-primary/10 shadow-[0_0_12px_hsl(var(--primary)/0.3)]"
                                    : "border-border/50 text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-surface-hover"
                                }`}
                        >
                            <Icon size={13} />
                            {name}
                        </button>
                    );
                })}
            </div>
        </section>
    );
}
