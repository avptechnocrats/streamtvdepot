/**
 * neon-city/Footer.tsx — Neon City theme compact footer.
 */
"use client";

import { useSiteSettings } from "@/hooks/use-site-settings";
import { Youtube, Instagram, Facebook } from "lucide-react";

const links = ["Home", "Movies", "TV Shows", "Privacy", "Terms", "Help"];

export default function Footer() {
    const { site_title, copyright_text, youtube_url, instagram_url, facebook_url } = useSiteSettings();
    const label = site_title || "SignalView";

    const socialLinks = [
        { icon: Youtube, url: youtube_url, label: "YouTube" },
        { icon: Instagram, url: instagram_url, label: "Instagram" },
        { icon: Facebook, url: facebook_url, label: "Facebook" },
    ];

    return (
        <footer className="px-6 lg:px-12 py-6 border-t border-primary/20 shadow-[0_-1px_20px_0_hsl(var(--primary)/0.08)]">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">

                {/* Logo */}
                <div className="flex items-center gap-2">
                    <span className="w-2 h-4 bg-primary rounded-[1px] shadow-[0_0_6px_hsl(var(--primary)/0.8)]" />
                    <span className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-gradient-gold">{label}</span>
                </div>

                {/* Links */}
                <nav className="flex items-center gap-1 flex-wrap justify-center">
                    {links.map((l, i) => (
                        <span key={l} className="flex items-center">
                            <a href="#" className="text-[11px] font-mono text-muted-foreground hover:text-primary transition-colors px-2">{l}</a>
                            {i < links.length - 1 && <span className="text-primary/30 text-[10px]">·</span>}
                        </span>
                    ))}
                </nav>

                {/* Social + copyright */}
                <div className="flex items-center gap-3">
                    {socialLinks.map(({ icon: Icon, url, label: name }) => (
                        url ? (
                            <a
                                key={name}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={name}
                                className="text-muted-foreground hover:text-primary transition-colors"
                            >
                                <Icon size={14} />
                            </a>
                        ) : (
                            <span key={name} aria-label={name} className="text-muted-foreground/25">
                                <Icon size={14} />
                            </span>
                        )
                    ))}
                    <p className="text-[10px] font-mono text-muted-foreground/60">
                        {copyright_text || `© ${new Date().getFullYear()} ${label}`}
                    </p>
                </div>
            </div>
        </footer>
    );
}
