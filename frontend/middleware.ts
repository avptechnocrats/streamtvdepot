/**
 * Next.js Edge Middleware — hostname-based tenant routing
 *
 * Routing rules (in order):
 *
 *  1. streamtvdepot.com                  → SAAS platform (marketing + /admin panel)
 *  2. console.streamtvdepot.com            → admin panel (same app, /admin/* routes)
 *  3. admin.<anything>                → client admin panel, rewrites to /admin/*
 *                                       and injects X-Client-Domain header
 *  4. <anything else> (e.g. kalingo.tv) → client storefront, rewrites to /site/*
 *                                         and injects X-Client-Domain header
 *
 * The middleware only rewrites the URL internally — the browser URL stays unchanged.
 * Page components read the injected headers via `headers()` from next/headers.
 */

import { NextRequest, NextResponse } from "next/server";

// Domains that belong to the SAAS platform itself
const PLATFORM_HOSTS = new Set([
    "localhost",
    "streamtvdepot.com",
    "www.streamtvdepot.com",
    "console.streamtvdepot.com",
]);

const PLATFORM_ADMIN_HOSTS = new Set([
    "console.streamtvdepot.com",
    "admin.streamtvdepot.com",
]);

export function middleware(request: NextRequest) {
    const host = request.headers.get("host") ?? "";
    // Strip port for local dev (e.g. "localhost:3000" → "localhost")
    const hostname = host.replace(/:\d+$/, "");
    const pathname = request.nextUrl.pathname;

    // ── 1. SAAS platform itself ────────────────────────────────────────────────
    if (PLATFORM_HOSTS.has(hostname)) {
        // No rewrite needed — serve as-is
        return NextResponse.next();
    }

    // ── 2. admin.streamtvdepot.com → serve admin panel as-is ─────────────────────
    if (PLATFORM_ADMIN_HOSTS.has(hostname)) {
        // Ensure all traffic lands under /admin/
        if (!pathname.startsWith("/admin")) {
            return NextResponse.redirect(new URL("/admin", request.url));
        }
        return NextResponse.next();
    }

    // ── 3. admin.<client-domain>  e.g. admin.kalingo.tv ───────────────────────
    if (hostname.startsWith("admin.")) {
        // Extract the client slug hint from the subdomain:
        //   admin.kalingo.tv  → base = "kalingo.tv"
        //   admin.kalingo-tv.streamtvdepot.com → base = "kalingo-tv.streamtvdepot.com"
        const base = hostname.slice("admin.".length);

        // If the path is already under /admin just let it through with the header
        const targetPath = pathname.startsWith("/admin") ? pathname : `/admin${pathname}`;
        const url = request.nextUrl.clone();
        url.pathname = targetPath;

        const res = NextResponse.rewrite(url);
        res.headers.set("x-client-domain", base);
        return res;
    }

    // ── 4. Client storefront  e.g. kalingo.tv ─────────────────────────────────
    // Skip Next.js internals
    if (
        pathname.startsWith("/_next") ||
        pathname.startsWith("/api") ||
        pathname === "/favicon.ico"
    ) {
        return NextResponse.next();
    }

    const url = request.nextUrl.clone();
    url.pathname = `/site${pathname === "/" ? "" : pathname}`;

    const res = NextResponse.rewrite(url);
    res.headers.set("x-client-domain", hostname);
    return res;
}

export const config = {
    // Run on every route except static files
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
