/**
 * Root-level proxy middleware
 *
 * Intercepts all requests to:
 *  - Inject the client slug into /api/public/* and /api/auth/* proxied calls.
 *  - Pass x-client-slug as a request header so server components can read it.
 *
 *  /api/public/:path*  → GET  <BACKEND>/public/:path*?slug=<slug>
 *  /api/auth/:action   → POST <BACKEND>/auth/user/:action  (slug in body where required)
 *
 * Slug resolution (first match wins):
 *  1. CLIENT_SLUG env var  — dedicated single-client deployments (e.g. KalingoTV).
 *  2. Subdomain of PREVIEW_BASE_DOMAIN — shared preview deployment with wildcard SSL.
 *     e.g. acmecorp.preview.streamtvdepot.com  →  slug = "acmecorp"
 */

import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.NEXT_PUBLIC_API_URL;
const CLIENT_SLUG = process.env.CLIENT_SLUG;

// Pre-compute once — PREVIEW_BASE_DOMAIN never changes at runtime.
const PREVIEW_SUFFIX = process.env.PREVIEW_BASE_DOMAIN
    ? `.${process.env.PREVIEW_BASE_DOMAIN.toLowerCase()}`
    : null;
const TENANT_REDIRECT_URL = "https://streamtvdepot.com/";

// ── Slug resolution ───────────────────────────────────────────────────────────

function resolveSlug(request: NextRequest): string | null {
    // 1. Static single-client deployment (env var always wins)
    if (CLIENT_SLUG) return CLIENT_SLUG;

    // 2. Preview deployment: extract slug from the subdomain
    //    acmecorp.preview.streamtvdepot.com → "acmecorp"
    if (PREVIEW_SUFFIX) {
        const host = (
            request.headers.get("x-forwarded-host") ||
            request.headers.get("host") ||
            ""
        ).toLowerCase().split(":")[0]; // strip port if present

        if (host.endsWith(PREVIEW_SUFFIX)) {
            const sub = host.slice(0, host.length - PREVIEW_SUFFIX.length);
            if (sub && !sub.includes(".")) return sub; // single-level subdomain only
        }
    }

    return null;
}

// ── Auth constants ────────────────────────────────────────────────────────────

/** Actions that require client_slug injected into the request body. */
const SLUG_REQUIRED = new Set(["signup", "login", "forgot-password", "google-login", "verify-email", "resend-verification"]);

/** Actions that require forwarding the caller's Authorization header. */
const AUTH_REQUIRED = new Set(["change-password"]);

/** Valid action → backend path segment mapping. */
const BACKEND_PATH: Record<string, string> = {
    signup: "signup",
    login: "login",
    refresh: "refresh",
    "change-password": "change-password",
    "forgot-password": "forgot-password",
    "reset-password": "reset-password",
    "google-login": "google-login",
    "verify-email": "verify-email",
    "resend-verification": "resend-verification",
};

// ── Middleware ────────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const slug = resolveSlug(request);
    const host = (
        request.headers.get("x-forwarded-host") ||
        request.headers.get("host") ||
        ""
    ).toLowerCase().split(":")[0];
    const isPreviewHost = Boolean(PREVIEW_SUFFIX && host.endsWith(PREVIEW_SUFFIX));

    // Inject slug into request headers so server components (e.g. layout.tsx)
    // can read it via next/headers without relying solely on the env var.
    const requestHeaders = new Headers(request.headers);
    if (slug) requestHeaders.set("x-client-slug", slug);

    // ── Public API proxy ──────────────────────────────────────────────────────
    if (pathname.startsWith("/api/public/")) {
        if (!slug) {
            return NextResponse.json(
                { detail: "Client not configured on this server." },
                { status: 500 },
            );
        }

        const upstreamPath = pathname.slice("/api/public/".length);
        const searchParams = new URLSearchParams(request.nextUrl.searchParams);
        searchParams.set("slug", slug);

        const upstream = await fetch(
            `${BACKEND}/public/${upstreamPath}?${searchParams.toString()}`,
            {
                method: request.method,
                headers: { "Content-Type": "application/json" },
                body: request.method === "GET" || request.method === "HEAD"
                    ? undefined
                    : await request.text(),
                cache: "no-store",
            },
        );

        const body = await upstream.text();
        return new NextResponse(body, {
            status: upstream.status,
            headers: { "Content-Type": "application/json" },
        });
    }

    // ── Auth proxy ────────────────────────────────────────────────────────────
    // NextAuth uses /api/auth/* internally — only proxy requests whose action
    // maps to a known backend endpoint; everything else (session, csrf,
    // callback, providers, signout, signin) is handled by NextAuth itself.
    if (pathname.startsWith("/api/auth/")) {
        const action = pathname.slice("/api/auth/".length);
        const backendSegment = BACKEND_PATH[action];

        if (!backendSegment) {
            // Let NextAuth handle its own routes (session, callback, csrf, etc.).
            // x-client-slug is forwarded so the jwt callback can read the slug
            // after the Google OAuth redirect round-trip.
            return NextResponse.next({ request: { headers: requestHeaders } });
        }

        if (SLUG_REQUIRED.has(action) && !slug) {
            return NextResponse.json({ detail: "Client not configured." }, { status: 500 });
        }

        const headers: Record<string, string> = { "Content-Type": "application/json" };
        for (const header of ["cf-connecting-ip", "cf-ipcountry", "x-forwarded-for", "x-real-ip", "x-vercel-ip-country"]) {
            const value = request.headers.get(header);
            if (value) headers[header] = value;
        }

        if (AUTH_REQUIRED.has(action)) {
            const authorization = request.headers.get("Authorization");
            if (!authorization) {
                return NextResponse.json(
                    { detail: "Authentication required." },
                    { status: 401 },
                );
            }
            headers["Authorization"] = authorization;
        }

        // Gracefully handle missing or malformed body (e.g. refresh with no payload).
        let body: Record<string, unknown> = {};
        try {
            body = await request.json();
        } catch {
            // Body is empty or not valid JSON — proceed with an empty object.
        }

        const payload = SLUG_REQUIRED.has(action)
            ? { ...body, client_slug: slug }
            : body;

        const upstream = await fetch(`${BACKEND}/auth/user/${backendSegment}`, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
        });

        // change-password returns 204 No Content
        if (upstream.status === 204) {
            return new NextResponse(null, { status: 204 });
        }

        const data = await upstream.text();
        return new NextResponse(data, {
            status: upstream.status,
            headers: { "Content-Type": "application/json" },
        });
    }

    // ── Preview tenant guard ────────────────────────────────────────────────
    // In preview multi-tenant mode, redirect unknown tenants to the main site.
    if (!CLIENT_SLUG && isPreviewHost && slug) {
        try {
            const check = await fetch(`${BACKEND}/public/site-settings?slug=${slug}`, {
                headers: { "Content-Type": "application/json" },
                cache: "no-store",
            });

            if (check.status === 404) {
                return NextResponse.redirect(TENANT_REDIRECT_URL, 307);
            }
        } catch {
            // If tenant validation fails due to transient network issues,
            // continue without redirecting to avoid false-positive redirects.
        }
    }

    // ── All other routes ──────────────────────────────────────────────────────
    // Pass through with x-client-slug injected so server components can read it.
    return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
    matcher: [
        /*
         * Match all routes except Next.js internals and static assets.
         * This ensures x-client-slug is set on every server-rendered page
         * (required for the preview multi-tenant deployment).
         */
        "/((?!_next/static|_next/image|favicon.ico).*)",
    ],
};
