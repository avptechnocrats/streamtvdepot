/**
 * cinema-red/Footer.tsx — Minimalist centered footer.
 */
"use client";

import { useSiteSettings } from "@/hooks/use-site-settings";
import { Youtube, Instagram, Facebook } from "lucide-react";

export default function Footer() {
    const { site_title, copyright_text, youtube_url, instagram_url, facebook_url } = useSiteSettings();
    const label = site_title || "StreamTVDepot";

    const socialLinks = [
        { icon: Youtube, url: youtube_url, label: "YouTube" },
        { icon: Instagram, url: instagram_url, label: "Instagram" },
        { icon: Facebook, url: facebook_url, label: "Facebook" },
    ];

    const navLinks = [
        { label: "About", href: "#" },
        { label: "Film Index", href: "#" },
        { label: "Help Center", href: "#" },
        { label: "Privacy", href: "#" },
        { label: "Terms", href: "#" },
    ];

    return (
        <footer className="mt-12 pb-10 px-6 text-center">
            <hr className="border-border/20 mb-8" />

            {/* Logo */}
            <div className="mb-4">
                <span className="text-sm font-black tracking-[0.35em] uppercase text-foreground/90">{label}</span>
            </div>

            {/* Social icons */}
            <div className="flex items-center justify-center gap-3 mb-6">
                {socialLinks.map(({ icon: Icon, url, label: name }) => (
                    url ? (
                        <a
                            key={name}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={name}
                            className="w-8 h-8 rounded-sm border border-border/40 flex items-center justify-center text-muted-foreground/60 hover:text-primary hover:border-primary/40 transition-colors"
                        >
                            <Icon size={14} />
                        </a>
                    ) : (
                        <span key={name} aria-label={name} className="w-8 h-8 rounded-sm border border-border/40 flex items-center justify-center text-muted-foreground/25">
                            <Icon size={14} />
                        </span>
                    )
                ))}
            </div>

            {/* Links row */}
            <nav className="flex flex-wrap justify-center gap-x-5 gap-y-2 mb-6">
                {navLinks.map((l) => (
                    <a
                        key={l.label}
                        href={l.href}
                        className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                    >
                        {l.label}
                    </a>
                ))}
            </nav>

            {/* Copyright */}
            <p className="text-[10px] text-muted-foreground/25 tracking-wider">
                {copyright_text || `© ${new Date().getFullYear()} ${label}. Films for those who care about film.`}
            </p>
        </footer>
    );
}
