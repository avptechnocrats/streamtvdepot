/**
 * apple-tv/Footer.tsx — Apple TV+ inspired ultra-minimal footer.
 */
"use client";

import { useSiteSettings } from "@/hooks/use-site-settings";
import { Youtube, Instagram, Facebook } from "lucide-react";

const navLinks = ["Home", "Movies", "TV Shows", "Privacy Policy", "Terms of Use", "Help"];

export default function Footer() {
    const { site_title, copyright_text, youtube_url, instagram_url, facebook_url } = useSiteSettings();
    const label = site_title || "StreamTVDepot";

    const socialLinks = [
        { icon: Youtube, url: youtube_url, label: "YouTube" },
        { icon: Instagram, url: instagram_url, label: "Instagram" },
        { icon: Facebook, url: facebook_url, label: "Facebook" },
    ];

    return (
        <footer className="px-6 lg:px-14 pt-10 pb-8 bg-black/40">

            {/* Logo + social row */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/80">
                        <svg width="8" height="10" viewBox="0 0 10 12" fill="currentColor" className="text-black translate-x-[1px]">
                            <path d="M1 1l8 5-8 5V1z" />
                        </svg>
                    </span>
                    <span className="text-[12px] font-semibold text-white/60 tracking-tight">{label}</span>
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
                                className="w-7 h-7 rounded-full border border-white/15 flex items-center justify-center text-white/30 hover:text-white/60 hover:border-white/30 transition-colors"
                            >
                                <Icon size={13} />
                            </a>
                        ) : (
                            <span key={name} aria-label={name} className="w-7 h-7 rounded-full border border-white/10 flex items-center justify-center text-white/15">
                                <Icon size={13} />
                            </span>
                        )
                    ))}
                </div>
            </div>

            {/* Links */}
            <nav className="flex flex-wrap gap-x-5 gap-y-2 mb-6">
                {navLinks.map((l) => (
                    <a key={l} href="#" className="text-[11px] text-white/30 hover:text-white/60 transition-colors">{l}</a>
                ))}
            </nav>

            {/* Copyright */}
            <p className="text-[10px] text-white/20 leading-relaxed max-w-lg">
                {copyright_text || `© ${new Date().getFullYear()} ${label}. All rights reserved.`}
            </p>
        </footer>
    );
}
