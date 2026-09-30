"use client";

import { Search, Bell, User, Menu, LogOut, ChevronDown, CreditCard, Settings, KeyRound } from "lucide-react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useState, useEffect } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuGroup,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import SiteLogo from "@/components/SiteLogo";
import SearchOverlay from "@/components/SearchOverlay";
import NotificationsDropdown from "@/components/NotificationsDropdown";
import { fetchPublicActiveMenus, type PublicMenuLink } from "@/lib/services/menus";

const FALLBACK_HEADER_LINKS: PublicMenuLink[] = [
  { id: "home", label: "Home", url: "/", sort_order: 0 },
  { id: "movies", label: "Movies", url: "/movies", sort_order: 1 },
  { id: "tv-shows", label: "TV Shows", url: "/tv-shows", sort_order: 2 },
  { id: "pricing", label: "Pricing", url: "/pricing", sort_order: 3 },
];

const Navbar = () => {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [navbarAvatarLoaded, setNavbarAvatarLoaded] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { data: menus } = useQuery({
    queryKey: ["active-menus"],
    queryFn: fetchPublicActiveMenus,
    staleTime: 60_000,
  });
  const activeHeaderMenu = menus?.header?.links?.length ? menus.header : null;
  const headerLinks = activeHeaderMenu?.links ?? FALLBACK_HEADER_LINKS;
  const maxMenuDisplay = typeof activeHeaderMenu?.max_menu_display === "number"
    ? Math.min(12, Math.max(1, activeHeaderMenu.max_menu_display))
    : headerLinks.length;
  const visibleHeaderLinks = headerLinks.slice(0, maxMenuDisplay);
  const overflowHeaderLinks = headerLinks.slice(maxMenuDisplay);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function isActive(href: string) {
    if (!href.startsWith("/")) return false;
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  return (
    <>
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? "bg-background/95 backdrop-blur-md border-b border-border/50" : "bg-transparent"}`}>
      <div className="flex items-center justify-between px-6 lg:px-12 h-16" style={!scrolled ? { textShadow: "0 1px 6px rgba(0,0,0,0.9), 0 3px 16px rgba(0,0,0,0.7)" } : undefined}>
        <div className="flex items-center gap-8">
          <SiteLogo />
          <div className="hidden md:flex items-center gap-1">
            {visibleHeaderLinks.map((item) => {
              const active = isActive(item.url);
              const cls = `px-4 py-2 text-sm font-medium rounded-md transition-colors ${active
                ? "text-primary bg-primary/10"
                : scrolled
                  ? "text-muted-foreground hover:text-foreground hover:bg-surface-hover"
                  : "text-white/90 hover:text-white hover:bg-white/10"
                }`;
              return item.url.startsWith("/") ? (
                <Link key={item.id} href={item.url} className={cls}>
                  {item.label}
                </Link>
              ) : (
                <a key={item.id} href={item.url} target={item.target} rel={item.target === "_blank" ? "noreferrer" : undefined} className={cls}>
                  {item.label}
                </a>
              );
            })}
            {overflowHeaderLinks.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={`flex items-center gap-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${overflowHeaderLinks.some((item) => isActive(item.url))
                      ? "text-primary bg-primary/15 hover:bg-primary/20"
                      : scrolled
                        ? "text-muted-foreground hover:text-foreground hover:bg-surface-hover"
                        : "text-white/90 hover:text-white hover:bg-white/10"
                      } focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background`}
                  >
                    More <ChevronDown size={14} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-44">
                  {overflowHeaderLinks.map((item) => (
                    <DropdownMenuItem key={item.id} asChild>
                      {item.url.startsWith("/") ? (
                        <Link href={item.url}>{item.label}</Link>
                      ) : (
                        <a href={item.url} target={item.target} rel={item.target === "_blank" ? "noreferrer" : undefined}>
                          {item.label}
                        </a>
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Search */}
          <button
            onClick={() => setSearchOpen(true)}
            className={`p-2 rounded-md transition-colors ${scrolled ? "text-muted-foreground hover:text-foreground hover:bg-surface-hover" : "text-white/80 hover:text-white hover:bg-white/10"}`}
            aria-label="Search"
          >
            <Search size={20} />
          </button>
          {/* Notifications */}
          <NotificationsDropdown scrolled={scrolled} />
          {/* Menu Buttons */}
          <button className={`p-2 rounded-md transition-colors md:hidden ${scrolled ? "text-muted-foreground hover:text-foreground hover:bg-surface-hover" : "text-white/80 hover:text-white hover:bg-white/10"}`}>
            <Menu size={20} />
          </button>

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="hidden md:flex items-center gap-2 px-2 py-1.5 rounded-full transition-colors hover:bg-white/10 focus:outline-none group">
                  {/* Avatar circle */}
                  <span className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold uppercase shrink-0 shadow-sm group-hover:ring-2 group-hover:ring-primary/40 transition-all overflow-hidden relative">
                    {user.avatar_url ? (
                      <>
                        {!navbarAvatarLoaded && (
                          <Skeleton className="absolute inset-0 rounded-full" />
                        )}
                        <img 
                          src={user.avatar_url} 
                          alt="Profile avatar" 
                          className="w-full h-full object-cover" 
                          onLoad={() => setNavbarAvatarLoaded(true)}
                        />
                      </>
                    ) : (
                      (user.full_name || user.email).slice(0, 2)
                    )}
                  </span>
                  <ChevronDown size={13} className={`transition-colors ${scrolled ? "text-muted-foreground" : "text-white/70"}`} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 p-1.5">
                {/* User identity header */}
                <DropdownMenuLabel className="px-2 py-2">
                  <p className="text-sm font-semibold text-foreground truncate">{user.full_name || "My Account"}</p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{user.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem asChild>
                    <Link href="/account" className="flex items-center gap-2.5 cursor-pointer">
                      <User size={14} className="text-muted-foreground" />
                      My Account
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/account/subscriptions" className="flex items-center gap-2.5 cursor-pointer">
                      <CreditCard size={14} className="text-muted-foreground" />
                      Subscriptions
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/account/security" className="flex items-center gap-2.5 cursor-pointer">
                      <KeyRound size={14} className="text-muted-foreground" />
                      Security
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="flex items-center gap-2.5 text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
                >
                  <LogOut size={14} />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link
              href="/login"
              className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-md bg-secondary text-secondary-foreground text-sm font-medium hover:bg-surface-hover transition-colors"
            >
              <User size={16} />
              Sign In
            </Link>
          )}
        </div>
      </div>
    </nav>
    </>
  );
};

export default Navbar;
