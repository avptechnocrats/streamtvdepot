/**
 * midnight/Footer.tsx — HBO Max editorial two-column footer.
 */
"use client";

import { useSiteSettings } from "@/hooks/use-site-settings";
import { Youtube, Instagram, Facebook } from "lucide-react";

const cols = [
    { heading: "Explore", links: ["Series", "Movies", "Originals", "Sports", "Kids", "Documentaries"] },
    { heading: "Account", links: ["Sign In", "Manage Profile", "Subscription", "Gift Cards", "Devices"] },
    { heading: "Help", links: ["Help Center", "Contact Us", "Privacy Policy", "Terms of Use", "Accessibility"] },
];

export default function Footer() {
    const { site_title, copyright_text, tagline, youtube_url, instagram_url, facebook_url } = useSiteSettings();
    const label = site_title || "StreamTVDepot";

    const socialLinks = [
        { icon: Youtube, url: youtube_url, label: "YouTube" },
        { icon: Instagram, url: instagram_url, label: "Instagram" },
        { icon: Facebook, url: facebook_url, label: "Facebook" },
    ];

    return (
        <footer className="px-6 lg:px-14 pt-12 pb-8 border-t border-border/30 mt-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-10">
                {/* Brand column */}
                <div>
                    <p className="text-xl font-black text-foreground tracking-tighter mb-3">{label}</p>
                    <p className="text-[12px] text-muted-foreground leading-relaxed max-w-[200px]">
                        {tagline || "Premium streaming. Unlimited stories. Watch anywhere."}
                    </p>
                    <div className="flex gap-3 mt-5">
                        {socialLinks.map(({ icon: Icon, url, label: name }) => (
                            url ? (
                                <a
                                    key={name}
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={name}
                                    className="w-8 h-8 rounded-sm bg-secondary border border-border/50 flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
                                >
                                    <Icon size={14} />
                                </a>
                            ) : (
                                <span key={name} aria-label={name} className="w-8 h-8 rounded-sm bg-secondary border border-border/50 flex items-center justify-center text-muted-foreground/30">
                                    <Icon size={14} />
                                </span>
                            )
                        ))}
                    </div>
                </div>

                {/* Link columns */}
                {cols.map((col) => (
                    <div key={col.heading}>
                        <p className="text-[11px] font-bold text-foreground/60 uppercase tracking-[0.18em] mb-4">{col.heading}</p>
                        <div className="space-y-2.5">
                            {col.links.map((l) => (
                                <a key={l} href="#" className="block text-[12px] text-muted-foreground hover:text-foreground transition-colors">{l}</a>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-6 border-t border-border/20">
                <p className="text-[11px] text-muted-foreground/50">
                    {copyright_text || `© ${new Date().getFullYear()} ${label}. All rights reserved.`}
                </p>
                <div className="flex gap-4">
                    {["Privacy", "Terms", "Cookies"].map((l) => (
                        <a key={l} href="#" className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors">{l}</a>
                    ))}
                </div>
            </div>
        </footer>
    );
}
