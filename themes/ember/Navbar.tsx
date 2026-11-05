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
import { useEffect, useRef, useState } from "react";
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
    const [moreOpen, setMoreOpen] = useState(false);
    const [fittingLinkCount, setFittingLinkCount] = useState(0);
    const desktopMenuRef = useRef<HTMLDivElement>(null);
    const measurementRef = useRef<HTMLDivElement>(null);
    const [scrolled, setScrolled] = useState(false);
    const solid = scrolled || mobileOpen || moreOpen || searchOpen;
    const textShadow = solid ? undefined : "0 1px 3px rgba(0,0,0,0.95), 0 2px 8px rgba(0,0,0,0.85), 0 0 16px rgba(0,0,0,0.6)";
    const iconShadow = solid ? undefined : "drop-shadow(0 1px 3px rgba(0,0,0,0.95)) drop-shadow(0 2px 8px rgba(0,0,0,0.85)) drop-shadow(0 0 16px rgba(0,0,0,0.6))";

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 24);
        };
        handleScroll();
        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => window.removeEventListener("scroll", handleScroll);
    }, [pathname]);

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
    const visibleCount = Math.min(fittingLinkCount, maxMenuDisplay, headerLinks.length);
    const visibleLinks = headerLinks.slice(0, visibleCount);
    const overflowLinks = headerLinks.slice(visibleCount);

    useEffect(() => {
        const menu = desktopMenuRef.current;
        const measurements = measurementRef.current;
        if (!menu || !measurements) return;
        let cancelled = false;
        const measure = () => {
            if (cancelled) return;
            if (menu.clientWidth === 0) {
                setMoreOpen(false);
                return;
            }
            setMobileOpen(false);
            const widths = Array.from(measurements.children, child => child.getBoundingClientRect().width);
            const moreWidth = widths.pop() ?? 0;
            const gap = parseFloat(getComputedStyle(menu).columnGap) || 0;
            const limit = Math.min(maxMenuDisplay, headerLinks.length);
            const availableWidth = menu.getBoundingClientRect().width;
            const allLinksWidth = widths.slice(0, limit).reduce((total, width) => total + width, 0) + gap * Math.max(0, limit - 1);
            if (limit === headerLinks.length && allLinksWidth <= availableWidth) {
                setFittingLinkCount(limit);
                setMoreOpen(false);
                return;
            }
            let count = 0;
            let usedWidth = moreWidth;
            while (count < limit && usedWidth + widths[count] + gap <= availableWidth) {
                usedWidth += widths[count] + gap;
                count++;
            }
            setFittingLinkCount(count);
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(menu);
        observer.observe(measurements);
        window.addEventListener("resize", measure);
        void document.fonts.ready.then(measure);
        return () => {
            cancelled = true;
            observer.disconnect();
            window.removeEventListener("resize", measure);
        };
    }, [headerLinks, maxMenuDisplay]);

    useEffect(() => {
        setMoreOpen(false);
        setMobileOpen(false);
    }, [pathname]);

    function isActive(href: string) {
        if (!href.startsWith("/")) return false;
        if (href === "/") return pathname === "/";
        return pathname.startsWith(href);
    }

    function renderMenuLabel(label: string) {
        return <span style={{ textShadow }}>
            {label}
        </span>;
    }

    function renderLink(item: PublicMenuLink, className: string, onClick?: () => void, backdrop = false) {
        const label = backdrop ? renderMenuLabel(item.label) : item.label;
        return item.url.startsWith("/") ? (
            <Link key={item.id} href={item.url} className={className} onClick={onClick}>
                {label}
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
                {label}
            </a>
        );
    }

    return (
        <>
            <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
            <nav
                className={`fixed top-0 left-0 right-0 py-2 z-50 border-b transition-colors duration-300 motion-reduce:transition-none ${solid ? "bg-background/95 backdrop-blur-md border-border/60" : "bg-transparent border-transparent"}`}
            >
                <div className="flex items-center justify-between gap-4 px-4 sm:px-6 lg:px-14 h-14">
                    <div className="flex flex-1 items-center gap-6 lg:gap-10 min-w-0">
                        <SiteLogo
                            className="flex items-center gap-2 shrink-0"
                            imageSize={32}
                            labelClassName="text-xl font-display font-800 italic text-gradient-gold tracking-tight"
                        />
                        <div ref={desktopMenuRef} aria-label="Main menu" className="relative hidden min-w-0 flex-1 items-center gap-1 lg:flex">
                            <div aria-hidden="true" className="pointer-events-none invisible absolute inset-0 overflow-hidden">
                                <div ref={measurementRef} className="flex w-max items-center gap-1">
                                    {headerLinks.map(item => <span key={item.id} className="shrink-0 whitespace-nowrap px-3 py-4 text-[14px] font-medium">{item.label}</span>)}
                                    <span className="flex shrink-0 items-center gap-1 whitespace-nowrap px-3 py-4 text-[14px] font-medium">More <ChevronDown size={13} /></span>
                                </div>
                            </div>
                            {visibleLinks.map((item) =>
                                renderLink(
                                    item,
                                    `relative shrink-0 whitespace-nowrap px-3 py-4 text-[14px] font-medium transition-colors ${isActive(item.url)
                                        ? "text-foreground after:absolute after:left-3 after:right-3 after:bottom-2 after:h-[2px] after:rounded-full after:bg-primary"
                                        : solid ? "text-muted-foreground hover:text-foreground" : "text-white/85 hover:text-white"
                                    }`,
                                    undefined,
                                    true,
                                ),
                            )}
                            {overflowLinks.length > 0 && (
                                <DropdownMenu open={moreOpen} onOpenChange={setMoreOpen}>
                                    <DropdownMenuTrigger asChild>
                                        <button type="button" className={`flex shrink-0 items-center gap-1 whitespace-nowrap px-3 py-4 text-[14px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${solid ? "text-muted-foreground hover:text-foreground" : "text-white/85 hover:text-white"}`}>
                                            {renderMenuLabel("More")} <ChevronDown size={13} />
                                        </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start" className="max-h-[min(70vh,28rem)] min-w-44 max-w-[calc(100vw-2rem)] overflow-y-auto lg:block">
                                        {overflowLinks.map((item) => (
                                            <DropdownMenuItem key={item.id} asChild>
                                                {renderLink(item, `cursor-pointer ${isActive(item.url) ? "text-primary" : ""}`, () => setMoreOpen(false))}
                                            </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}
                        </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2 lg:gap-3" style={{ textShadow }}>
                        <button
                            onClick={() => setSearchOpen(true)}
                            className={`hidden lg:flex h-10 w-10 items-center justify-center rounded-md transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${solid ? "text-foreground" : "text-white"}`}
                            aria-label="Search"
                            title="Search"
                        >
                            <Search size={22} strokeWidth={3} style={{ filter: iconShadow }} />
                        </button>
                        <StorefrontActions
                            scrolled={solid}
                            iconShadow={iconShadow}
                            className="flex items-center gap-1"
                            buttonClassName={`lg:hidden flex h-10 w-10 items-center justify-center rounded-md hover:text-primary transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${solid ? "text-foreground" : "text-white"}`}
                            accountClassName={`flex h-10 items-center gap-2 px-2 py-1 rounded-full text-base font-bold hover:text-primary transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${solid ? "text-foreground" : "text-white"}`}
                        />
                        <button
                            className="lg:hidden p-2 rounded-md text-muted-foreground hover:text-foreground transition-colors"
                            onClick={() => setMobileOpen((v) => !v)}
                            aria-label="Toggle menu"
                            aria-expanded={mobileOpen}
                        >
                            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
                        </button>
                    </div>
                </div>

                {mobileOpen && (
                    <div className="lg:hidden max-h-[calc(100dvh-72px)] overflow-y-auto border-t border-border/60 bg-background">
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
