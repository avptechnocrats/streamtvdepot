"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Bell, Search, LogOut, UserCircle, ShieldCheck, Activity, Bell as BellIcon, Globe, ChevronRight, Sun, Moon, Menu, BadgeDollarSign, ExternalLink, LifeBuoy, ReceiptText } from "lucide-react";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { useTheme } from "@/hooks/use-theme";
import { useToast } from "@/hooks/use-toast";
import AdminLogo from "@/components/AdminLogo";
import { getAdminDisplayName, getAdminFirstName } from "@/lib/admin-auth";
import { getCurrentRolePermissions, TOKEN_KEYS } from "@/lib/api";
import { getClientSlugFromAccessToken } from "@/lib/admin-auth";

const ADMIN_COLOR_MODE_KEY = "sv_admin_color_mode";

type SearchRole = "superadmin" | "clientAdmin";

interface SearchItem {
    label: string;
    href: string;
    roles: SearchRole[];
    section: string;
    keywords?: string[];
}

const SEARCH_ITEMS: SearchItem[] = [
    { label: "Dashboard", href: "/admin", roles: ["superadmin", "clientAdmin"], section: "General" },
    { label: "Account Information", href: "/admin/account", roles: ["superadmin", "clientAdmin"], section: "Account" },
    { label: "Security", href: "/admin/account/security", roles: ["superadmin", "clientAdmin"], section: "Account" },
    { label: "Account Activity", href: "/admin/account/activity", roles: ["superadmin", "clientAdmin"], section: "Account" },
    { label: "Notification Settings", href: "/admin/account/notifications", roles: ["superadmin", "clientAdmin"], section: "Account" },
    { label: "Language", href: "/admin/account/language", roles: ["superadmin", "clientAdmin"], section: "Account" },
    { label: "Billing and Licensing", href: "/admin/billing-licensing", roles: ["clientAdmin"], section: "Access" },
    { label: "Payment History", href: "/admin/payment-history", roles: ["clientAdmin"], section: "Access" },
    { label: "Pricing Plans", href: "/admin/pricing-plans", roles: ["clientAdmin"], section: "Monetization", keywords: ["plans"] },
    { label: "Coupons", href: "/admin/coupons", roles: ["clientAdmin"], section: "Monetization", keywords: ["discounts", "codes"] },
    { label: "Payment Gateways", href: "/admin/payment-gateways", roles: ["clientAdmin"], section: "Monetization", keywords: ["stripe", "paypal"] },
    { label: "Transactions", href: "/admin/transactions", roles: ["clientAdmin"], section: "Monetization" },
    { label: "Users", href: "/admin/users", roles: ["clientAdmin"], section: "Audience" },
    { label: "Subscriptions", href: "/admin/subscriptions", roles: ["clientAdmin"], section: "Audience" },
    { label: "Themes", href: "/admin/themes", roles: ["clientAdmin"], section: "Platform" },
    { label: "Manage Menu", href: "/admin/manage-menu", roles: ["clientAdmin"], section: "Platform" },
    { label: "Pages", href: "/admin/pages", roles: ["clientAdmin"], section: "Platform" },
    { label: "Media Library", href: "/admin/media-library", roles: ["clientAdmin"], section: "Overview" },
    { label: "Categories", href: "/admin/content/categories", roles: ["clientAdmin"], section: "Content" },
    { label: "Videos", href: "/admin/content/videos", roles: ["clientAdmin"], section: "Content" },
    { label: "Audios", href: "/admin/content/audios", roles: ["clientAdmin"], section: "Content" },
    { label: "Series", href: "/admin/content/series", roles: ["clientAdmin"], section: "Content" },
    { label: "Live TV", href: "/admin/content/live-tv", roles: ["clientAdmin"], section: "Content" },
    { label: "EPG", href: "/admin/content/epg", roles: ["clientAdmin"], section: "Content" },
    { label: "PPV Events", href: "/admin/content/ppv-events", roles: ["clientAdmin"], section: "Content", keywords: ["pay per view"] },
    { label: "Advertisements", href: "/admin/advertisements", roles: ["clientAdmin"], section: "Monetization" },
    { label: "Support", href: "/admin/support", roles: ["clientAdmin"], section: "Support", keywords: ["help"] },
    { label: "Tickets", href: "/admin/tickets", roles: ["clientAdmin"], section: "Support" },
    { label: "Contact Submissions", href: "/admin/contact-submissions", roles: ["superadmin", "clientAdmin"], section: "Support" },
    { label: "Clients", href: "/admin/clients", roles: ["superadmin"], section: "Platform" },
    { label: "Plans", href: "/admin/plans", roles: ["superadmin"], section: "Platform" },
    { label: "Usage Tracking", href: "/admin/usage", roles: ["superadmin"], section: "Platform" },
    { label: "Alerts", href: "/admin/alerts", roles: ["superadmin"], section: "Platform" },
    { label: "Demo Content", href: "/admin/demo-content", roles: ["superadmin"], section: "Platform", keywords: ["sample", "default content", "demo videos"] },
    { label: "Billing", href: "/admin/billing", roles: ["superadmin"], section: "Revenue" },
    { label: "Demo Bookings", href: "/admin/system/demo-bookings", roles: ["superadmin"], section: "System" },
    { label: "Mail Logs", href: "/admin/system/mail-logs", roles: ["superadmin"], section: "System" },
    { label: "Job Scheduler", href: "/admin/system/jobs", roles: ["superadmin"], section: "System" },
    { label: "Payment Gateways", href: "/admin/system/payment-gateways", roles: ["superadmin"], section: "System", keywords: ["stripe", "paypal"] },
    { label: "Settings", href: "/admin/settings", roles: ["superadmin", "clientAdmin"], section: "System" },
];

