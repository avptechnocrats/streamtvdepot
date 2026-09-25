"use client";

import { useState } from "react";
import { Check, RotateCcw, Save } from "lucide-react";
import type { ThemeDefinition } from "@/themes/types";
import { useTheme } from "@/hooks/use-theme";
import { useUserPrefs, type UserPrefs } from "@/hooks/use-user-prefs";
import { saveThemeSettings } from "@/lib/api";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from "@/components/ui/sheet";

// ─── Option data ──────────────────────────────────────────────────────────────

const RADIUS: { id: UserPrefs["radius"]; label: string; cls: string }[] = [
    { id: "sharp", label: "Sharp", cls: "rounded-[2px]" },
    { id: "rounded", label: "Rounded", cls: "rounded-2xl" },
];

const BANNER_STYLES = [
    { id: "static", label: "Static", icon: "▬", desc: "Single fixed image" },
    { id: "slider", label: "Image Slider", icon: "◁ ▬ ▷", desc: "Auto-cycling images" },
    { id: "video", label: "Video Slider", icon: "◁ ▬ ▷", desc: "Autoplaying video" },
] as const;

const CARD_STYLES = [
    { id: "default", label: "Minimal", icon: "▶", desc: "Play button only" },
    { id: "detailed", label: "Detailed", icon: "≡", desc: "Title, genre, rating & watch" },
] as const;

// ─── Props ────────────────────────────────────────────────────────────────────

interface ThemeAppearanceSheetProps {
    /** The theme selected for customisation. Sheet is open when non-null. */
    theme: ThemeDefinition | null;
    onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ThemeAppearanceSheet({ theme, onClose }: ThemeAppearanceSheetProps) {
    const { setSiteTheme } = useTheme();
    const { prefs, setPrefs } = useUserPrefs();
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const resetSettings = () => {
        setPrefs({ radius: "default", bannerStyle: "static", cardStyle: "default" });
    };

    const handleSave = async () => {
        if (!theme) return;
        setSaving(true);
        setSaved(false);
        try {
            await saveThemeSettings({
                theme_id: theme.id,
                radius: prefs.radius,
                banner_style: prefs.bannerStyle,
                card_style: prefs.cardStyle,
            });
            setSiteTheme(theme.id);
            setSaved(true);
            setTimeout(() => {
                setSaved(false);
                onClose();
            }, 1200);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Sheet open={!!theme} onOpenChange={(open) => { if (!open) onClose(); }}>
            <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-0 p-0">
                <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
                    <SheetTitle className="text-base">
                        Customise —{" "}
                        <span className="text-gradient-gold">{theme?.name}</span>
                    </SheetTitle>
                    <SheetDescription className="text-xs">
                        These settings apply site-wide to all visitors. Click Save to activate.
                    </SheetDescription>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto divide-y divide-border">

                    {/* Corner Style */}
                    <div className="px-6 py-5">
                        <p className="text-sm font-medium text-foreground mb-0.5">Corner Style</p>
                        <p className="text-xs text-muted-foreground mb-3">Border radius on cards and UI elements</p>
                        <div className="flex items-center gap-2">
                            {RADIUS.map((r) => (
                                <button
                                    key={r.id}
                                    onClick={() => setPrefs({ radius: r.id })}
                                    className={`flex flex-col items-center gap-2 px-5 py-3 rounded-lg border text-xs font-medium transition-all ${prefs.radius === r.id
                                        ? "border-primary bg-primary/10 text-foreground"
                                        : "border-border/60 text-muted-foreground hover:border-border hover:bg-surface-hover"
                                        }`}
                                >
                                    <span className={`w-6 h-6 border-2 border-current ${r.cls}`} />
                                    {r.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Banner Section */}
                    <div className="px-6 py-5">
                        <p className="text-sm font-medium text-foreground mb-0.5">Banner Section</p>
                        <p className="text-xs text-muted-foreground mb-3">Homepage banner display style</p>
                        <div className="flex gap-2 flex-wrap">
                            {BANNER_STYLES.map((opt) => (
                                <button
                                    key={opt.id}
                                    onClick={() => setPrefs({ bannerStyle: opt.id })}
                                    className={`flex flex-col items-start gap-1 px-4 py-3 rounded-lg border text-xs font-medium transition-all min-w-[110px] ${prefs.bannerStyle === opt.id
                                        ? "border-primary bg-primary/10 text-foreground"
                                        : "border-border/60 text-muted-foreground hover:border-border hover:bg-surface-hover"
                                        }`}
                                >
                                    <span className="text-base tracking-widest leading-none mb-0.5">{opt.icon}</span>
                                    <span className="font-semibold">{opt.label}</span>
                                    <span className="text-[10px] opacity-60 leading-tight font-normal">{opt.desc}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Card on Hover */}
                    <div className="px-6 py-5">
                        <p className="text-sm font-medium text-foreground mb-0.5">Card on Hover</p>
                        <p className="text-xs text-muted-foreground mb-3">Content card hover overlay detail</p>
                        <div className="flex gap-2 flex-wrap">
                            {CARD_STYLES.map((opt) => (
                                <button
                                    key={opt.id}
                                    onClick={() => setPrefs({ cardStyle: opt.id })}
                                    className={`flex flex-col items-start gap-1 px-4 py-3 rounded-lg border text-xs font-medium transition-all min-w-[110px] ${prefs.cardStyle === opt.id
                                        ? "border-primary bg-primary/10 text-foreground"
                                        : "border-border/60 text-muted-foreground hover:border-border hover:bg-surface-hover"
                                        }`}
                                >
                                    <span className="text-base leading-none mb-0.5">{opt.icon}</span>
                                    <span className="font-semibold">{opt.label}</span>
                                    <span className="text-[10px] opacity-60 leading-tight font-normal">{opt.desc}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                </div>

                {/* Footer */}
                <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-border bg-card">
                    <button
                        onClick={resetSettings}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <RotateCcw size={12} /> Reset to defaults
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${saved
                            ? "bg-green-600/15 border border-green-600/40 text-green-500"
                            : "bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60"
                            }`}
                    >
                        {saved ? (
                            <><Check size={13} strokeWidth={2.5} /> Saved</>
                        ) : (
                            <><Save size={13} /> {saving ? "Saving…" : "Save Settings"}</>
                        )}
                    </button>
                </div>
            </SheetContent>
        </Sheet>
    );
}
