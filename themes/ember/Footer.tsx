/**
 * ember/Footer.tsx
 *
 * Two parts: a call-to-action strip (free / subscription / pay-per-view
 * highlights with a sign-up button, hidden once the viewer is signed in)
 * followed by a centred footer with logo, link row, socials and copyright.
 */
"use client";

import { Crown, Facebook, Instagram, Play, ShoppingCart, Youtube } from "lucide-react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import SiteLogo from "@/components/SiteLogo";
import { useAuth } from "@/hooks/use-auth";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { useTenantName } from "@/hooks/use-tenant-name";
import { fetchPublicActiveMenus, type PublicMenuLink } from "@/lib/services/menus";

const FALLBACK_FOOTER_LINKS: PublicMenuLink[] = [
    { id: "pricing", label: "Plans & Pricing", url: "/pricing", sort_order: 0 },
    { id: "help", label: "Help Center", url: "/account/help", sort_order: 1 },
];

const PERKS = [
    { icon: Play, title: "Free Content", text: "Enjoy a selection of movies and shows.", tint: "bg-primary/90" },
    { icon: Crown, title: "Premium Subscription", text: "Get unlimited access to exclusive content.", tint: "bg-amber-500" },
    { icon: ShoppingCart, title: "Pay-Per-View", text: "Rent the latest blockbusters.", tint: "bg-rose-500" },
];

export default function Footer() {
    const { user } = useAuth();
    const { copyright_text, youtube_url, instagram_url, facebook_url } = useSiteSettings();
    const label = useTenantName();

    const { data: menus } = useQuery({
        queryKey: ["active-menus"],
        queryFn: fetchPublicActiveMenus,
        staleTime: 60_000,
    });
    const links = menus?.footer?.links?.length ? menus.footer.links : FALLBACK_FOOTER_LINKS;

    const socials = [
        { icon: Facebook, url: facebook_url, label: "Facebook" },
        { icon: Instagram, url: instagram_url, label: "Instagram" },
        { icon: Youtube, url: youtube_url, label: "YouTube" },
    ].filter((s) => s.url);

    return (
        <footer>
            {!user && (
                <section className="mx-4 sm:mx-6 lg:mx-10 my-8  border border-primary/30 bg-gradient-to-r from-primary/10 via-card to-card px-6 py-6 flex flex-col lg:flex-row lg:items-center gap-6">
                    <div className="lg:w-1/4 space-y-1">
                        <h3 className="text-xl font-display font-800 text-gradient-gold leading-tight">
                            Unlimited Entertainment On Your Terms
                        </h3>
                        <p className="text-xs text-muted-foreground">
                            Watch free titles, subscribe for more, or rent the latest releases.
                        </p>
                    </div>
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {PERKS.map(({ icon: Icon, title, text, tint }) => (
                            <div key={title} className="flex items-center gap-3">
                                <span className={`w-10 h-10 shrink-0 rounded-md ${tint} text-white flex items-center justify-center`}>
                                    <Icon size={18} fill={Icon === Play ? "currentColor" : "none"} />
                                </span>
                                <div>
                                    <p className="text-sm font-semibold text-foreground">{title}</p>
                                    <p className="text-xs text-muted-foreground">{text}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <Link
                        href="/signup"
                        className="shrink-0 inline-flex items-center justify-center h-10 px-6 rounded-md text-sm font-semibold text-white bg-[image:var(--ember-gradient)] hover:brightness-110 transition"
                    >
                        Join {label}
                    </Link>
                </section>
            )}

            <div className="border-t border-border/60 px-4 sm:px-6 lg:px-14 py-8">
                <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
                    <SiteLogo
                        className="flex items-center gap-2"
                        imageSize={40}
                        labelClassName="text-2xl font-display font-800 italic text-gradient-gold tracking-tight"
                    />
                    <nav className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
                        {links.map((item) =>
                            item.url.startsWith("/") ? (
                                <Link key={item.id} href={item.url} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                                    {item.label}
                                </Link>
                            ) : (
                                <a
                                    key={item.id}
                                    href={item.url}
                                    target={item.target}
                                    rel={item.target === "_blank" ? "noreferrer" : undefined}
                                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    {item.label}
                                </a>
                            ),
                        )}
                    </nav>
                    <div className="flex items-center gap-4">
                        {socials.map(({ icon: Icon, url, label: name }) => (
                            <a
                                key={name}
                                href={url!}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={name}
                                className="text-foreground/80 hover:text-primary transition-colors"
                            >
                                <Icon size={18} />
                            </a>
                        ))}
                    </div>
                </div>
                <p className="mt-6 text-center text-[11px] text-muted-foreground">
                    {copyright_text || `© ${new Date().getFullYear()} ${label}. All rights reserved.`}
                </p>
            </div>
        </footer>
    );
}
