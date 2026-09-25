"use client";

import { Search, Bell, User, Menu } from "lucide-react";
import { useState } from "react";
import Link from "next/link";

const navItems = ["Home", "Movies", "TV Shows", "Sports", "Kids"];
const navLinks: Record<string, string> = {};

const Navbar = () => {
  const [active, setActive] = useState("Home");

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50">
      <div className="flex items-center justify-between px-6 lg:px-12 h-16">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center hover:opacity-80 transition-opacity">
            <img src="/logo-new.png" alt="SignalView" className="h-10 w-auto" />
          </Link>
          <div className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const cls = `px-4 py-2 text-sm font-medium rounded-md transition-colors ${active === item
                ? "text-primary bg-primary/10"
                : "text-muted-foreground hover:text-foreground hover:bg-surface-hover"
                }`;
              return navLinks[item] ? (
                <Link key={item} href={navLinks[item]} onClick={() => setActive(item)} className={cls}>
                  {item}
                </Link>
              ) : (
                <button key={item} onClick={() => setActive(item)} className={cls}>
                  {item}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors">
            <Search size={20} />
          </button>
          <button className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors relative">
            <Bell size={20} />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full" />
          </button>
          <button className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors md:hidden">
            <Menu size={20} />
          </button>
          <button className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-md bg-secondary text-secondary-foreground text-sm font-medium hover:bg-surface-hover transition-colors">
            <User size={16} />
            Sign In
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
