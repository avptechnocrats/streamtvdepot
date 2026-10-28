/**
 * ember/Footer.tsx
 *
 * Two parts: a call-to-action strip (hidden once the viewer is signed in)
 * followed by a column footer: brand + contact address, one column per saved
 * footer menu column, and social icons in the last column.
 */
"use client";

import { Crown, Facebook, Instagram, Mail, MapPin, Phone, Play, ShoppingCart, Youtube } from "lucide-react";
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

const MAX_COLUMNS = 6;
const linkClass = "text-sm text-muted-foreground hover:text-primary transition-colors";

function FooterLink({ item }: { item: PublicMenuLink }) {
    return item.url.startsWith("/") ? (
        <Link href={item.url} className={linkClass}>{item.label}</Link>
    ) : (
        <a href={item.url} target={item.target} rel={item.target === "_blank" ? "noreferrer" : undefined} className={linkClass}>
            {item.label}
        </a>
    );
}

export default function Footer() {
    const { user } = useAuth();
    const { copyright_text, youtube_url, instagram_url, facebook_url, address1, address2, phone, contact_email } = useSiteSettings();
    const label = useTenantName();

    const { data: menus } = useQuery({
        queryKey: ["active-menus"],
        queryFn: fetchPublicActiveMenus,
        staleTime: 60_000,
    });

    const footerMenu = menus?.footer;
    const links = footerMenu?.links?.length ? footerMenu.links : FALLBACK_FOOTER_LINKS;
    const columnCount = footerMenu?.links?.length
        ? Math.min(MAX_COLUMNS, Math.max(1, footerMenu.footer_columns || 1))
        : 1;
    const columns: PublicMenuLink[][] = Array.from({ length: columnCount }, () => []);
    const sortedLinks = [...links].sort((a, b) => a.sort_order - b.sort_order);
    const hasExplicitColumns = new Set(sortedLinks.map((item) => item.column_index || 1)).size > 1;
    if (hasExplicitColumns) {
        sortedLinks.forEach((item) => {
            columns[Math.min(columnCount, Math.max(1, item.column_index || 1)) - 1].push(item);
        });
    } else {
        // Links saved without per-column placement are split evenly, in order, across the columns.
        const perColumn = Math.ceil(sortedLinks.length / columnCount);
        sortedLinks.forEach((item, index) => columns[Math.floor(index / perColumn)].push(item));
    }

    const socials = [
        { icon: Facebook, url: facebook_url, label: "Facebook" },
        { icon: Instagram, url: instagram_url, label: "Instagram" },
        { icon: Youtube, url: youtube_url, label: "YouTube" },
    ].filter((s) => s.url);

    const contactLines = [
        { icon: MapPin, text: [address1, address2].filter(Boolean).join(", ") },
        { icon: Phone, text: phone },
        { icon: Mail, text: contact_email },
    ].filter((line) => line.text);

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

            <div className="border-t border-border/60 bg-card/40 px-4 sm:px-6 lg:px-14 pt-12 pb-6">
                <div
                    className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:[grid-template-columns:var(--footer-cols)]"
                    style={{
                        ["--footer-cols" as string]: `minmax(220px,1.5fr) repeat(${columnCount}, minmax(0,1fr)) minmax(150px,auto)`,
                    }}
                >
                    <div className="space-y-5">
                        <SiteLogo
                            className="flex items-center gap-2"
                            imageSize={44}
                            labelClassName="text-2xl font-display font-800 italic text-gradient-gold tracking-tight"
                        />
                        {contactLines.length > 0 && (
                            <ul className="space-y-3">
                                {contactLines.map(({ icon: Icon, text }) => (
                                    <li key={text} className="flex items-start gap-3 text-sm text-muted-foreground">
                                        <Icon size={15} className="mt-0.5 shrink-0 text-primary" />
                                        <span className="break-words">{text}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    {columns.map((column, index) => (
                        <nav key={index} aria-label={`Footer links ${index + 1}`} className="flex flex-col gap-3 sm:pt-1">
                            {column.map((item) => <FooterLink key={item.id} item={item} />)}
                        </nav>
                    ))}

                    <div className="space-y-4 sm:pt-1 lg:justify-self-end">
                        {socials.length > 0 && (
                            <>
                                <p className="text-xs font-semibold uppercase tracking-widest text-foreground/70">Follow Us</p>
                                <div className="flex items-center gap-3">
                                    {socials.map(({ icon: Icon, url, label: name }) => (
                                        <a
                                            key={name}
                                            href={url!}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            aria-label={name}
                                            className="flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-secondary/60 text-foreground/80 transition-colors hover:border-primary/60 hover:bg-primary/10 hover:text-primary"
                                        >
                                            <Icon size={17} />
                                        </a>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <p className="mt-10 border-t border-border/40 pt-5 text-center text-[11px] text-muted-foreground">
                    {copyright_text || `© ${new Date().getFullYear()} ${label}. All rights reserved.`}
                </p>
            </div>
        </footer>
    );
}
