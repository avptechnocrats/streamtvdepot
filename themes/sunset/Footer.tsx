/**
 * sunset/Footer.tsx — Peacock/Sunset warm footer.
 */
"use client";

import { useSiteSettings } from "@/hooks/use-site-settings";
import { Youtube, Instagram, Facebook } from "lucide-react";

const links = [
    { heading: "Watch", items: ["Home", "Shows", "Movies", "Sports", "News", "Kids"] },
    { heading: "Account", items: ["Sign In", "My Profile", "Subscription", "Settings"] },
    { heading: "More", items: ["Help Center", "Privacy", "Terms", "About Us"] },
];

export default function Footer() {
    const { site_title, copyright_text, tagline, youtube_url, instagram_url, facebook_url } = useSiteSettings();
    const label = site_title || "SignalView";

    const socialLinks = [
        { icon: Youtube, url: youtube_url, label: "YouTube" },
        { icon: Instagram, url: instagram_url, label: "Instagram" },
        { icon: Facebook, url: facebook_url, label: "Facebook" },
    ];

    return (
        <footer className="mt-8 border-t-4 border-primary/60">
            <div className="px-6 lg:px-14 pt-10 pb-8 bg-gradient-to-b from-secondary/20 to-background">

                {/* Brand + tagline + social */}
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
                    <div>
                        <p className="text-xl font-black tracking-tight text-gradient-gold mb-1.5">{label}</p>
                        <p className="text-[12px] text-muted-foreground">{tagline || "Stream what you love, when you want it."}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {socialLinks.map(({ icon: Icon, url, label: name }) => (
                            url ? (
                                <a
                                    key={name}
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={name}
                                    className="w-9 h-9 rounded-full border border-border/60 flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
                                >
                                    <Icon size={15} />
                                </a>
                            ) : (
                                <span key={name} aria-label={name} className="w-9 h-9 rounded-full border border-border/60 flex items-center justify-center text-muted-foreground/30">
                                    <Icon size={15} />
                                </span>
                            )
                        ))}
                    </div>
                </div>

                {/* Links grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6 mb-8">
                    {links.map((col) => (
                        <div key={col.heading}>
                            <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-3">{col.heading}</p>
                            <div className="space-y-2">
                                {col.items.map((l) => (
                                    <a key={l} href="#" className="block text-[12px] text-muted-foreground hover:text-foreground transition-colors">{l}</a>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {/* App store badges */}
                <div className="flex flex-wrap gap-3 mb-7">
                    {["App Store", "Google Play", "Smart TV"].map((b) => (
                        <div key={b} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border/60 bg-secondary/50 hover:bg-secondary transition-colors cursor-pointer">
                            <span className="text-[11px] font-semibold text-muted-foreground">↓ {b}</span>
                        </div>
                    ))}
                </div>

                <p className="text-[11px] text-muted-foreground/40">
                    {copyright_text || `© ${new Date().getFullYear()} ${label}. All rights reserved.`}
                </p>
            </div>
        </footer>
    );
}
