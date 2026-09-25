"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "@/hooks/use-theme";
import { getCurrentRolePermissions } from "@/lib/api";
import {
    LayoutDashboard,
    Mail,
    Video,
    Music,
    Clapperboard,
    Tv2,
    Ticket,
    Users,
    BadgeCheck,
    Megaphone,
    Settings,
    Palette,
    MenuSquare,
    Library,
    DollarSign,
    Landmark,
    FileStack,
    LayoutList,
    CalendarDays,
    MessageSquare,
    LifeBuoy,
    ReceiptText,
    BadgeDollarSign,
    ChevronDown,
    Layers,
    Zap,
    Lock,
    ShieldCheck,
    Timer,
    ChartNoAxesCombined,
    Handshake,
} from "lucide-react";

// Dashboard item (independent)
const DASHBOARD_ITEM = {
    href: "/admin",
    label: "Dashboard",
    icon: LayoutDashboard,
    exact: true,
};

const REPORTS_ITEM = {
    href: "/admin/reports",
    label: "Reports",
    icon: ChartNoAxesCombined,
    exact: false,
};

const NAV_GROUPS = [    
    {
        label: "Content",
        icon: Library,
        items: [
            { href: "/admin/media-library", label: "Media Library", icon: Library, exact: false },
            { href: "/admin/content/categories", label: "Categories", icon: LayoutList, exact: false },
            { href: "/admin/content/videos", label: "Videos", icon: Video, exact: false },
            { href: "/admin/content/audios", label: "Audios", icon: Music, exact: false },
            { href: "/admin/content/series", label: "Series", icon: Clapperboard, exact: false },
            { href: "/admin/content/ppv-events", label: "PPV Events", icon: Ticket, exact: false },
            { href: "/admin/content/live-tv", label: "Live TV", icon: Tv2, exact: false },
            { href: "/admin/content/epg", label: "EPG", icon: CalendarDays, exact: false },
        ],
    },
    // {
    //     label: "Encoding",
    //     icon: Zap,
    //     items: [
    //         { href: "/admin/encoding", label: "Encoding", icon: Tv2, exact: false },
    //     ],
    // },
    {
        label: "Monetization",
        icon: DollarSign,
        items: [
            { href: "/admin/advertisements", label: "Advertisements", icon: Megaphone, exact: false },
            { href: "/admin/pricing-plans", label: "Pricing Plans", icon: DollarSign, exact: false },
            { href: "/admin/coupons", label: "Coupons", icon: Ticket, exact: false },
            { href: "/admin/taxes", label: "Taxation", icon: BadgeDollarSign, exact: false },
            { href: "/admin/transactions", label: "Transactions", icon: ReceiptText, exact: false },
            { href: "/admin/payment-gateways", label: "Payment Settings", icon: Landmark, exact: false },
        ],
    },
    {
        label: "Audience",
        icon: Users,
        items: [
            { href: "/admin/users", label: "Users", icon: Users, exact: false },
            { href: "/admin/subscriptions", label: "Subscriptions", icon: BadgeCheck, exact: false },
            { href: "/admin/rent-ppv", label: "Rent & PPV", icon: Timer, exact: false },
            { href: "/admin/tickets", label: "Tickets", icon: MessageSquare, exact: false },
        ],
    },
    {
        label: "Platform",
        icon: Layers,
        items: [
            { href: "/admin/themes", label: "Themes", icon: Palette, exact: false },
            { href: "/admin/manage-menu", label: "Manage Menu", icon: MenuSquare, exact: false },
            { href: "/admin/pages", label: "Pages", icon: FileStack, exact: false },
        ],
    },
    {
        label: "Team & Access",
        icon: ShieldCheck,
        items: [
            { href: "/admin/roles", label: "Roles & Access", icon: ShieldCheck, exact: false },
            { href: "/admin/team-members", label: "Team Members", icon: Users, exact: false },
            { href: "/admin/content-partners", label: "Content Partners", icon: Handshake, exact: false },
        ],
    },
];

const SIDEBAR_GROUPS_STORAGE_KEY = "streamtvdepot:client-admin-sidebar-groups";

