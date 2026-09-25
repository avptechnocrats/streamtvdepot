/**
 * neon-city/Navbar.tsx
 *
 * Neon City theme navbar — cyberpunk aesthetic.
 * Differences from dark-gold:
 *  - More transparent background with a strong primary glow on the bottom border
 *  - Logo is a stylized "NEON ▮" wordmark with a glowing accent block
 *  - Active nav items use an underline glow instead of a filled bg pill
 *  - Nav items are uppercase tracking-widest micro-caps
 *  - Mobile: full-width slide-down menu (vs hidden in dark-gold)
 */
"use client";

import { Search, Bell, User, Menu, X } from "lucide-react";
import { useState } from "react";
import Link from "next/link";

const navItems = ["Home", "Movies", "TV Shows", "Sports", "Kids"];
const navLinks: Record<string, string> = {};

export default function Navbar() {
    const [active, setActive] = useState("Home");
    const [mobileOpen, setMobileOpen] = useState(false);

    return (
        <>
            <nav className="fixed top-0 left-0 right-0 z-50 bg-background/30 backdrop-blur-xl border-b border-primary/20 shadow-[0_1px_20px_0_hsl(var(--primary)/0.15)]">
                <div className="flex items-center justify-between px-6 lg:px-12 h-16">

                    {/* Logo */}
                    <div className="flex items-center gap-8">
                        <div className="flex items-center gap-2">
                            <span className="w-3 h-5 bg-primary rounded-[2px] shadow-[0_0_8px_hsl(var(--primary)/0.8)]" />
                            <h1 className="text-base font-display font-800 text-gradient-gold tracking-[0.15em] uppercase">
                                NeonCity
                            </h1>
                        </div>

                        {/* Desktop nav */}
                        <div className="hidden md:flex items-center gap-0.5">
                            {navItems.map((item) => (
                                <button
                                    key={item}
                                    onClick={() => setActive(item)}
                                    className={`relative px-4 py-2 text-[11px] font-semibold uppercase tracking-widest transition-colors ${active === item
                                        ? "text-primary"
                                        : "text-muted-foreground hover:text-foreground"
                                        }`}
                                >
                                    {item}
                                    {active === item && (
                                        <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-primary rounded-full shadow-[0_0_6px_hsl(var(--primary)/0.8)]" />
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                        <button className="p-2 rounded-md text-muted-foreground hover:text-primary hover:shadow-[0_0_8px_hsl(var(--primary)/0.4)] transition-all">
                            <Search size={18} />
                        </button>
                        <button className="relative p-2 rounded-md text-muted-foreground hover:text-primary transition-all">
                            <Bell size={18} />
                            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-primary rounded-full shadow-[0_0_4px_hsl(var(--primary))]" />
                        </button>
                        <button
                            className="md:hidden p-2 rounded-md text-muted-foreground hover:text-foreground transition-colors"
                            onClick={() => setMobileOpen((v) => !v)}
                        >
                            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
                        </button>
                        <button className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-md border border-primary/40 text-primary text-xs font-semibold hover:bg-primary/10 hover:shadow-[0_0_12px_hsl(var(--primary)/0.2)] transition-all">
                            <User size={14} />
                            Sign In
                        </button>
                    </div>
                </div>

                {/* Mobile menu — slides down */}
                {mobileOpen && (
                    <div className="md:hidden border-t border-primary/20 bg-background/90 backdrop-blur-xl">
                        {navItems.map((item) => {
                            const cls = `w-full text-left px-6 py-3 text-[11px] font-semibold uppercase tracking-widest transition-colors ${active === item
                                ? "text-primary border-l-2 border-primary"
                                : "text-muted-foreground hover:text-foreground border-l-2 border-transparent"
                                }`;
                            return navLinks[item] ? (
                                <Link key={item} href={navLinks[item]} onClick={() => { setActive(item); setMobileOpen(false); }} className={cls}>
                                    {item}
                                </Link>
                            ) : (
                                <button key={item} onClick={() => { setActive(item); setMobileOpen(false); }} className={cls}>
                                    {item}
                                </button>
                            );
                        })}
                    </div>
                )}
            </nav>
        </>
    );
}
