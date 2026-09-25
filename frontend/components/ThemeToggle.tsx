"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Palette } from "lucide-react";

const themes = [
    { id: "gold", label: "Gold", color: "#d4910e" },
    { id: "midnight", label: "Midnight", color: "#22d3ee" },
    { id: "sunset", label: "Sunset", color: "#f97316" },
    { id: "emerald", label: "Emerald", color: "#34d399" },
];

export default function ThemeToggle() {
    const { theme, setTheme } = useTheme();
    const [open, setOpen] = useState(false);
    const [mounted, setMounted] = useState(false);

    // Avoid hydration mismatch
    useEffect(() => setMounted(true), []);
    if (!mounted) return null;

    return (
        <div className="relative">
            <button
                onClick={() => setOpen((o) => !o)}
                className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                aria-label="Change theme"
            >
                <Palette size={20} />
            </button>

            {open && (
                <>
                    {/* backdrop to close */}
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

                    <div className="absolute right-0 top-10 z-50 w-40 rounded-lg border border-border bg-card shadow-xl p-2 space-y-1">
                        {themes.map((t) => (
                            <button
                                key={t.id}
                                onClick={() => { setTheme(t.id); setOpen(false); }}
                                className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${theme === t.id
                                        ? "bg-primary/15 text-foreground font-medium"
                                        : "text-muted-foreground hover:text-foreground hover:bg-surface-hover"
                                    }`}
                            >
                                <span
                                    className="w-3.5 h-3.5 rounded-full flex-shrink-0 ring-1 ring-white/20"
                                    style={{ background: t.color }}
                                />
                                {t.label}
                                {theme === t.id && (
                                    <span className="ml-auto text-primary text-xs">✓</span>
                                )}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
