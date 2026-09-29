import type { ThemeDefinition } from "./types";
import darkGoldComponents from "./dark-gold";
import neonCityComponents from "./neon-city";
import appleTvComponents from "./apple-tv";
import midnightComponents from "./midnight";
import sunsetComponents from "./sunset";
import emeraldComponents from "./emerald";
import cinemaRedComponents from "./cinema-red";

/**
 * Central theme registry.
 *
 * ─── Adding a new theme (WordPress-style) ────────────────────────────────────
 *  1. Create `src/themes/<your-theme>/` folder
 *  2. Build Navbar.tsx, Banner.tsx, ContentRow.tsx, CategoryGrid.tsx,
 *     Footer.tsx, and index.ts (exports a ThemeComponents object)
 *  3. Add a `[data-theme="<dataTheme>"]` CSS block in app/globals.css
 *  4. Import your components below and add a ThemeDefinition entry to THEMES
 *  Done — the Admin Panel and Customizer Panel show it automatically.
 *
 * ─── Colour-only themes ───────────────────────────────────────────────────────
 *  Themes that differ only in colour (midnight, sunset, etc.) can share a
 *  component set by pointing `components` to `darkGoldComponents`. Their
 *  visual differences come entirely from CSS variable overrides in globals.css.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const THEMES: ThemeDefinition[] = [
    {
        id: "dark-gold",
        name: "Dark Gold",
        description: "Classic cinema darkness with rich golden accents",
        dataTheme: "gold",
        previewBg: "hsl(220 20% 6%)",
        previewCard: "hsl(220 18% 10%)",
        previewAccent: "hsl(40 90% 55%)",
        nativeAccent: "gold",
        previewImage: "/assets/themes/dark-gold.png",
        components: darkGoldComponents,
    },
    {
        id: "midnight",
        name: "Midnight",
        description: "Deep navy atmosphere with electric cyan highlights",
        dataTheme: "midnight",
        previewBg: "hsl(230 30% 5%)",
        previewCard: "hsl(230 25% 9%)",
        previewAccent: "hsl(190 90% 50%)",
        nativeAccent: "cyan",
        defaultPrefs: { bannerStyle: "slider" },
        previewImage: "/assets/themes/mid-night.png",
        components: midnightComponents,
    },
    {
        id: "sunset",
        name: "Sunset",
        description: "Warm charcoal tones with fiery orange energy",
        dataTheme: "sunset",
        previewBg: "hsl(15 18% 6%)",
        previewCard: "hsl(15 15% 10%)",
        previewAccent: "hsl(20 100% 55%)",
        nativeAccent: "orange",
        defaultPrefs: { bannerStyle: "slider" },
        previewImage: "/assets/themes/sunset.png",
        components: sunsetComponents,
    },
    {
        id: "emerald",
        name: "Emerald",
        description: "Dark forest palette with lush green accents",
        dataTheme: "emerald",
        previewBg: "hsl(150 22% 5%)",
        previewCard: "hsl(150 18% 9%)",
        previewAccent: "hsl(152 60% 45%)",
        nativeAccent: "green",
        defaultPrefs: { bannerStyle: "slider" },
        previewImage: "/assets/themes/emarold.png",
        components: emeraldComponents,
    },
    {
        id: "neon-city",
        name: "Neon City",
        description: "Ultra-dark base with electric neon purple glow",
        dataTheme: "neon-city",
        previewBg: "hsl(270 25% 4%)",
        previewCard: "hsl(270 20% 8%)",
        previewAccent: "hsl(270 70% 60%)",
        nativeAccent: "purple",
        defaultPrefs: { bannerStyle: "slider" },
        previewImage: "/assets/themes/neoncity.png",
        // Own component set — completely different layout files
        components: neonCityComponents,
    },
    {
        id: "cinema-red",
        name: "Cinema Red",
        description: "Bold near-black stage with deep crimson spotlight",
        dataTheme: "cinema-red",
        previewBg: "hsl(0 20% 5%)",
        previewCard: "hsl(0 15% 9%)",
        previewAccent: "hsl(340 80% 55%)",
        nativeAccent: "rose",
        previewImage: "/assets/themes/cinema-red.png",
        components: cinemaRedComponents,
    },
    {
        id: "apple-tv",
        name: "Apple TV",
        description: "Pure black, cinematic minimal — clean rounded cards, no glow",
        dataTheme: "apple-tv",
        previewBg: "hsl(0 0% 3%)",
        previewCard: "hsl(0 0% 8%)",
        previewAccent: "hsl(190 90% 50%)",
        nativeAccent: "cyan",
        defaultPrefs: { bannerStyle: "slider", radius: "rounded" },
        previewImage: "/assets/themes/apple-tv.png",
        components: appleTvComponents,
    },
    {
        id: "gold-light",
        name: "Light",
        description: "Clean light background with warm golden accents",
        dataTheme: "gold-light",
        previewBg: "hsl(220 15% 97%)",
        previewCard: "hsl(0 0% 100%)",
        previewAccent: "hsl(38 88% 38%)",
        nativeAccent: "gold",
        previewImage: "/assets/themes/light.png",
        components: darkGoldComponents,
    },
];

export const DEFAULT_THEME_ID = "dark-gold";

/** Convenience lookup by id */
export function getThemeById(id: string): ThemeDefinition {
    return THEMES.find((t) => t.id === id) ?? THEMES[0];
}
