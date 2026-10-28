# Copilot instructions

White-label, multi-tenant streaming storefront (movies, TV shows, PPV events, live TV) built on **Next.js 16 (App Router) + React 18 + TypeScript + Tailwind 3 + shadcn/ui (Radix)**. It is a frontend for a separate StreamTVDepot backend (`NEXT_PUBLIC_API_URL`); there is no database or business logic here.

**Next.js here has breaking changes vs. older versions.** Before writing Next-specific code, read the relevant guide in `node_modules/next/dist/docs/` (see [AGENTS.md](../AGENTS.md)).

## Commands

```bash
npm run dev      # next dev -p ${PORT:-3003}
npm run build    # next build
npm run start    # next start -p ${PORT:-3003}
npx tsc --noEmit # type-check (no script wired up)
```

- There is no test runner and no ESLint config (`npm run lint` → `next lint` is not usable on Next 16). Validate with `npx tsc --noEmit` / `npm run build`.
- `tsconfig.json` is non-strict (`strict`, `strictNullChecks`, `noImplicitAny` off). Path alias: `@/*` → repo root.
- Env (`.env.local`): `CLIENT_SLUG` (server-only tenant slug), `NEXT_PUBLIC_CLIENT_SLUG`, `NEXT_PUBLIC_CLIENT_BRAND`, `NEXT_PUBLIC_API_URL`, `PORT`; optional `PREVIEW_BASE_DOMAIN` (multi-tenant preview mode), `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (NextAuth). Never print or commit these values.

## Architecture

### Multi-tenancy via the middleware proxy ([middleware.ts](../middleware.ts))
The tenant ("client slug") is never chosen by client code. `middleware.ts` resolves it (`CLIENT_SLUG` env wins; otherwise the single-level subdomain of `PREVIEW_BASE_DOMAIN`) and:
- sets an `x-client-slug` request header for server components / route handlers (e.g. `app/layout.tsx`, the NextAuth route);
- proxies `GET /api/public/*` → `<BACKEND>/public/*?slug=<slug>`;
- proxies `POST /api/auth/<action>` → `<BACKEND>/auth/user/<action>`, injecting `client_slug` into the body for actions in `SLUG_REQUIRED` and forwarding `Authorization` for `AUTH_REQUIRED`. Actions must be listed in `BACKEND_PATH`; any `/api/auth/*` path not in that map falls through to NextAuth;
- in preview mode, redirects tenants whose `site-settings` returns 404 to the main site.

When adding an auth action or public endpoint, update the maps in `middleware.ts` rather than creating a route handler.

### Two API clients ([lib/services/](../lib/services))
- `publicApiClient` (`public-client.ts`): baseURL `/api/public`, no auth — anonymous catalog data (categories, home contents, site/theme settings, menus, plans). Slug is added by the middleware.
- `apiClient` (`client.ts`): baseURL `NEXT_PUBLIC_API_URL`, attaches the bearer token from `localStorage` (`sv_access_token` / `sv_refresh_token`); on 401 it attempts a silent refresh, then clears tokens and redirects to login. Use for authenticated calls (profile, watchlist, checkout, DRM/playback).
- One file per backend domain exports typed interfaces plus fetch functions; import from `@/lib/services/<domain>` (the `index.ts` barrel is outdated and its comment references a non-existent `@/lib/api`). Shared paths live in `endpoints.ts`.

### Auth
Two paths: email/password goes through the `/api/auth/*` proxy and `hooks/use-auth.tsx` (tokens in localStorage); Google sign-in goes through NextAuth (`app/api/auth/[...nextauth]/route.ts`), whose `jwt` callback exchanges the Google profile for backend tokens via `/auth/user/google-login`.

### Provider / shell composition
`app/layout.tsx` → `components/Providers.tsx` (SessionProvider → AuthProvider → SiteSettingsProvider → UserPrefsProvider → ThemeProvider → React Query) → `AppShell`. `AppShell` calls `useThemeSettings()` (applies the admin-configured theme from the API), checks tenant availability (renders `TenantMaintenanceScreen` if inactive), and renders the active theme's `Navbar`/`Footer` around page content. Selecting a theme pushes its `nativeAccent`/`defaultPrefs` into `UserPrefs`.

### Theme system ([themes/](../themes))
WordPress-style: each theme is a `ThemeDefinition` in `themes/registry.ts` with a `components` set (`Navbar`, `Banner`, `ContentRow`, `CategoryGrid`, `Footer`, per `themes/types.ts`) and a `dataTheme` that maps to a `[data-theme="..."]` CSS-variable block in `app/globals.css`.
- Colour-only themes (midnight, sunset, emerald) reuse `darkGoldComponents`; only layout-different themes (e.g. neon-city, apple-tv, ember) have their own components.
- Pages must get Navbar/Banner/ContentRow/CategoryGrid/Footer from `useTheme().activeTheme.components` (e.g. `MoviesClient.tsx`, `app/categories/[slug]/page.tsx`), not import the base components directly, so themes take effect.
- Adding a theme: create `themes/<id>/` + `index.ts`, add the CSS block in `globals.css`, register in `registry.ts`.

### Pages and playback
`app/<route>/page.tsx` is generally a thin wrapper; interactive logic lives in `app/<route>/_components/*Client.tsx` (`"use client"`). The account area is under `app/account/*` with its own `layout.tsx`. Playback uses `components/ManagedVideoPlayer.tsx` / `VideoPlayer.tsx` (video.js + HLS quality selector + Google IMA ads; the IMA SDK script is loaded in `app/layout.tsx`). Paid/PPV gating is in `hooks/use-content-access.tsx` and `hooks/use-play-gate.tsx`; payments (Stripe/PayPal) go through `CheckoutModal` and `ContentPaymentModal`.

## Conventions
- 4-space indentation, double quotes, semicolons.
- Use `cn()` from `@/lib/utils` for class merging; `components/ui/*` are shadcn primitives (config in `components.json`).
- Backend media often has both raw S3 URLs and pre-signed `*_display_url` fields; prefer the display URL (see `getCategoryImageUrl`, `lib/image-utils.ts`, `lib/media.ts`). `next.config.ts` sets `images.unoptimized` with wildcard remote patterns.
- Tenant branding (name, logo) comes from site settings and `NEXT_PUBLIC_CLIENT_BRAND` (`use-site-settings`, `use-tenant-name`, `lib/tenant-display.ts`), not hardcoded strings.
