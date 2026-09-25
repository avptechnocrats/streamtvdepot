/**
 * sunset/CategoryGrid.tsx
 *
 * Peacock editorial — large colorful genre tiles.
 * Each tile has: gradient background, big icon, genre name.
 * Two rows, horizontally scrollable.
 * Active: ring + scale up slightly.
 */
"use client";

import { Film, Tv, Zap, Smile, Sword, Telescope, Heart, Globe, Music, Ghost, Baby, Trophy } from "lucide-react";
import { useState } from "react";

const tiles = [
    { name: "Action", icon: Zap, grad: "from-orange-600 to-red-700" },
    { name: "Comedy", icon: Smile, grad: "from-yellow-500 to-amber-600" },
    { name: "Drama", icon: Film, grad: "from-blue-600 to-indigo-700" },
    { name: "Sci-Fi", icon: Telescope, grad: "from-cyan-600 to-teal-700" },
    { name: "Fantasy", icon: Sword, grad: "from-purple-600 to-violet-700" },
    { name: "Romance", icon: Heart, grad: "from-pink-500 to-rose-600" },
    { name: "World", icon: Globe, grad: "from-emerald-600 to-green-700" },
    { name: "Music", icon: Music, grad: "from-fuchsia-600 to-purple-700" },
    { name: "Horror", icon: Ghost, grad: "from-gray-700 to-gray-900" },
    { name: "Kids", icon: Baby, grad: "from-lime-500 to-green-600" },
    { name: "Sports", icon: Trophy, grad: "from-amber-600 to-orange-700" },
    { name: "Shows", icon: Tv, grad: "from-sky-600 to-blue-700" },
];

export default function CategoryGrid() {
    const [active, setActive] = useState<string | null>(null);

    return (
        <section className="px-6 lg:px-14 space-y-3">
            <div className="flex items-center gap-2 mb-1">
                <span className="w-1 h-5 rounded-full bg-primary" />
                <h3 className="text-[15px] font-bold text-foreground">Browse by Genre</h3>
            </div>

            <div className="flex gap-2.5 overflow-x-auto scrollbar-hide pb-1">
                {tiles.map(({ name, icon: Icon, grad }) => {
                    const isActive = active === name;
                    return (
                        <button
                            key={name}
                            onClick={() => setActive(isActive ? null : name)}
                            className={`flex-shrink-0 flex flex-col items-center justify-center gap-2 w-24 h-20 rounded-xl bg-gradient-to-br ${grad} transition-all duration-200 ${isActive ? "scale-105 ring-2 ring-white/60" : "opacity-80 hover:opacity-100 hover:scale-[1.03]"}`}
                        >
                            <Icon size={22} className="text-white drop-shadow" />
                            <span className="text-[11px] font-bold text-white">{name}</span>
                        </button>
                    );
                })}
            </div>
        </section>
    );
}
