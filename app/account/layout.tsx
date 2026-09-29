"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
    User,
    CreditCard,
    KeyRound,
    LifeBuoy,
    LogOut,
    ReceiptText,
    Heart,
    Film,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { getMyProfile, type UserProfile } from "@/lib/services/user-auth";
import { Skeleton } from "@/components/ui/skeleton";

function getInitials(name: string): string {
    return name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0].toUpperCase())
        .join("");
}

const NAV_ITEMS = [
    { href: "/account", label: "My Profile", icon: User, exact: true },
    { href: "/account/subscriptions", label: "Subscriptions", icon: CreditCard, exact: false },
    { href: "/account/saved-cards", label: "Saved Cards", icon: CreditCard, exact: false },
    { href: "/account/transactions", label: "Transactions", icon: ReceiptText, exact: false },
    { href: "/account/rentals", label: "Rentals & PPVs", icon: Film, exact: false },
    { href: "/account/favorites", label: "My List", icon: Heart, exact: false },
    { href: "/account/security", label: "Security", icon: KeyRound, exact: false },
    { href: "/account/help", label: "Help & Support", icon: LifeBuoy, exact: false },
];

export default function AccountLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { user, logout, accessToken } = useAuth();
    const router = useRouter();
    const [loggingOut, setLoggingOut] = useState(false);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [refetchTrigger, setRefetchTrigger] = useState(0);
    const [sidebarAvatarLoaded, setSidebarAvatarLoaded] = useState(false);

    // Fetch profile data to get full_name and avatar
    useEffect(() => {
        if (!accessToken) return;
        getMyProfile(accessToken)
            .then(setProfile)
            .catch(() => setProfile(null));
    }, [accessToken, refetchTrigger]);

    // Reset avatar loaded state when profile avatar URL changes
    useEffect(() => {
        setSidebarAvatarLoaded(false);
    }, [profile?.avatar_url]);

    // Expose refetch callback to child components via window
    useEffect(() => {
        const handleProfileUpdate = () => {
            if (!accessToken) return;
            getMyProfile(accessToken)
                .then(setProfile)
                .catch(() => setProfile(null));
        };

        window.__profileRefetch = handleProfileUpdate;
        return () => {
            delete window.__profileRefetch;
        };
    }, [accessToken]);

    function handleLogout() {
        setLoggingOut(true);
        logout();
        router.replace("/login");
    }

    const displayName = profile?.full_name || user?.full_name || user?.email || " ";
    const initials = getInitials(displayName);

    return (
        <div className="min-h-screen pt-20 pb-12 px-4 lg:px-12">
            <div className="mx-auto min-h-[calc(100vh-9rem)] overflow-hidden rounded-2xl border border-border/60 bg-card/80 shadow-sm backdrop-blur-sm">
                <div className="flex min-h-[calc(100vh-9rem)] flex-col md:flex-row md:items-stretch">
                    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-border/60 bg-card/70">
                        {/* User info */}
                        <div className="p-5 border-b border-border/50 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-black uppercase shrink-0 overflow-hidden relative">
                                {profile?.avatar_url ? (
                                    <>
                                        {!sidebarAvatarLoaded && (
                                            <Skeleton className="absolute inset-0 rounded-full" />
                                        )}
                                        <img 
                                            src={profile.avatar_url} 
                                            alt="Avatar" 
                                            className="w-full h-full object-cover" 
                                            onLoad={() => setSidebarAvatarLoaded(true)}
                                        />
                                    </>
                                ) : (
                                    initials
                                )}
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
                                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                            </div>
                        </div>

                        {/* Nav */}
                        <nav className="p-2 flex-1">
                            {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => {
                                const active = exact ? pathname === href : pathname.startsWith(href);
                                return (
                                    <Link
                                        key={href}
                                        href={href}
                                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${active
                                            ? "bg-primary/10 text-primary"
                                            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                            }`}
                                    >
                                        <Icon size={16} className="shrink-0" />
                                        {label}
                                    </Link>
                                );
                            })}
                        </nav>

                        {/* Sign out */}
                        <div className="p-2 border-t border-border/50">
                            <button
                                onClick={handleLogout}
                                disabled={loggingOut}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-md font-medium text-destructive hover:bg-destructive/10 transition-colors"
                            >
                                <LogOut size={16} className="shrink-0" />
                                {loggingOut ? "Signing out…" : "Sign Out"}
                            </button>
                        </div>
                    </aside>

                    <div className="flex-1 min-w-0 self-stretch overflow-hidden">
                        {/* Mobile nav bar */}
                        <div className="md:hidden border-b border-border/60 bg-card/70 p-3">
                            <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
                                {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => {
                                    const active = exact ? pathname === href : pathname.startsWith(href);
                                    return (
                                        <Link
                                            key={href}
                                            href={href}
                                            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-colors shrink-0 ${active
                                                ? "bg-primary/10 text-primary"
                                                : "text-muted-foreground hover:text-foreground bg-card border border-border/50"
                                                }`}
                                        >
                                            <Icon size={14} className="shrink-0" />
                                            {label}
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Main content */}
                        <main className="min-h-full p-4 md:p-6 lg:p-8 bg-background/30">
                            {children}
                        </main>
                    </div>
                </div>
            </div>
        </div>
    );
}