export default function AdminTopbar({ onMenuClick }: { onMenuClick?: () => void }) {
    const { session, role, logout } = useAdminAuth();
    const { activeThemeId, setTheme } = useTheme();
    const router = useRouter();
    const { toast } = useToast();

    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isOwner, setIsOwner] = useState(false);

    useEffect(() => {
        if (role !== "clientAdmin" || typeof window === "undefined") return;
        const token = localStorage.getItem(TOKEN_KEYS.access);
        if (!token) return;
        const slug = getClientSlugFromAccessToken(token);
        if (slug && process.env.NEXT_PUBLIC_PREVIEW_DOMAIN) {
            setPreviewUrl(`https://${slug}.${process.env.NEXT_PUBLIC_PREVIEW_DOMAIN}`);
        }
    }, [role]);

    useEffect(() => {
        if (role !== "clientAdmin") {
            setIsOwner(false);
            return;
        }

        getCurrentRolePermissions()
            .then((permissions) => setIsOwner(permissions.includes("*")))
            .catch(() => setIsOwner(false));
    }, [role]);

    const isLight = activeThemeId === "gold-light";
    const toggleDarkLight = () => {
        const nextMode = isLight ? "dark" : "light";
        setTheme(nextMode === "light" ? "gold-light" : "dark-gold");
        localStorage.setItem(ADMIN_COLOR_MODE_KEY, nextMode);
    };
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const searchWrapRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchOpen, setSearchOpen] = useState(false);
    const [activeResultIndex, setActiveResultIndex] = useState(0);

    useEffect(() => {
        const savedMode = localStorage.getItem(ADMIN_COLOR_MODE_KEY);
        if (savedMode === "light") {
            setTheme("gold-light");
            return;
        }
        if (savedMode === "dark") {
            setTheme("dark-gold");
        }
        // Restore persisted choice once on mount; rerunning this effect can
        // cause repeated theme state writes and render loops.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setDropdownOpen(false);
            }
            if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
                setSearchOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        function handleQuickSearch(event: KeyboardEvent) {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
                event.preventDefault();
                searchInputRef.current?.focus();
                setSearchOpen(true);
            }
        }
        window.addEventListener("keydown", handleQuickSearch);
        return () => window.removeEventListener("keydown", handleQuickSearch);
    }, []);

    const handleLogout = () => {
        logout();
        router.push("/login");
    };

    const menuItems = [
        { icon: UserCircle, label: "Account Information", href: "/admin/account" },
        ...(role === "clientAdmin"
            ? [
                ...(isOwner
                    ? [
                        { icon: BadgeDollarSign, label: "Billing and Licensing", href: "/admin/billing-licensing" },
                        { icon: ReceiptText, label: "Payment History", href: "/admin/payment-history" },
                    ]
                    : []),
                { icon: LifeBuoy, label: "Help & Support", href: "/admin/support" },
            ]
            : []),
        { icon: Globe, label: "Language", href: "/admin/account/language" },
    ];

    const displayName = getAdminFirstName(session);
    const fullDisplayName = getAdminDisplayName(session);
    const initial = displayName?.[0]?.toUpperCase() ?? "A";
    const roleLabel = role === "superadmin" ? "Super Admin" : "Client Admin";

    const searchResults = useMemo(() => {
        const normalized = searchQuery.trim().toLowerCase();
        if (!normalized || !role) return [];

        return SEARCH_ITEMS
            .filter((item) => item.roles.includes(role as SearchRole))
            .filter((item) => {
                const haystack = `${item.label} ${item.section} ${(item.keywords || []).join(" ")}`.toLowerCase();
                return haystack.includes(normalized);
            })
            .slice(0, 8);
    }, [searchQuery, role]);

    useEffect(() => {
        if (!searchOpen) return;
        setActiveResultIndex(0);
    }, [searchQuery, searchOpen]);

    const selectSearchResult = (href: string) => {
        setSearchOpen(false);
        setSearchQuery("");
        router.push(href);
    };

    const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (!searchOpen && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            setSearchOpen(true);
            return;
        }

        if (!searchResults.length) {
            if (event.key === "Escape") setSearchOpen(false);
            return;
        }

        if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveResultIndex((idx) => (idx + 1) % searchResults.length);
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveResultIndex((idx) => (idx - 1 + searchResults.length) % searchResults.length);
        } else if (event.key === "Enter") {
            event.preventDefault();
            const selected = searchResults[activeResultIndex];
            if (selected) selectSearchResult(selected.href);
        } else if (event.key === "Escape") {
            setSearchOpen(false);
        }
    };

    return (
        <header className="sticky top-0 z-50 h-16 shrink-0 flex items-center px-5 border-b border-border bg-card">

            {/* Hamburger (mobile only) + Branding */}
            <div className="flex items-center gap-2 lg:w-52 shrink-0">
                <button
                    onClick={onMenuClick}
                    className="lg:hidden p-2 -ml-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                    aria-label="Toggle navigation"
                >
                    <Menu size={18} />
                </button>
                <AdminLogo href="/admin" showText={false} className="font-display tracking-tight flex items-center gap-2 text-xl" />
            </div>

            {/* Search — centred, hidden on small screens */}
            <div className="hidden md:flex flex-1 justify-center">
                <div ref={searchWrapRef} className="relative w-full max-w-sm">
                    <Search
                        size={14}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                    />
                    <input
                        ref={searchInputRef}
                        type="search"
                        value={searchQuery}
                        onChange={(event) => {
                            setSearchQuery(event.target.value);
                            setSearchOpen(true);
                        }}
                        onFocus={() => setSearchOpen(true)}
                        onKeyDown={handleSearchKeyDown}
                        placeholder="Search menu and pages..."
                        aria-label="Search menu items"
                        aria-expanded={searchOpen}
                        aria-autocomplete="list"
                        className="w-full h-8 pl-8 pr-3 rounded-md bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                    />

                    {searchOpen && searchQuery.trim() && (
                        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 rounded-lg border border-border bg-card shadow-xl overflow-hidden">
                            {searchResults.length > 0 ? (
                                <ul className="max-h-80 overflow-y-auto py-1">
                                    {searchResults.map((item, index) => (
                                        <li key={item.href}>
                                            <button
                                                type="button"
                                                onMouseDown={(event) => event.preventDefault()}
                                                onClick={() => selectSearchResult(item.href)}
                                                className={`w-full text-left px-3 py-2.5 transition-colors ${
                                                    index === activeResultIndex
                                                        ? "bg-primary/10 text-foreground"
                                                        : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                                                }`}
                                            >
                                                <p className="text-sm font-medium leading-tight">{item.label}</p>
                                                <p className="text-[11px] text-muted-foreground mt-0.5">{item.section}</p>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div className="px-3 py-3 text-xs text-muted-foreground">
                                    No matching pages. Try another keyword.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Right: notifications + user */}
            <div className="w-auto flex items-center justify-end gap-2">

                {/* Preview Site — clientAdmin only */}
                {role === "clientAdmin" && (
                    <button
                        onClick={() => {
                            if (previewUrl) {
                                window.open(previewUrl, "_blank");
                            } else {
                                toast({
                                    title: "Preview URL Not Assigned",
                                    description: "Preview url not assigned. Contact Support",
                                    variant: "destructive",
                                });
                            }
                        }}
                        className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-medium transition-colors ${
                            previewUrl
                                ? "text-muted-foreground hover:text-foreground hover:bg-surface-hover cursor-pointer"
                                : "text-muted-foreground/40 cursor-not-allowed opacity-50"
                        }`}
                        title={previewUrl ? "Open preview site" : "Preview URL not assigned"}
                        disabled={!previewUrl}
                    >
                        <ExternalLink size={13} />
                        <span>Preview Site</span>
                    </button>
                )}

                {/* Dark / Light toggle */}
                <button
                    onClick={toggleDarkLight}
                    className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                    aria-label={isLight ? "Switch to dark mode" : "Switch to light mode"}
                    title={isLight ? "Switch to dark mode" : "Switch to light mode"}
                >
                    {isLight ? <Moon size={17} /> : <Sun size={17} />}
                </button>

                {/* Notification bell */}
                <button
                    className="relative p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                    aria-label="Notifications"
                >
                    <Bell size={17} />
                    <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-primary" />
                </button>

                {/* User dropdown */}
                <div className="relative" ref={dropdownRef}>
                    <button
                        onClick={() => setDropdownOpen((v) => !v)}
                        className="flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-md hover:bg-surface-hover transition-colors"
                        aria-expanded={dropdownOpen}
                    >
                        <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary text-md font-bold uppercase shrink-0">
                            {initial}
                        </div>
                        <div className="hidden sm:block text-left leading-tight">
                            <p className="text-xs font-semibold text-foreground truncate max-w-[120px]">{displayName}</p>
                            <p className="text-[10px] text-muted-foreground">{roleLabel}</p>
                        </div>
                    </button>

                    {dropdownOpen && (
                        <div className="absolute right-0 top-full mt-1.5 w-56 rounded-xl border border-border bg-card shadow-xl py-1.5 z-50">
                            {/* Identity header */}
                            <div className="px-4 py-3 border-b border-border mb-1">
                                <p className="text-xs font-semibold text-foreground truncate">{fullDisplayName}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{session?.email}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">{roleLabel}</p>
                            </div>

                            {/* Menu items */}
                            {menuItems.map(({ icon: Icon, label, href }) => (
                                <a
                                    key={href}
                                    href={href}
                                    onClick={() => setDropdownOpen(false)}
                                    className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                                >
                                    <Icon size={14} className="shrink-0" />
                                    <span className="flex-1">{label}</span>
                                    <ChevronRight size={12} className="opacity-30" />
                                </a>
                            ))}

                            {/* Logout */}
                            <div className="border-t border-border mt-1 pt-1">
                                <button
                                    onClick={handleLogout}
                                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-surface-hover transition-colors"
                                >
                                    <LogOut size={14} className="shrink-0" />
                                    Logout
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}

