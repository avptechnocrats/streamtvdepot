"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useTheme } from "@/hooks/use-theme";
import {
    LayoutDashboard,
    Users,
    CreditCard,
    Receipt,
    Settings,
    MessageSquare,
    Mail,
    BarChart2,
    Bell,
    Film,
    Activity,
} from "lucide-react";

const NAV_GROUPS = [
    {
        label: "Platform",
        items: [
            { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
            { href: "/admin/clients", label: "Clients", icon: Users, exact: false },
            { href: "/admin/demo-content", label: "Demo Content", icon: Film, exact: false },
            { href: "/admin/alerts", label: "Alerts", icon: Bell, exact: false },
        ],
    },
    {
        label: "Revenue",
        items: [
            { href: "/admin/plans", label: "Plans", icon: CreditCard, exact: false },
            { href: "/admin/billing", label: "Billing", icon: Receipt, exact: false },
            { href: "/admin/usage", label: "Usage Tracking", icon: BarChart2, exact: false },
        ],
    },
    {
        label: "Support",
        items: [
            { href: "/admin/contact-submissions", label: "Contact Submissions", icon: Mail, exact: false },
            { href: "/admin/system/demo-bookings", label: "Demo Bookings", icon: MessageSquare, exact: false },
            { href: "/admin/system/tickets", label: "Tickets", icon: MessageSquare, exact: false },
        ],
    },
    {
        label: "System",
        items: [
            { href: "/admin/system/payment-gateways", label: "Payment Gateways", icon: CreditCard, exact: false },
            { href: "/admin/system/jobs", label: "Job Scheduler", icon: Activity, exact: false },
            { href: "/admin/system/mail-logs", label: "Mail Logs", icon: Mail, exact: false },
            { href: "/admin/settings", label: "Settings", icon: Settings, exact: false },
        ],
    },
] as const;

export default function AdminSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
    const pathname = usePathname();
    const { activeThemeId } = useTheme();
    const inactiveTextClass = activeThemeId === "gold-light" ? "text-[#232324fc]" : "text-[#afb3befc]";

    // Close sidebar on navigation (mobile)
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
                className={`fixed inset-y-0 left-0 z-40 w-60 flex flex-col border-r border-border bg-card overflow-y-auto
                    transition-transform duration-200 ease-in-out
                    lg:static lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:translate-x-0 lg:shrink-0
                    ${open ? "translate-x-0" : "-translate-x-full"}`}
            >
                {/* Navigation */}
                <nav
                    className="flex-1 min-h-0 p-3 space-y-4 overflow-y-auto
                    [&::-webkit-scrollbar]:w-1.5
                    [&::-webkit-scrollbar-track]:bg-transparent
                    [&::-webkit-scrollbar-thumb]:rounded-full
                    [&::-webkit-scrollbar-thumb]:bg-muted-foreground/40
                    hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/70"
                >
                    {NAV_GROUPS.map((group) => (
                        <div key={group.label}>
                            <p className="px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                                {group.label}
                            </p>
                            <div className="space-y-0.5">
                                {group.items.map(({ href, label, icon: Icon, exact }) => {
                                    const active = exact ? pathname === href : pathname.startsWith(href);
                                    return (
                                        <Link
                                            key={href}
                                            href={href}
                                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-normal transition-colors ${active
                                                ? "bg-primary/10 text-primary"
                                                : `${inactiveTextClass} hover:text-foreground hover:bg-surface-hover`
                                                }`}
                                        >
                                            <Icon size={16} />
                                            {label}
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </nav>
            </aside>
        </>
    );
}
