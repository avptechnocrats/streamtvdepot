import type { ComponentType } from "react";
import type { UserPrefs } from "@/hooks/use-user-prefs";
import type { ContentRowProps } from "@/types/content";
import type { CategoryGridProps } from "@/types/category";

// ─── Style theme component contract ──────────────────────────────────
/**
 * Every theme folder must export a ThemeComponents object that satisfies this
 * interface:
 *
 *   StreamTVDepot ThemeComponents
 *   ─────────────────────────────────────────────────────────────
 *   header.php                     →   Navbar
 *   front-page.php / hero section  →   Banner
 *   index.php / archive loop       →   ContentRow
 *   sidebar / taxonomy list        →   CategoryGrid
 *   footer.php                     →   Footer
 *
 * To add a new full-layout theme (like adding a new theme in wp-content/themes/):
 *   1. Create `src/themes/<your-theme>/` folder
 *   2. Build each component file in that folder (Navbar.tsx, etc.)
 *   3. Export a ThemeComponents object from `src/themes/<your-theme>/index.ts`
 *   4. Import and wire it into registry.ts + add CSS block to globals.css
 *   Done — no other files change.
 *
 * For colour-only themes (midnight, sunset, etc.) that share the same layout,
 * simply point `components` to the `darkGoldComponents` set — they will look
 * different purely via CSS variable overrides from globals.css.
 */
export interface ThemeComponents {
    Navbar: ComponentType;
    Banner: ComponentType;
    ContentRow: ComponentType<ContentRowProps>;
    CategoryGrid: ComponentType<CategoryGridProps>;
    Footer: ComponentType;
}

// ─── Theme definition ──────────────────────────────────────────────────────────
/**
 * Defines a self-contained visual theme for StreamTVDepot.
 *
 * Architecture:
 *  - Each theme maps to a `data-theme` CSS attribute selector in globals.css
 *    that owns the base structural tokens (background, card, border, etc.)
 *  - `components` points to the folder of React components that render this
 *    theme's layout — equivalent to a WordPress theme's template files.
 *  - `nativeAccent` syncs UserPrefs.accentColor when the theme is first activated.
 */
export interface ThemeDefinition {
    /** Unique machine-readable ID (used for persistence and lookup) */
    id: string;

    /** Human-readable display name shown in the theme picker */
    name: string;

    /** One-line description of the theme's visual identity */
    description: string;

    /**
     * Value written to `document.documentElement.setAttribute("data-theme", ...)`.
     * Must match a [data-theme="..."] selector in globals.css.
     */
    dataTheme: string;

    /** Preview swatch colours shown in the theme-picker card UI */
    previewBg: string;
    previewCard: string;
    previewAccent: string;

    /**
     * Optional path to a static screenshot image shown in the preview modal.
     * e.g. "/images/themes/dark-gold.png"
     * When omitted the modal falls back to a colour-swatch placeholder.
     */
    previewImage?: string;

    /**
     * The UserPrefs accentColor that best matches this theme's primary colour.
     * Applied automatically when the user switches to this theme so the
     * accentColor inline-style override stays consistent.
     */
    nativeAccent: UserPrefs["accentColor"];

    /**
     * Optional default pref overrides applied the first time this theme
     * is activated (e.g. a theme might prefer a slider hero or spacious density).
     */
    defaultPrefs?: Partial<Omit<UserPrefs, "accentColor">>;

    /**
     * The component set that renders this theme's layout.
     *
     * Colour-only themes share a single component set (e.g. darkGoldComponents).
     * Full custom themes reference their own component folder.
     */
    components: ThemeComponents;
}
