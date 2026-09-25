/**
 * sunset/Navbar.tsx
 *
 * Peacock/editorial warm navbar.
 * Transparent over the hero, transitions to solid on scroll.
 * Logo uses a warm gradient wordmark.
 * Nav items are spaced with a warm accent dot for the active item.
 * Right: search icon + "Start Watching" CTA button.
 */
"use client";

import { Search, Menu, X } from "lucide-react";
import { useState, useEffect } from "react";

const navItems = ["Home", "Shows", "Movies", "Sports", "News", "Kids"];

export default function Navbar() {
    const [active, setActive] = useState("Home");
    const [scrolled, setScrolled] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 40);
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    return (
        <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? "bg-background/95 backdrop-blur-md shadow-sm" : "bg-transparent"}`}>
            <div className="flex items-center justify-between px-6 lg:px-14 h-16">

                {/* Logo */}
                <div className="flex items-center gap-7">
                    <a href="/" className="text-[17px] font-black tracking-tight text-gradient-gold">
                        SignalView
                    </a>

                    {/* Desktop nav */}
                    <div className="hidden md:flex items-center gap-0.5">
                        {navItems.map((item) => (
                            <button
                                key={item}
                                onClick={() => setActive(item)}
                                className={`flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium transition-colors rounded-md ${active === item ? "text-foreground" : "text-foreground/50 hover:text-foreground/85"
                                    }`}
                            >
                                {active === item && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                                )}
                                {item}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Right */}
                <div className="flex items-center gap-2">
                    <button className="p-2 text-foreground/60 hover:text-foreground transition-colors rounded-md">
                        <Search size={18} />
                    </button>
                    <button className="hidden md:block px-4 py-1.5 rounded-full bg-primary text-primary-foreground text-[12px] font-bold hover:bg-primary/90 transition-colors">
                        Start Watching
                    </button>
                    <button
                        className="md:hidden p-2 text-foreground/60 hover:text-foreground transition-colors rounded-md"
                        onClick={() => setMobileOpen((v) => !v)}
                    >
                        {mobileOpen ? <X size={18} /> : <Menu size={18} />}
                    </button>
                </div>
            </div>

            {/* Mobile menu */}
            {mobileOpen && (
                <div className="md:hidden bg-background/98 backdrop-blur-xl border-t border-border/50">
                    {navItems.map((item) => (
                        <button
                            key={item}
                            onClick={() => { setActive(item); setMobileOpen(false); }}
                            className={`flex items-center gap-3 w-full text-left px-6 py-3.5 text-[13px] font-medium transition-colors ${active === item ? "text-primary" : "text-foreground/60 hover:text-foreground"}`}
                        >
                            {active === item && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                            {item}
                        </button>
                    ))}
                </div>
            )}
        </nav>
    );
}
