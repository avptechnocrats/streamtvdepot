/**
 * emerald/Navbar.tsx
 *
 * Amazon Prime Video inspired — two-tier functional navbar.
 * Tier 1: logo + embedded search bar (not just icon) + account badge
 * Tier 2: category navigation strip
 * Has a "Prime" member badge next to the logo.
 */
"use client";

import { Search, User, ShoppingCart, ChevronDown } from "lucide-react";
import { useState } from "react";
import Link from "next/link";

const navItems = ["Home", "Movies", "TV Shows", "Channels", "Sports", "Live TV"];
const navLinks: Record<string, string> = {};
const categories = ["All", "Action", "Comedy", "Drama", "Sci-Fi", "Thriller", "Kids", "Documentaries"];

export default function Navbar() {
    const [active, setActive] = useState("Home");
    const [searchQuery, setSearchQuery] = useState("");

    return (
        <nav className="fixed top-0 left-0 right-0 z-50 bg-background border-b border-border/40">
            {/* Tier 1 — logo + search bar + account */}
            <div className="flex items-center gap-3 px-4 lg:px-10 h-14">

                {/* Logo + Prime badge */}
                <a href="/" className="flex items-center gap-2 shrink-0">
                    <span className="text-[15px] font-black text-foreground tracking-tight">
                        Stream<span className="text-primary">Vault</span>
                    </span>
                    <span className="text-[9px] font-black bg-primary text-primary-foreground px-1.5 py-0.5 rounded-sm leading-none">
                        PLUS
                    </span>
                </a>

                {/* Search bar — takes remaining space */}
                <div className="flex-1 flex items-center max-w-lg">
                    <div className="flex items-center w-full bg-secondary border border-border/60 rounded-md overflow-hidden focus-within:border-primary transition-colors">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search movies, shows, actors…"
                            className="flex-1 bg-transparent px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
                        />
                        <button className="px-3 py-2 bg-primary/10 hover:bg-primary/20 border-l border-border/40 text-primary transition-colors">
                            <Search size={15} />
                        </button>
                    </div>
                </div>

                {/* Account actions */}
                <div className="flex items-center gap-1 shrink-0">
                    <button className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-md">
                        <ShoppingCart size={17} />
                    </button>
                    <button className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] text-foreground/80 hover:text-foreground hover:bg-surface-hover rounded-md transition-colors">
                        <div className="w-6 h-6 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
                            <User size={12} className="text-primary" />
                        </div>
                        <span className="hidden md:block text-[11px] font-medium">Account</span>
                        <ChevronDown size={11} className="hidden md:block text-muted-foreground" />
                    </button>
                </div>
            </div>

            {/* Tier 2 — category nav */}
            <div className="flex items-center overflow-x-auto scrollbar-hide px-4 lg:px-10 border-t border-border/20 bg-background/60">
                {navItems.map((item) => {
                    const cls = `shrink-0 px-3.5 py-2 text-[12px] font-medium transition-colors ${active === item
                        ? "text-primary border-b-2 border-primary"
                        : "text-muted-foreground hover:text-foreground border-b-2 border-transparent"
                        }`;
                    return navLinks[item] ? (
                        <Link key={item} href={navLinks[item]} onClick={() => setActive(item)} className={cls}>
                            {item}
                        </Link>
                    ) : (
                        <button key={item} onClick={() => setActive(item)} className={cls}>
                            {item}
                        </button>
                    );
                })}
                <div className="ml-auto flex items-center gap-2 shrink-0 pl-4">
                    {categories.slice(0, 4).map((c) => (
                        <button key={c} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors px-1">{c}</button>
                    ))}
                </div>
            </div>
        </nav>
    );
}
