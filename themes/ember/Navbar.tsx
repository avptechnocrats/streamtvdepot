/**
 * ember/Navbar.tsx
 *
 * Solid dark top bar: logo on the left, text links with a gradient underline
 * on the active item, an inline search field and the account actions on the
 * right. Links come from the tenant's header menu (with a fallback).
 */
"use client";

import { ChevronDown, Menu, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import SiteLogo from "@/components/SiteLogo";
import SearchOverlay from "@/components/SearchOverlay";
import StorefrontActions from "@/components/StorefrontActions";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fetchPublicActiveMenus, type PublicMenuLink } from "@/lib/services/menus";

const FALLBACK_HEADER_LINKS: PublicMenuLink[] = [
    { id: "home", label: "Home", url: "/", sort_order: 0 },
    { id: "movies", label: "Movies", url: "/movies", sort_order: 1 },
    { id: "tv-shows", label: "Series", url: "/tv-shows", sort_order: 2 },
    { id: "ppv", label: "PPV", url: "/ppv-events", sort_order: 3 },
    { id: "pricing", label: "Pricing", url: "/pricing", sort_order: 4 },
];

export default function Navbar() {
    const pathname = usePathname();
    const [searchOpen, setSearchOpen] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    const { data: menus } = useQuery({
        queryKey: ["active-menus"],
        queryFn: fetchPublicActiveMenus,
        staleTime: 60_000,
    });

    const activeHeaderMenu = menus?.header?.links?.length ? menus.header : null;
    const headerLinks = activeHeaderMenu?.links ?? FALLBACK_HEADER_LINKS;
    const maxMenuDisplay =
        typeof activeHeaderMenu?.max_menu_display === "number"
            ? Math.min(12, Math.max(1, activeHeaderMenu.max_menu_display))
            : headerLinks.length;
    const visibleLinks = headerLinks.slice(0, maxMenuDisplay);
    const overflowLinks = headerLinks.slice(maxMenuDisplay);

    function isActive(href: string) {
        if (!href.startsWith("/")) return false;
        if (href === "/") return pathname === "/";
        return pathname.startsWith(href);
    }

    function renderLink(item: PublicMenuLink, className: string, onClick?: () => void) {
        return item.url.startsWith("/") ? (
            <Link key={item.id} href={item.url} className={className} onClick={onClick}>
                {item.label}
            </Link>
        ) : (
            <a
                key={item.id}
                href={item.url}
                target={item.target}
                rel={item.target === "_blank" ? "noreferrer" : undefined}
                className={className}
                onClick={onClick}
            >
                {item.label}
            </a>
        );
    }

    return (
        <>
            <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
            <nav className="fixed top-0 left-0 right-0 py-2 z-50 bg-background/95 backdrop-blur-md border-b border-border/60">
                <div className="flex items-center justify-between gap-4 px-4 sm:px-6 lg:px-14 h-14">
                    <div className="flex items-center gap-6 lg:gap-10 min-w-0">
                        <SiteLogo
                            className="flex items-center gap-2 shrink-0"
                            imageSize={32}
                            labelClassName="text-xl font-display font-800 italic text-gradient-gold tracking-tight"
                        />
                        <div className="hidden md:flex items-center gap-1">
                            {visibleLinks.map((item) =>
                                renderLink(
                                    item,
                                    `relative px-3 py-4 text-[14px] font-medium transition-colors ${isActive(item.url)
                                        ? "text-foreground after:absolute after:left-3 after:right-3 after:bottom-2 after:h-[2px] after:rounded-full after:bg-primary"
                                        : "text-muted-foreground hover:text-foreground"
                                    }`,
                                ),
                            )}
                            {overflowLinks.length > 0 && (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <button className="flex items-center gap-1 px-3 py-4 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors focus:outline-none">
                                            More <ChevronDown size={13} />
                                        </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start" className="min-w-44">
                                        {overflowLinks.map((item) => (
                                            <DropdownMenuItem key={item.id} asChild>
                                                {renderLink(item, "cursor-pointer")}
                                            </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-2 lg:gap-3">
                        <button
                            onClick={() => setSearchOpen(true)}
                            className="relative hidden lg:flex h-10 w-10 items-center justify-center rounded-lg  text-muted-foreground hover:text-black transition-colors before:absolute before:inset-1.5 before:rounded-full before:bg-transparent before:transition-colors hover:before:bg-foreground hover:text-background"
                            aria-label="Search"
                        >
                            <Search size={18} strokeWidth={2.8} className="relative z-10" />
                        </button>
                        <StorefrontActions
                            scrolled
                            className="flex items-center gap-1"
                            buttonClassName="lg:hidden p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                            accountClassName="flex items-center gap-1.5 px-1.5 py-1 rounded-full text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                        />
                        <button
                            className="md:hidden p-2 rounded-md text-muted-foreground hover:text-foreground transition-colors"
                            onClick={() => setMobileOpen((v) => !v)}
                            aria-label="Toggle menu"
                        >
                            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
                        </button>
                    </div>
                </div>

                {mobileOpen && (
                    <div className="md:hidden border-t border-border/60 bg-background">
                        {headerLinks.map((item) =>
                            renderLink(
                                item,
                                `block px-6 py-3 text-sm font-medium border-l-2 ${isActive(item.url)
                                    ? "text-foreground border-primary bg-primary/10"
                                    : "text-muted-foreground border-transparent hover:text-foreground"
                                }`,
                                () => setMobileOpen(false),
                            ),
                        )}
                    </div>
                )}
            </nav>
        </>
    );
}
