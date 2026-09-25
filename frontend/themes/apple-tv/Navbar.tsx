/**
 * apple-tv/Navbar.tsx
 *
 * Apple TV+ inspired navbar — pure black, ultra-minimal, zero glow.
 * Design language:
 *  - Pure black bg that fades out at the bottom (no hard border)
 *  - Logo is a small ▶ play mark + "StreamTVDepot" in clean medium weight
 *  - Nav items are title-case, normal weight — active is white, rest are muted
 *  - Hover: smooth colour transition only (no pill, no underline, no glow)
 *  - Right: search + user avatar circle
 *  - Mobile: full slide-down menu
 */
"use client";

import { Search, User, Menu, X } from "lucide-react";
import { useState } from "react";
import Link from "next/link";

const navItems = ["Home", "Movies", "TV Shows", "Sports", "Kids"];
const navLinks: Record<string, string> = {};

export default function Navbar() {
    const [active, setActive] = useState("Home");
    const [mobileOpen, setMobileOpen] = useState(false);

    return (
        <>
            <nav className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-b from-black/95 to-transparent">
                <div className="flex items-center justify-between px-6 lg:px-14 h-[60px]">

                    {/* Logo */}
                    <div className="flex items-center gap-7">
                        <a href="/" className="flex items-center gap-2 shrink-0">
                            <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/90">
                                <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor" className="text-black translate-x-[1px]">
                                    <path d="M1 1l8 5-8 5V1z" />
                                </svg>
                            </span>
                            <span className="text-[13px] font-semibold text-white tracking-tight hidden sm:block">
                                StreamTVDepot
                            </span>
                        </a>

                        {/* Desktop nav */}
                        <div className="hidden md:flex items-center gap-0.5">
                            {navItems.map((item) => {
                                const cls = `px-3.5 py-2 text-[13px] font-medium transition-colors duration-150 rounded-lg ${active === item
                                    ? "text-white"
                                    : "text-white/50 hover:text-white/90"
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
                        </div>
                    </div>

                    {/* Right actions */}
                    <div className="flex items-center gap-1">
                        <button className="p-2.5 text-white/60 hover:text-white transition-colors rounded-lg">
                            <Search size={17} />
                        </button>
                        <button className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors">
                            <User size={14} className="text-white" />
                        </button>
                        <button
                            className="md:hidden p-2.5 text-white/60 hover:text-white transition-colors rounded-lg"
                            onClick={() => setMobileOpen((v) => !v)}
                        >
                            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
                        </button>
                    </div>
                </div>

                {/* Mobile menu */}
                {mobileOpen && (
                    <div className="md:hidden bg-black/95 backdrop-blur-xl border-t border-white/8">
                        {navItems.map((item) => {
                            const cls = `w-full text-left px-6 py-3.5 text-[13px] font-medium transition-colors ${active === item ? "text-white" : "text-white/50 hover:text-white/80"}`;
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
