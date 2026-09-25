/**
 * neon-city/Footer.tsx
 *
 * Neon City theme footer — compact single-row layout.
 * Differences from dark-gold:
 *  - Single row (no multi-column grid)
 *  - Neon glow on the top border
 *  - Monospace font with bracket styling
 *  - Only essential links + copyright
 */
"use client";

const links = ["Home", "Movies", "TV Shows", "Privacy", "Terms", "Help"];

export default function Footer() {
    return (
        <footer className="px-6 lg:px-12 py-6 border-t border-primary/20 shadow-[0_-1px_20px_0_hsl(var(--primary)/0.08)]">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">

                {/* Logo */}
                <div className="flex items-center gap-2">
                    <span className="w-2 h-4 bg-primary rounded-[1px] shadow-[0_0_6px_hsl(var(--primary)/0.8)]" />
                    <span className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-gradient-gold">
                        NeonCity
                    </span>
                </div>

                {/* Links */}
                <nav className="flex items-center gap-1 flex-wrap justify-center">
                    {links.map((l, i) => (
                        <span key={l} className="flex items-center">
                            <a
                                href="#"
                                className="text-[11px] font-mono text-muted-foreground hover:text-primary transition-colors px-2"
                            >
                                {l}
                            </a>
                            {i < links.length - 1 && (
                                <span className="text-primary/30 text-[10px]">·</span>
                            )}
                        </span>
                    ))}
                </nav>

                {/* Copyright */}
                <p className="text-[10px] font-mono text-muted-foreground/60">
                    © 2024 <span className="text-primary/60">NeonCity</span>
                </p>
            </div>
        </footer>
    );
}
