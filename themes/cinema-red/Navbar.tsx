/**
 * cinema-red/Navbar.tsx
 *
 * MUBI/arthouse minimal — centered brand, nothing else except search.
 * The whole philosophy: get out of the way of the content.
 * Logo centered, search icon on right, tiny "Sign In" text link on left.
 * No filled bg — transparent, fades to solid on scroll.
 */
"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import SiteLogo from "@/components/SiteLogo";
import StorefrontActions from "@/components/StorefrontActions";

export default function Navbar() {
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const fn = () => setScrolled(window.scrollY > 30);
        window.addEventListener("scroll", fn, { passive: true });
        return () => window.removeEventListener("scroll", fn);
    }, []);

    return (
        <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? "bg-background/96 backdrop-blur-md border-b border-border/30" : "bg-transparent"}`}>
            <div className="relative flex items-center justify-between px-6 lg:px-12 h-[56px]">

                {/* Left — sign in + movies + pricing links */}
                <div className="flex items-center gap-4">
                    <a href="#" className="text-[11px] text-muted-foreground hover:text-foreground transition-colors tracking-wide">
                        Sign In
                    </a>
                    <Link href="/movies" className="text-[11px] text-muted-foreground hover:text-foreground transition-colors tracking-wide">
                        Movies
                    </Link>
                    <Link href="/pricing" className="text-[11px] text-muted-foreground hover:text-foreground transition-colors tracking-wide">
                        Pricing
                    </Link>
                </div>

                {/* Center — brand */}
                <SiteLogo
                    className="absolute left-1/2 -translate-x-1/2"
                    imageSize={28}
                    labelClassName="text-[13px] font-black text-foreground tracking-[0.12em] uppercase"
                />

                <StorefrontActions
                    scrolled={scrolled}
                    className="flex items-center gap-1"
                    buttonClassName="p-2 text-muted-foreground hover:text-foreground transition-colors"
                    accountClassName="p-2 text-muted-foreground hover:text-foreground transition-colors"
                />
            </div>
        </nav>
    );
}
