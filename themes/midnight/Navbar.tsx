/**
 * midnight/Navbar.tsx
 *
 * HBO Max editorial style — two-row navbar.
 * Row 1: logo left, search + user right (always visible)
 * Row 2: nav tab strip — active tab has a thick cyan bottom border (not a pill)
 * Background: solid dark navy with a very faint bottom border
 */
"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import SiteLogo from "@/components/SiteLogo";
import StorefrontActions from "@/components/StorefrontActions";

const navItems = ["Home", "Series", "Movies", "Sports", "Originals", "Kids", "Pricing"];
const navLinks: Record<string, string> = { "Home": "/", "Movies": "/movies", "Pricing": "/pricing" };

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
            {/* Row 1 — brand + utilities */}
            <div className="flex items-center justify-between px-6 lg:px-14 h-14">
                <SiteLogo
                    className="flex items-center gap-2"
                    imageSize={32}
                    labelClassName="text-xl font-black text-foreground tracking-tighter"
                />

                <StorefrontActions
                    scrolled={scrolled}
                    buttonClassName={`p-2 rounded-md transition-colors ${scrolled ? "text-muted-foreground hover:text-foreground" : "text-white/80 hover:text-white"}`}
                    accountClassName="flex items-center gap-2 px-2 py-1.5 rounded-md text-foreground/80 hover:text-foreground hover:bg-surface-hover transition-colors"
                />
            </div>

            {/* Row 2 — nav tabs with underline active indicator */}
            <div className="flex items-end overflow-x-auto scrollbar-hide px-6 lg:px-14 border-t border-border/20">
                {navItems.map((item) => {
                    const href = navLinks[item];
                    const cls = `relative shrink-0 px-4 py-2.5 text-[12px] font-semibold tracking-wide transition-colors ${active === item
                        ? "text-primary"
                        : scrolled
                            ? "text-muted-foreground hover:text-foreground"
                            : "text-white/80 hover:text-white"
                        }`;
                    const inner = (
                        <>
                            {item}
                            {active === item && (
                                <span className="absolute bottom-0 left-0 right-0 h-[3px] bg-primary rounded-t-full" />
                            )}
                        </>
                    );
                    return href ? (
                        <Link key={item} href={href} onClick={() => setActive(item)} className={cls}>{inner}</Link>
                    ) : (
                        <button key={item} onClick={() => setActive(item)} className={cls}>{inner}</button>
                    );
                })}
            </div>
        </nav>
    );
}
