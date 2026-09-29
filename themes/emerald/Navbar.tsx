/**
 * emerald/Navbar.tsx
 *
 * Amazon Prime Video inspired — two-tier functional navbar.
 * Tier 1: logo + embedded search bar (not just icon) + account badge
 * Tier 2: category navigation strip
 * Has a "Prime" member badge next to the logo.
 */
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import SiteLogo from "@/components/SiteLogo";
import StorefrontActions from "@/components/StorefrontActions";

const navItems = ["Home", "Movies", "TV Shows", "Channels", "Sports", "Live TV", "Pricing"];
const navLinks: Record<string, string> = { "Movies": "/movies", "TV Shows": "/tv-shows", "Pricing": "/pricing" };
const categories = ["All", "Action", "Comedy", "Drama", "Sci-Fi", "Thriller", "Kids", "Documentaries"];

export default function Navbar() {
    const [active, setActive] = useState("Home");
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 10);
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    return (
        <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? "bg-background/95 backdrop-blur-md border-b border-border/40" : "bg-transparent"}`}
            style={!scrolled ? { textShadow: "0 1px 6px rgba(0,0,0,0.9), 0 3px 16px rgba(0,0,0,0.7)" } : undefined}>
            {/* Tier 1 — logo + search bar + account */}
            <div className="flex items-center gap-3 px-4 lg:px-10 h-14">

                {/* Logo + Prime badge */}
                <div className="flex items-center gap-2 shrink-0">
                    <SiteLogo />
                    <span className="text-[9px] font-black bg-primary text-primary-foreground px-1.5 py-0.5 rounded-sm leading-none">
                        PLUS
                    </span>
                </div>

                <StorefrontActions scrolled={scrolled} className="ml-auto flex items-center gap-1 shrink-0" />
            </div>

            {/* Tier 2 — category nav */}
            <div className="flex items-center overflow-x-auto scrollbar-hide px-4 lg:px-10 border-t border-border/20 bg-background/60">
                {navItems.map((item) => {
                    const cls = `shrink-0 px-3.5 py-2 text-[12px] font-medium transition-colors ${active === item
                        ? "text-primary border-b-2 border-primary"
                        : scrolled
                            ? "text-muted-foreground hover:text-foreground border-b-2 border-transparent"
                            : "text-white/90 hover:text-white border-b-2 border-transparent"
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