function NavLink({ href, label, icon: Icon, exact }: { href: string; label: string; icon: React.ElementType; exact: boolean }) {
    const pathname = usePathname();
    const { activeThemeId } = useTheme();
    const active = exact ? pathname === href : pathname.startsWith(href);

    return (
        <Link
            href={href}
            prefetch={false} // Avoid prefetching all admin pages for better performance
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-normal transition-all duration-150 ${active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
                }`}
        >
            <Icon size={16} className="shrink-0" />
            {label}
        </Link>
    );
}

export default function ClientAdminSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
    const pathname = usePathname();
    const { activeThemeId } = useTheme();
    const settingsActive = pathname.startsWith("/admin/settings");
    const inactiveTextClass = activeThemeId === "gold-light" ? "text-[#232324fc]" : "text-[#afb3befc]";
    const [permissionCodes, setPermissionCodes] = useState<Set<string> | null>(null);

    useEffect(() => {
        getCurrentRolePermissions()
            .then(codes => setPermissionCodes(new Set(codes)))
            .catch(() => setPermissionCodes(new Set()));
    }, []);

    const canAccess = (href: string) => {
        if (href === "/admin") return true;
        if (permissionCodes?.has("*")) return true;
        if (permissionCodes === null) return true;
        const permission = href.startsWith("/admin/reports")
            ? "reports.view"
            : href.startsWith("/admin/settings")
                ? "settings.view"
            : href.startsWith("/admin/roles") || href.startsWith("/admin/team-members") || href.startsWith("/admin/content-partners")
                ? "access.roles.manage"
            : href.startsWith("/admin/content") || href.startsWith("/admin/media-library")
            ? "content.view"
            : href.startsWith("/admin/advertisements") || href.startsWith("/admin/coupons")
                ? "marketing.view"
                : href.startsWith("/admin/users")
                    ? "audience.manage"
                    : href.startsWith("/admin/subscriptions")
                        ? "audience.subscriptions.view"
                        : href.startsWith("/admin/rent-ppv")
                            ? "audience.rent_ppv.view"
                            : href.startsWith("/admin/tickets")
                                ? "audience.tickets.manage"
                    : href.startsWith("/admin/pricing-plans") || href.startsWith("/admin/taxes") || href.startsWith("/admin/transactions") || href.startsWith("/admin/payment-gateways")
                        ? "monetization.view"
                        : "platform.view";
        return permissionCodes.has(permission);
    };

    // Determine which group contains the active menu item
    const getActiveGroupLabel = () => {
        for (const group of NAV_GROUPS) {
            const hasActiveItem = group.items.some(
                item => item.exact ? pathname === item.href : pathname.startsWith(item.href)
            );
            if (hasActiveItem) return group.label;
        }
        return null;
    };
    // Start with every group open; each group can then be controlled independently.
    const getInitialExpandedState = () => {
        const state: Record<string, boolean> = {};
        NAV_GROUPS.forEach(group => {
            state[group.label] = true;
        });
        return state;
    };

    // State for tracking expanded groups
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(getInitialExpandedState());
    const [hasLoadedStoredGroups, setHasLoadedStoredGroups] = useState(false);
    const activeGroupLabel = getActiveGroupLabel();
    // Restore and persist each group's independent expansion preference.
    useEffect(() => {
        try {
            const stored = localStorage.getItem(SIDEBAR_GROUPS_STORAGE_KEY);
            if (stored) {
                const parsed: unknown = JSON.parse(stored);
                if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                    setExpandedGroups(current => {
                        const saved = parsed as Record<string, unknown>;
                        const restored: Record<string, boolean> = { ...current };
                        NAV_GROUPS.forEach(group => {
                            if (typeof saved[group.label] === "boolean") {
                                restored[group.label] = saved[group.label] as boolean;
                            }
                        });
                        return restored;
                    });
                }
            }
        } catch {
            // Ignore unavailable or corrupt browser storage.
        } finally {
            setHasLoadedStoredGroups(true);
        }
    }, []);

    useEffect(() => {
        if (!hasLoadedStoredGroups) return;
        try {
            localStorage.setItem(SIDEBAR_GROUPS_STORAGE_KEY, JSON.stringify(expandedGroups));
        } catch {
            // Ignore unavailable browser storage.
        }
    }, [expandedGroups, hasLoadedStoredGroups]);

    const toggleGroup = (groupLabel: string) => {
        setExpandedGroups(prev => {
            return { ...prev, [groupLabel]: !prev[groupLabel] };
        });
    };

    // Close the sidebar on navigation on mobile without changing group state.
    useEffect(() => {
        onClose();
    }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <>
            {/* Backdrop — mobile only */}
            {open && (
                <div
                    className="fixed inset-0 z-30 bg-black/50 lg:hidden"
                    onClick={onClose}
                    aria-hidden="true"
                />
            )}

            {/* Sidebar panel */}
            <aside
                className={`fixed inset-y-0 left-0 z-40 w-60 flex flex-col h-screen border-r border-border bg-card
                    transition-transform duration-200 ease-in-out
                    lg:static lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:translate-x-0 lg:shrink-0
                    ${open ? "translate-x-0" : "-translate-x-full"}`}
            >
                {/* Scrollable navigation */}
                <nav
                    className="flex-1 min-h-0 p-3 space-y-3 overflow-y-auto
                    [&::-webkit-scrollbar]:w-1.5
                    [&::-webkit-scrollbar-track]:bg-transparent
                    [&::-webkit-scrollbar-thumb]:rounded-full
                    [&::-webkit-scrollbar-thumb]:bg-muted-foreground/40
                    hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/70"
                >
                    {/* Dashboard - Independent Item */}
                    {canAccess(DASHBOARD_ITEM.href) && <NavLink {...DASHBOARD_ITEM} />}
                    {canAccess(REPORTS_ITEM.href) && <NavLink {...REPORTS_ITEM} />}

                    {/* Grouped Navigation */}
                    {NAV_GROUPS.map((group) => {
                        const visibleItems = group.items.filter(item => canAccess(item.href));
                        if (visibleItems.length === 0) return null;
                        const GroupIcon = group.icon;
                        const isExpanded = expandedGroups[group.label];
                        const isActive = activeGroupLabel === group.label;
                        
                        return (
                            <div key={group.label} className="space-y-1">
                                <div>
                                    <button
                                        onClick={() => toggleGroup(group.label)}
                                        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-widest transition-all duration-150 ${
                                            isActive && !isExpanded
                                                ? "text-primary bg-primary/10"
                                                : (isActive || isExpanded)
                                                ? "text-foreground"
                                                : "text-foreground/55 dark:text-foreground/60 hover:bg-accent/20 hover:text-foreground"
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <GroupIcon size={14} className="shrink-0" />
                                            <span className="truncate">{group.label}</span>
                                        </div>
                                        <ChevronDown
                                            size={14}
                                            className={`shrink-0 transition-transform duration-200 ${
                                                isExpanded ? "rotate-180" : ""
                                            }`}
                                        />
                                    </button>
                                    
                                    {/* Smooth expand/collapse animation */}
                                    <div
                                        className={`overflow-hidden transition-all duration-500 ease-in-out ${
                                            isExpanded ? "max-h-screen opacity-100" : "max-h-0 opacity-0"
                                        }`}
                                    >
                                        <div className="space-y-0.5 mt-1 pl-2">
                                            {visibleItems.map((item) => (
                                                <NavLink key={item.href} {...item} />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </nav>

                {/* Settings pinned at bottom */}
                {canAccess("/admin/settings") && (
                    <div className="shrink-0 p-3 border-t border-border">
                        <Link
                            href="/admin/settings"
                            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-normal transition-all duration-150 ${settingsActive
                                    ? "bg-primary/10 text-primary"
                                    : `${inactiveTextClass} hover:text-foreground hover:bg-accent/40`
                                }`}
                        >
                            <Settings size={16} className="shrink-0" />
                            General Settings
                        </Link>
                    </div>
                )}
            </aside>
        </>
    );
}
