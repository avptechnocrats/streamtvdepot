"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const sections = [
    { href: "/admin/account", label: "Account Information" },
    { href: "/admin/account/security", label: "Security" },
    { href: "/admin/account/activity", label: "Account Activity" },
    { href: "/admin/account/notifications", label: "Notification Settings" },
    { href: "/admin/account/language", label: "Language" },
];

export default function AccountLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    return (
        <div className="p-6 lg:p-8 space-y-6">
            <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Account center</p>
                <h1 className="text-3xl font-display font-semibold tracking-tight text-foreground">Profile and preferences</h1>
                <p className="max-w-2xl text-sm text-muted-foreground">
                    Manage identity, password, activity, and notification controls for the current admin session.
                </p>
            </div>

            <div className="flex flex-wrap gap-2 rounded-2xl border border-border bg-card p-2">
                {sections.map((section) => {
                    const isActive = pathname === section.href;
                    return (
                        <Link
                            key={section.href}
                            href={section.href}
                            className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                                isActive
                                    ? "bg-primary/10 text-primary"
                                    : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                            }`}
                        >
                            {section.label}
                        </Link>
                    );
                })}
            </div>

            {children}
        </div>
    );
}