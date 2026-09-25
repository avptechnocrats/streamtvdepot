# SignalView — Theme System

> A WordPress-inspired file-based theme architecture for Next.js.  
> Each theme can own its own React component files **and** its own CSS colour palette — independently or together.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [File Structure](#2-file-structure)
3. [How a Theme is Loaded](#3-how-a-theme-is-loaded)
4. [CSS Variable System](#4-css-variable-system)
5. [UserPrefs — Appearance Settings](#5-userprefs--appearance-settings)
6. [Admin Panel — Theme Manager](#6-admin-panel--theme-manager)
7. [Existing Themes](#7-existing-themes)
8. [Creating a Colour-Only Theme](#8-creating-a-colour-only-theme)
9. [Creating a Full Custom Theme](#9-creating-a-full-custom-theme)
10. [Adding a New Page Section](#10-adding-a-new-page-section)
11. [TypeScript Reference](#11-typescript-reference)
12. [Quick Checklist](#12-quick-checklist)

---

## 1. Architecture Overview

SignalView's theme system works on the same principle as WordPress themes:

| WordPress                         | SignalView                         |
|-----------------------------------|-------------------------------------|
| `wp-content/themes/<name>/`       | `themes/<name>/`                    |
| `header.php`                      | `themes/<name>/Navbar.tsx`          |
| `front-page.php` / banner section   | `themes/<name>/Banner.tsx`      |
| `index.php` / archive loop        | `themes/<name>/ContentRow.tsx`      |
| taxonomy / sidebar list           | `themes/<name>/CategoryGrid.tsx`    |
| `footer.php`                      | `themes/<name>/Footer.tsx`          |
| `style.css` (theme header + vars) | `app/globals.css` + `themes/registry.ts` |
| Parent / child themes             | Shared `darkGoldComponents` set     |

**Two kinds of theme:**

| Kind | What differs | Example |
|---|---|---|
| **Colour-only** | CSS variables only — layout is shared | Midnight, Sunset, Emerald, Cinema Red |
| **Full custom** | Its own React component files + CSS vars | Dark Gold, Neon City |

---

## 2. File Structure

```
themes/
│
├── types.ts            ← ThemeComponents + ThemeDefinition interfaces
├── registry.ts         ← Central list of all registered themes (THEMES array)
│
├── dark-gold/
│   └── index.ts        ← Re-exports default components as darkGoldComponents
│
└── neon-city/
    ├── Navbar.tsx
    ├── Banner.tsx
    ├── ContentRow.tsx
    ├── CategoryGrid.tsx
    ├── Footer.tsx
    └── index.ts        ← Assembles and exports neonCityComponents

components/             ← Default (dark-gold) component files live here
│   Navbar.tsx
│   Banner.tsx
│   ContentRow.tsx
│   CategoryGrid.tsx
│   Footer.tsx
│   ThemeRenderer.tsx   ← "Template loader" — renders the active theme's files

app/
│   globals.css         ← One [data-theme="..."] CSS block per theme

hooks/
│   use-theme.tsx       ← ThemeProvider + useTheme()
│   use-user-prefs.tsx  ← UserPrefsProvider + useUserPrefs()

data/
│   movies.ts           ← Shared content data passed to every theme's components

types/
    content.ts          ← Movie, ContentRowProps interfaces
```

---

## 3. How a Theme is Loaded

```
Admin sets site default  ──► localStorage "signalview-site-theme"
                                          │
                                          ▼
                              ThemeProvider (hooks/use-theme.tsx)
                              reads priority:
                               1. user personal override  ("signalview-theme")
                               2. admin site default      ("signalview-site-theme")
                               3. hardcoded DEFAULT_THEME_ID ("dark-gold")
                                          │
                        ┌─────────────────┴──────────────────┐
                        │                                    │
              applyThemeToDom()                  activeTheme.components
     document.documentElement                      (the ThemeComponents
       .setAttribute("data-theme",                  object from the
           theme.dataTheme)                         theme's index.ts)
                        │                                    │
              CSS variable block                    ThemeRenderer.tsx
           in globals.css fires                  destructures + renders:
                                                  <Navbar />
                                                  <Banner />
                                                  <ContentRow /> × 3
                                                  <CategoryGrid />
                                                  <Footer />
```

`ThemeRenderer.tsx` is the only component that ever touches theme files. `app/page.tsx` just renders `<ThemeRenderer />`.

---

## 4. CSS Variable System

Every theme needs exactly one `[data-theme="<value>"]` block in `app/globals.css`.

### Required variables

| Variable | Purpose |
|---|---|
| `--background` | Page background (`hsl` values, no `hsl()` wrapper) |
| `--foreground` | Default text |
| `--card` | Card / panel background |
| `--card-foreground` | Text on cards |
| `--popover` / `--popover-foreground` | Dropdowns, tooltips |
| `--primary` | Accent / highlight colour |
| `--primary-foreground` | Text on primary-coloured elements |
| `--secondary` / `--secondary-foreground` | Chips, pills, secondary surfaces |
| `--muted` / `--muted-foreground` | Dimmed backgrounds / hint text |
| `--accent` / `--accent-foreground` | Same as primary (shadcn/ui alias) |
| `--destructive` / `--destructive-foreground` | Danger states |
| `--border` | Default border |
| `--input` | Input border |
| `--ring` | Focus ring (usually same as `--primary`) |
| `--radius` | Base border-radius |
| `--sidebar-*` | Admin sidebar colours (6 variables, mirror main tokens) |
| `--gold` | Theme accent alias used by gradient utilities |
| `--gold-dim` | Dimmed version of the accent |
| `--surface-hover` | Hover background for clickable surfaces |
| `--gradient-primary-1/2/3` | Three-stop gradient for `text-gradient-gold` |
| `--hero-bg` | Solid background colour for hero overlay |
| `--banner-bg-overlay` | Semi-transparent version for the gradient overlay |

### Useful utilities (already in globals.css)

```css
.text-gradient-gold   /* gradient text using --gradient-primary-* */
.banner-overlay         /* banner section fade overlay */
.card-shine           /* shimmer on hover */
.scrollbar-hide       /* hides the native scrollbar */
```

### Density scaling (automatic)

The `data-density` attribute (written by `applyPrefs()` in `use-user-prefs.tsx`) controls card width via these pre-defined CSS rules:

| `data-density` value | `.content-card` width |
|---|---|
| `compact` | 7.5 rem → 9 rem (md) |
| *(default / comfortable)* | 10 rem → 12 rem (md) |
| `spacious` | 13 rem → 15 rem (md) |

---

## 5. UserPrefs — Appearance Settings

Stored in `localStorage` under `signalview-prefs`. Managed via `useUserPrefs()`.

| Pref | Type | Effect |
|---|---|---|
| `accentColor` | `"gold" \| "cyan" \| "orange" \| "green" \| "purple" \| "rose"` | Writes `--primary`, `--accent`, `--ring`, gradient vars inline on `<html>` |
| `density` | `"compact" \| "comfortable" \| "spacious"` | Writes `data-density` attribute on `<html>` |
| `radius` | `"sharp" \| "default" \| "rounded"` | Writes `--radius` (`0.125rem` / `0.5rem` / `1rem`) |
| `fontSize` | `"small" \| "medium" \| "large"` | Writes `--font-size-base` (`14px` / `16px` / `18px`) |
| `bannerStyle` | `"static" \| "slider"` | Read by `Banner` — static or auto-cycling carousel |
| `cardStyle` | `"default" \| "detailed"` | Read by `ContentRow` — minimal or expanded hover overlay |

**Inline `style` overrides always win** over the theme's CSS variable block, so `accentColor` is the user's personal accent on top of the theme's base colour.

When a theme is activated, `ThemeProviderWithSync` (in `components/Providers.tsx`) automatically calls:

```ts
setPrefs({ accentColor: theme.nativeAccent, ...theme.defaultPrefs })
```

This ensures the selected theme's natural accent colour is applied, and any theme-specific defaults (e.g. Neon City forces `bannerStyle: "slider"`) are activated.

---

## 6. Admin Panel — Theme Manager

Access at **`/admin`** — login with `admin` / `admin123` (credentials are in `lib/admin-auth.ts`; swap the body of `validateCredentials()` to call a real API).

### Theme Manager page (`/admin/themes`)

**Section 1 — Select Theme**  
Click any theme card to set it as the site-wide default. The selected theme is saved to `localStorage "signalview-site-theme"` and applied immediately for everyone.

**Section 2 — Settings (Active Theme)**  
All six appearance preferences are editable here. Changes take effect instantly and persist across sessions.

| Control | What it changes |
|---|---|
| Accent Colour | `UserPrefs.accentColor` |
| Card Density | `UserPrefs.density` |
| Corner Style | `UserPrefs.radius` |
| Text Size | `UserPrefs.fontSize` |
| Banner Section | `UserPrefs.bannerStyle` |
| Card on Hover | `UserPrefs.cardStyle` |

**Reset to defaults** button restores all settings and resets the theme to `dark-gold`.

---

## 7. Existing Themes

| ID | Name | Type | Component set | Accent |
|---|---|---|---|---|
| `dark-gold` | Dark Gold | Full custom | `darkGoldComponents` | gold |
| `midnight` | Midnight | Colour-only | `darkGoldComponents` | cyan |
| `sunset` | Sunset | Colour-only | `darkGoldComponents` | orange |
| `emerald` | Emerald | Colour-only | `darkGoldComponents` | green |
| `neon-city` | Neon City | Full custom | `neonCityComponents` | purple |
| `cinema-red` | Cinema Red | Colour-only | `darkGoldComponents` | rose |

---

## 8. Creating a Colour-Only Theme

A colour-only theme shares the `darkGoldComponents` layout and only differs by CSS variables. This is equivalent to a WordPress child theme that overrides `style.css` but keeps the parent's templates.

**Example: adding an "Arctic" theme (icy blue-white palette)**

### Step 1 — Add the CSS block in `app/globals.css`

```css
/* ─── Arctic (ice-blue + white) ──────────────────────────────────── */
@layer base {
    [data-theme="arctic"] {
        --background: 210 40% 5%;
        --foreground: 200 15% 95%;

        --card: 210 35% 9%;
        --card-foreground: 200 15% 95%;

        --popover: 210 35% 9%;
        --popover-foreground: 200 15% 95%;

        --primary: 200 100% 65%;
        --primary-foreground: 210 40% 5%;

        --secondary: 210 25% 14%;
        --secondary-foreground: 200 10% 85%;

        --muted: 210 25% 12%;
        --muted-foreground: 200 10% 55%;

        --accent: 200 100% 65%;
        --accent-foreground: 210 40% 5%;

        --destructive: 0 84.2% 60.2%;
        --destructive-foreground: 210 40% 98%;

        --border: 210 25% 17%;
        --input: 210 25% 17%;
        --ring: 200 100% 65%;

        --sidebar-background: 210 35% 7%;
        --sidebar-foreground: 200 10% 85%;
        --sidebar-primary: 200 100% 65%;
        --sidebar-primary-foreground: 210 40% 5%;
        --sidebar-accent: 210 25% 12%;
        --sidebar-accent-foreground: 200 10% 85%;
        --sidebar-border: 210 25% 17%;
        --sidebar-ring: 200 100% 65%;

        --gold: 200 100% 65%;
        --gold-dim: 200 70% 45%;
        --surface-hover: 210 25% 17%;

        --gradient-primary-1: hsl(200 100% 65%);
        --gradient-primary-2: hsl(195 100% 78%);
        --gradient-primary-3: hsl(205 90% 55%);
        --hero-bg: hsl(210 40% 5%);
        --banner-bg-overlay: hsl(210 40% 5% / 0.8);
    }
}
```

### Step 2 — Register it in `themes/registry.ts`

```ts
// At the top of the file — no new import needed (reuses darkGoldComponents)

// Inside the THEMES array:
{
    id: "arctic",
    name: "Arctic",
    description: "Icy deep-blue base with cool white highlights",
    dataTheme: "arctic",               // must match [data-theme="arctic"] in CSS
    previewBg:    "hsl(210 40% 5%)",
    previewCard:  "hsl(210 35% 9%)",
    previewAccent: "hsl(200 100% 65%)",
    nativeAccent: "cyan",              // closest UserPrefs accentColor
    components: darkGoldComponents,    // reuse existing layout
},
```

**That's it.** The theme now appears in the Admin Panel theme picker immediately.

---

## 9. Creating a Full Custom Theme

A full custom theme has its own React component files — completely different HTML structure, layout, and interactions. This is equivalent to a full new WordPress theme.

**Example: adding a "Glassmorphism" theme**

### Step 1 — Create the theme folder

```
themes/
└── glassmorphism/
    ├── Navbar.tsx
    ├── Banner.tsx
    ├── ContentRow.tsx
    ├── CategoryGrid.tsx
    ├── Footer.tsx
    └── index.ts
```

### Step 2 — Build each component

Each component is a standard React functional component. The only contract is the TypeScript interface:

**`themes/glassmorphism/Navbar.tsx`** — no props required
```tsx
"use client";
export default function Navbar() {
    return (
        <nav className="fixed top-0 left-0 right-0 z-50 bg-white/5 backdrop-blur-2xl border-b border-white/10">
            {/* your custom markup */}
        </nav>
    );
}
```

**`themes/glassmorphism/ContentRow.tsx`** — must accept `ContentRowProps`
```tsx
"use client";
import type { ContentRowProps } from "@/types/content";

export default function ContentRow({ title, movies }: ContentRowProps) {
    return (
        <section>
            <h2>{title}</h2>
            {movies.map((m) => (
                <div key={m.title}>{/* glass card markup */}</div>
            ))}
        </section>
    );
}
```

The `Movie` type available on each item:

```ts
interface Movie {
    title: string;   // display title
    image: string;   // URL / path to poster image
    year:  string;   // e.g. "2024"
    rating: string;  // e.g. "8.4"
}
```

The other three components (`Banner`, `CategoryGrid`, `Footer`) take no props — fetch or hard-code any data you need inside them, or extend `ThemeComponents` in `themes/types.ts` if you need to pass extra data.

### Step 3 — Create `themes/glassmorphism/index.ts`

```ts
import type { ThemeComponents } from "@/themes/types";

import Navbar       from "./Navbar";
import Banner   from "./Banner";
import ContentRow   from "./ContentRow";
import CategoryGrid from "./CategoryGrid";
import Footer       from "./Footer";

const glassmorphismComponents: ThemeComponents = {
    Navbar,
    Banner,
    ContentRow,
    CategoryGrid,
    Footer,
};

export default glassmorphismComponents;
```

### Step 4 — Add the CSS block in `app/globals.css`

Follow the same pattern as Section 8 Step 1. Choose a unique `data-theme` value (e.g. `"glass"`).

### Step 5 — Register in `themes/registry.ts`

```ts
import glassmorphismComponents from "./glassmorphism";  // ← new import

// Inside THEMES array:
{
    id: "glassmorphism",
    name: "Glassmorphism",
    description: "Frosted glass surfaces with depth and translucency",
    dataTheme: "glass",                     // matches [data-theme="glass"] in CSS
    previewBg:     "hsl(220 30% 8%)",
    previewCard:   "hsl(220 25% 14% / 0.6)",
    previewAccent: "hsl(210 100% 70%)",
    nativeAccent:  "cyan",
    defaultPrefs:  { density: "spacious" }, // optional per-theme defaults
    components: glassmorphismComponents,    // ← points to own component set
},
```

### Step 6 — Done

No other files change. `ThemeRenderer.tsx` automatically picks up the new component set, and the Admin Panel shows the theme in the picker.

---

## 10. Adding a New Page Section

To add a new section (e.g. a "Featured Playlist" banner) **across all themes**:

1. **Add the component type to `themes/types.ts`**
   ```ts
   export interface ThemeComponents {
       Navbar: ComponentType;
       Banner: ComponentType;
       ContentRow: ComponentType<ContentRowProps>;
       CategoryGrid: ComponentType;
       Footer: ComponentType;
       FeaturedPlaylist: ComponentType;   // ← add this
   }
   ```

2. **Implement it in every theme folder** (and in `components/` for the dark-gold default set)

3. **Add it to `ThemeRenderer.tsx`**
   ```tsx
   const { Navbar, Banner, ContentRow, CategoryGrid, Footer, FeaturedPlaylist } = activeTheme.components;
   // ...
   <FeaturedPlaylist />
   ```

TypeScript will immediately flag any theme that is missing the new component, preventing silent runtime errors.

---

## 11. TypeScript Reference

### `ThemeComponents` — `themes/types.ts`

```ts
interface ThemeComponents {
    Navbar: ComponentType;
    Banner: ComponentType;
    ContentRow: ComponentType<ContentRowProps>;
    CategoryGrid: ComponentType;
    Footer: ComponentType;
}
```

### `ThemeDefinition` — `themes/types.ts`

```ts
interface ThemeDefinition {
    id: string;                            // machine-readable, used for storage
    name: string;                          // displayed in theme picker
    description: string;                   // one-liner shown in card
    dataTheme: string;                     // value of data-theme attribute on <html>
    previewBg: string;                     // swatch preview — background
    previewCard: string;                   // swatch preview — card
    previewAccent: string;                 // swatch preview — accent dot
    nativeAccent: UserPrefs["accentColor"]; // auto-applied accentColor on activation
    defaultPrefs?: Partial<Omit<UserPrefs, "accentColor">>; // optional pref defaults
    components: ThemeComponents;           // the layout file set
}
```

### `UserPrefs` — `hooks/use-user-prefs.tsx`

```ts
interface UserPrefs {
    accentColor: "gold" | "cyan" | "orange" | "green" | "purple" | "rose";
    density:     "compact" | "comfortable" | "spacious";
    radius:      "sharp" | "default" | "rounded";
    fontSize:    "small" | "medium" | "large";
    bannerStyle:   "static" | "slider";
    cardStyle:   "default" | "detailed";
}
```

### `useTheme()` — `hooks/use-theme.tsx`

```ts
const {
    activeThemeId,  // string — ID of currently visible theme
    activeTheme,    // ThemeDefinition — full object
    siteThemeId,    // string — admin-set default
    setTheme,       // (id: string) => void — user override
    setSiteTheme,   // (id: string) => void — admin action
    themes,         // ThemeDefinition[] — all registered themes
} = useTheme();
```

### `useUserPrefs()` — `hooks/use-user-prefs.tsx`

```ts
const {
    prefs,    // UserPrefs — current values
    setPrefs, // (patch: Partial<UserPrefs>) => void — partial update
} = useUserPrefs();
```

---

## 12. Quick Checklist

### Colour-only theme
- [ ] Add `[data-theme="<id>"]` block to `app/globals.css` with all required variables
- [ ] Add entry to `THEMES` array in `themes/registry.ts` with `components: darkGoldComponents`

### Full custom theme
- [ ] Create `themes/<name>/` folder
- [ ] Add `Navbar.tsx` (no props)
- [ ] Add `Banner.tsx` (no props)
- [ ] Add `ContentRow.tsx` (accepts `ContentRowProps`)
- [ ] Add `CategoryGrid.tsx` (no props)
- [ ] Add `Footer.tsx` (no props)
- [ ] Add `index.ts` that exports a `ThemeComponents` object
- [ ] Add `[data-theme="<id>"]` block to `app/globals.css`
- [ ] Import component set and add entry to `THEMES` in `themes/registry.ts`

### Verification
- [ ] Run `npx tsc --noEmit` — must return zero errors
- [ ] Open `/admin/themes` — new theme appears in picker
- [ ] Select the theme — layout switches without a page reload
- [ ] Open the frontend `/` — correct components render
