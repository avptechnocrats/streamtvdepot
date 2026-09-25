/**
 * cinema-red/Navbar.tsx
 *
 * MUBI/arthouse minimal — centered brand, nothing else except search.
 * The whole philosophy: get out of the way of the content.
 * Logo centered, search icon on right, tiny "Sign In" text link on left.
 * No filled bg — transparent, fades to solid on scroll.
 */
"use client";

import { Search, X } from "lucide-react";
import { useState, useEffect } from "react";

export default function Navbar() {
    const [scrolled, setScrolled] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [query, setQuery] = useState("");

    useEffect(() => {
        const fn = () => setScrolled(window.scrollY > 30);
        window.addEventListener("scroll", fn, { passive: true });
        return () => window.removeEventListener("scroll", fn);
    }, []);

    return (
        <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? "bg-background/96 backdrop-blur-md border-b border-border/30" : "bg-transparent"}`}>
            <div className="relative flex items-center justify-between px-6 lg:px-12 h-[56px]">

                {/* Left — sign in link */}
                <a href="#" className="text-[11px] text-muted-foreground hover:text-foreground transition-colors tracking-wide">
                    Sign In
                </a>

                {/* Center — brand */}
                <a href="/" className="absolute left-1/2 -translate-x-1/2 text-[13px] font-black text-foreground tracking-[0.12em] uppercase">
                    SignalView
                </a>

                {/* Right — search */}
                {searchOpen ? (
                    <div className="flex items-center gap-2">
                        <input
                            autoFocus
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onBlur={() => { setSearchOpen(false); setQuery(""); }}
                            placeholder="Search…"
                            className="w-40 bg-transparent border-b border-foreground/30 focus:border-primary text-[12px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none pb-0.5 transition-colors"
                        />
                        <button onClick={() => setSearchOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                            <X size={14} />
                        </button>
                    </div>
                ) : (
                    <button onClick={() => setSearchOpen(true)} className="text-muted-foreground hover:text-foreground transition-colors">
                        <Search size={16} />
                    </button>
                )}
            </div>
        </nav>
    );
}
