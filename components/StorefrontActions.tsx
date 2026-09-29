"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, CreditCard, KeyRound, LogOut, Search, Settings, User } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import NotificationsDropdown from "@/components/NotificationsDropdown";
import SearchOverlay from "@/components/SearchOverlay";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface StorefrontActionsProps {
    scrolled?: boolean;
    className?: string;
    buttonClassName?: string;
    accountClassName?: string;
}

export default function StorefrontActions({
    scrolled = true,
    className = "flex items-center gap-2",
    buttonClassName = "p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors",
    accountClassName = "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors",
}: StorefrontActionsProps) {
    const router = useRouter();
    const { user, logout } = useAuth();
    const [searchOpen, setSearchOpen] = useState(false);

    function handleLogout() {
        logout();
        router.replace("/login");
    }

    return (
        <>
            <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
            <div className={className}>
                <button onClick={() => setSearchOpen(true)} className={buttonClassName} aria-label="Search">
                    <Search size={18} />
                </button>
                <NotificationsDropdown scrolled={scrolled} />
                {user ? (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className={`${accountClassName} focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0`} aria-label="My account">
                                {user.avatar_url ? (
                                    <img src={user.avatar_url} alt="Profile avatar" className="w-7 h-7 rounded-full object-cover" />
                                ) : (
                                    <span className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold uppercase">
                                        {(user.full_name || user.email).slice(0, 2)}
                                    </span>
                                )}
                                <ChevronDown size={13} className="hidden md:block" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 p-1.5">
                            <DropdownMenuLabel className="px-2 py-2">
                                <p className="text-sm font-semibold text-foreground truncate">{user.full_name || "My Account"}</p>
                                <p className="text-xs text-muted-foreground truncate mt-0.5">{user.email}</p>
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuGroup>
                                <DropdownMenuItem asChild>
                                    <Link href="/account" className="flex items-center gap-2.5 cursor-pointer"><User size={14} />My Account</Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                    <Link href="/account/subscriptions" className="flex items-center gap-2.5 cursor-pointer"><CreditCard size={14} />Subscriptions</Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                    <Link href="/account/security" className="flex items-center gap-2.5 cursor-pointer"><KeyRound size={14} />Security</Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                    <Link href="/account/settings" className="flex items-center gap-2.5 cursor-pointer"><Settings size={14} />Settings</Link>
                                </DropdownMenuItem>
                            </DropdownMenuGroup>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={handleLogout} className="flex items-center gap-2.5 text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer">
                                <LogOut size={14} />Sign Out
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                ) : (
                    <Link href="/login" className={accountClassName} aria-label="Sign in">
                        <User size={16} />
                        <span className="hidden md:block">Sign In</span>
                    </Link>
                )}
            </div>
        </>
    );
}