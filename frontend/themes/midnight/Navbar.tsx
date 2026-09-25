/**
 * midnight/Navbar.tsx
 *
 * HBO Max editorial style — two-row navbar.
 * Row 1: logo left, search + user right (always visible)
 * Row 2: nav tab strip — active tab has a thick cyan bottom border (not a pill)
 * Background: solid dark navy with a very faint bottom border
 */
"use client";

import { Search, User, Bell } from "lucide-react";
import { useState } from "react";

const navItems = ["Home", "Series", "Movies", "Sports", "Max Originals", "Kids"];

export default function Navbar() {
    const [active, setActive] = useState("Home");
    const [searchOpen, setSearchOpen] = useState(false);

    return (
        <nav className="fixed top-0 left-0 right-0 z-50 bg-background border-b border-border/40">
            {/* Row 1 — brand + utilities */}
            <div className="flex items-center justify-between px-6 lg:px-14 h-14">
                <a href="/" className="flex items-center gap-2">
                    <span className="text-xl font-black text-foreground tracking-tighter">
                        Stream<span className="text-primary">Vault</span>
                    </span>
                </a>

                <div className="flex items-center gap-1.5">
                    {searchOpen ? (
                        <input
                            autoFocus
                            onBlur={() => setSearchOpen(false)}
                            placeholder="Search titles, people…"
                            className="w-52 bg-secondary border border-border text-sm text-foreground px-3 py-1.5 rounded-md focus:outline-none focus:border-primary placeholder:text-muted-foreground"
                        />
                    ) : (
                        <button onClick={() => setSearchOpen(true)} className="p-2 text-muted-foreground hover:text-foreground rounded-md transition-colors">
                            <Search size={18} />
                        </button>
                    )}
                    <button className="relative p-2 text-muted-foreground hover:text-foreground rounded-md transition-colors">
                        <Bell size={18} />
                        <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-primary rounded-full" />
                    </button>
                    <button className="flex items-center gap-2 ml-1 pl-3 border-l border-border/50">
                        <div className="w-7 h-7 rounded-sm bg-primary/20 border border-primary/30 flex items-center justify-center">
                            <User size={14} className="text-primary" />
                        </div>
                    </button>
                </div>
            </div>

            {/* Row 2 — nav tabs with underline active indicator */}
            <div className="flex items-end overflow-x-auto scrollbar-hide px-6 lg:px-14 border-t border-border/20">
                {navItems.map((item) => (
                    <button
                        key={item}
                        onClick={() => setActive(item)}
                        className={`relative shrink-0 px-4 py-2.5 text-[12px] font-semibold tracking-wide transition-colors ${active === item
                                ? "text-primary"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                    >
                        {item}
                        {active === item && (
                            <span className="absolute bottom-0 left-0 right-0 h-[3px] bg-primary rounded-t-full" />
                        )}
                    </button>
                ))}
            </div>
        </nav>
    );
}
