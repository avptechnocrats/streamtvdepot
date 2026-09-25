"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Check, ZoomIn, X, Settings2 } from "lucide-react";
import type { ThemeDefinition } from "@/themes/types";
import { useTheme } from "@/hooks/use-theme";
import { useUserPrefs } from "@/hooks/use-user-prefs";
import { fetchThemeSettings } from "@/lib/api";
import { ThemeAppearanceSheet } from "./_components/ThemeAppearanceSheet";

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AdminThemesPage() {
    const { themes, siteThemeId } = useTheme();
    const { setPrefs } = useUserPrefs();
    const [lightboxTheme, setLightboxTheme] = useState<ThemeDefinition | null>(null);
    const [sheetTheme, setSheetTheme] = useState<ThemeDefinition | null>(null);

    // ── Load persisted settings from the backend on first render ──────────────
    useEffect(() => {
        fetchThemeSettings()
            .then((data) => {
                setPrefs({
                    radius: data.radius,
                    bannerStyle: data.banner_style,
                    cardStyle: data.card_style,
                });
            })
            .catch(() => {
                // Non-critical: keep local defaults if the request fails
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="p-8 space-y-10">

            {/* ── Page header ── */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-2xl font-display font-700 text-foreground">Theme Manager</h1>
                    <p className="text-sm text-muted-foreground max-w-xl">
                        Choose a theme, then customise its appearance settings before saving.
                    </p>
                </div>
            </div>

            {/* ── Developer note ── */}
            <div className="flex items-start gap-3 px-4 py-3 bg-primary/5 border border-primary/20 rounded-xl text-xs text-muted-foreground">
                <span className="text-primary mt-0.5 shrink-0">ℹ</span>
                <span>
                    Each theme has its own set of layout files (Navbar, Banner, Cards, etc.) — like WordPress themes.
                    To add a new theme, create a folder under{" "}
                    <code className="bg-secondary px-1 py-0.5 rounded font-mono">themes/&lt;name&gt;/</code>,
                    add a CSS block in{" "}
                    <code className="bg-secondary px-1 py-0.5 rounded font-mono">app/globals.css</code>,
                    and register it in{" "}
                    <code className="bg-secondary px-1 py-0.5 rounded font-mono">themes/registry.ts</code>.
                    See <code className="bg-secondary px-1 py-0.5 rounded font-mono">THEMES.md</code> for the full guide.
                </span>
            </div>

            {/* ── Theme gallery ── */}
            <div className="space-y-4">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Choose Layout
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                    {themes.map((theme) => {
                        const isActive = siteThemeId === theme.id;
                        return (
                            <div
                                key={theme.id}
                                className={`group/card rounded-xl border overflow-hidden transition-all ${isActive
                                    ? "border-primary ring-1 ring-primary/20 shadow-md shadow-primary/10"
                                    : "border-border hover:border-primary/40"
                                    }`}
                            >
                                {/* Screenshot thumbnail — click to enlarge */}
                                <div
                                    className="relative overflow-hidden cursor-zoom-in aspect-video bg-muted"
                                    onClick={() => setLightboxTheme(theme)}
                                >
                                    {theme.previewImage ? (
                                        <Image
                                            src={theme.previewImage}
                                            alt={`${theme.name} theme`}
                                            fill
                                            unoptimized
                                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
                                            className="object-cover object-top"
                                        />
                                    ) : (
                                        <div
                                            className="w-full h-full flex flex-col gap-1 p-3"
                                            style={{ background: theme.previewBg }}
                                        >
                                            <div className="h-4 rounded opacity-60" style={{ background: theme.previewCard }} />
                                            <div className="flex-1 rounded opacity-40" style={{ background: theme.previewCard }} />
                                            <div className="h-2 rounded w-1/2" style={{ background: theme.previewAccent }} />
                                        </div>
                                    )}

                                    {/* Hover zoom overlay */}
                                    <div className="absolute inset-0 bg-black/0 group-hover/card:bg-black/40 transition-all flex items-center justify-center">
                                        <div className="opacity-0 group-hover/card:opacity-100 transition-all scale-75 group-hover/card:scale-100 bg-black/60 rounded-full p-2.5">
                                            <ZoomIn size={16} className="text-white" />
                                        </div>
                                    </div>

                                    {/* Active badge */}
                                    {isActive && (
                                        <div className="absolute top-2 left-2 flex items-center gap-1 text-[9px] font-semibold text-primary bg-primary/15 border border-primary/30 backdrop-blur-sm rounded-full px-2 py-1">
                                            <Check size={8} strokeWidth={3} />
                                            Active
                                        </div>
                                    )}
                                </div>

                                {/* Card footer */}
                                <div className="p-3 bg-card">
                                    <div className="flex items-start justify-between gap-2 mb-2.5">
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-foreground truncate">{theme.name}</p>
                                            <p className="text-[11px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">{theme.description}</p>
                                        </div>
                                        {/* Colour dot swatch */}
                                        <div className="flex gap-1 shrink-0 pt-0.5">
                                            <div className="w-3 h-3 rounded-full border border-white/10" style={{ background: theme.previewBg }} />
                                            <div className="w-3 h-3 rounded-full border border-white/10" style={{ background: theme.previewAccent }} />
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setSheetTheme(theme)}
                                        className={`w-full py-1.5 rounded-lg text-xs font-medium transition-all ${isActive
                                            ? "bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20"
                                            : "bg-secondary text-foreground hover:bg-primary hover:text-primary-foreground border border-transparent"
                                            }`}
                                    >
                                        {isActive ? (
                                            <span className="flex items-center justify-center gap-1.5">
                                                <Settings2 size={10} /> Customise
                                            </span>
                                        ) : (
                                            <span className="flex items-center justify-center gap-1.5">
                                                <Settings2 size={10} /> Activate & Customise
                                            </span>
                                        )}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── Lightbox ── */}
            {lightboxTheme && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
                    onClick={() => setLightboxTheme(null)}
                >
                    <div
                        className="relative w-full max-w-5xl rounded-2xl overflow-hidden border border-border bg-card shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Close */}
                        <button
                            onClick={() => setLightboxTheme(null)}
                            className="absolute top-3 right-3 z-10 p-1.5 rounded-lg bg-black/50 text-white/70 hover:text-white hover:bg-black/70 transition-colors"
                        >
                            <X size={14} />
                        </button>

                        {/* Full screenshot */}
                        {lightboxTheme.previewImage ? (
                            <div className="relative w-full" style={{ maxHeight: "80vh", aspectRatio: "16/9" }}>
                                <Image
                                    src={lightboxTheme.previewImage}
                                    alt={`${lightboxTheme.name} theme`}
                                    fill
                                    unoptimized
                                    sizes="100vw"
                                    className="object-contain"
                                />
                            </div>
                        ) : (
                            <div
                                className="flex flex-col items-center justify-center gap-4 h-64"
                                style={{ background: lightboxTheme.previewBg }}
                            >
                                <div className="flex gap-3">
                                    <div className="w-12 h-20 rounded-xl opacity-60" style={{ background: lightboxTheme.previewCard }} />
                                    <div className="w-12 h-20 rounded-xl" style={{ background: lightboxTheme.previewAccent }} />
                                    <div className="w-12 h-20 rounded-xl opacity-40" style={{ background: lightboxTheme.previewCard }} />
                                </div>
                                <p className="text-xs text-white/40 text-center px-8">No screenshot available</p>
                            </div>
                        )}

                        {/* Footer */}
                        <div className="flex items-center justify-between gap-4 px-5 py-4">
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-foreground">{lightboxTheme.name}</p>
                                <p className="text-xs text-muted-foreground truncate">{lightboxTheme.description}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    onClick={() => setLightboxTheme(null)}
                                    className="px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                                >
                                    Close
                                </button>
                                <button
                                    onClick={() => { setSheetTheme(lightboxTheme); setLightboxTheme(null); }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
                                >
                                    <Settings2 size={11} />
                                    {siteThemeId === lightboxTheme.id ? "Customise" : "Activate & Customise"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Appearance Sheet ── */}
            <ThemeAppearanceSheet
                theme={sheetTheme}
                onClose={() => setSheetTheme(null)}
            />
        </div>
    );
}

