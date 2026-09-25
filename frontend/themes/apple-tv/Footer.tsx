/**
 * apple-tv/Footer.tsx
 *
 * Apple TV+ inspired footer — ultra-minimal.
 * Design language:
 *  - Pure black, no top border (or extremely faint)
 *  - Small play icon + "SignalView" wordmark
 *  - Minimal links in small muted text
 *  - Copyright + tiny legal note
 */
"use client";

const links = ["Home", "Movies", "TV Shows", "Privacy Policy", "Terms of Use", "Help"];

export default function Footer() {
    return (
        <footer className="px-6 lg:px-14 pt-10 pb-8 bg-black/40">

            {/* Logo */}
            <div className="flex items-center gap-2 mb-6">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/80">
                    <svg width="8" height="10" viewBox="0 0 10 12" fill="currentColor" className="text-black translate-x-[1px]">
                        <path d="M1 1l8 5-8 5V1z" />
                    </svg>
                </span>
                <span className="text-[12px] font-semibold text-white/60 tracking-tight">
                    SignalView
                </span>
            </div>

            {/* Links */}
            <nav className="flex flex-wrap gap-x-5 gap-y-2 mb-6">
                {links.map((l) => (
                    <a
                        key={l}
                        href="#"
                        className="text-[11px] text-white/30 hover:text-white/60 transition-colors"
                    >
                        {l}
                    </a>
                ))}
            </nav>

            {/* Copyright */}
            <p className="text-[10px] text-white/20 leading-relaxed max-w-lg">
                © {new Date().getFullYear()} SignalView. All rights reserved.
                SignalView and related marks are trademarks of SignalView Inc.
            </p>
        </footer>
    );
}
