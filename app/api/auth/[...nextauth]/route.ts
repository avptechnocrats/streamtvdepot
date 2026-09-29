import NextAuth, { type NextAuthOptions } from "next-auth";
import Google from "next-auth/providers/google";
import { NextRequest } from "next/server";

const BACKEND = process.env.NEXT_PUBLIC_API_URL;

/**
 * Resolve the client slug for this request.
 *
 * Resolution order (first match wins):
 *  1. CLIENT_SLUG env var — dedicated single-client deployments (e.g. KalingoTV).
 *  2. x-client-slug header — injected by middleware from the request subdomain;
 *     present on every route including the OAuth callback round-trip.
 *  3. Direct subdomain extraction — safety net in case middleware didn't run.
 *
 * No cookies are needed: the OAuth callback arrives on the same subdomain
 * (e.g. acmecorp.preview.streamtvdepot.com) so the slug is always derivable
 * from the host header without persisting anything across requests.
 */
function resolveSlug(req: NextRequest): string | null {
    // 1. Static single-client deployment
    if (process.env.CLIENT_SLUG) return process.env.CLIENT_SLUG;

    // 2. Slug already extracted by middleware (covers all preview routes)
    const fromHeader = req.headers.get("x-client-slug");
    if (fromHeader) return fromHeader;

    // 3. Direct subdomain extraction (safety net)
    const previewBase = process.env.PREVIEW_BASE_DOMAIN;
    if (previewBase) {
        const host = (
            req.headers.get("x-forwarded-host") ||
            req.headers.get("host") ||
            ""
        ).toLowerCase().split(":")[0];
        const suffix = `.${previewBase.toLowerCase()}`;
        if (host.endsWith(suffix)) {
            const sub = host.slice(0, host.length - suffix.length);
            if (sub && !sub.includes(".")) return sub;
        }
    }

    return null;
}

function buildAuthOptions(clientSlug: string | null): NextAuthOptions {
    return {
        providers: [
            Google({
                clientId: process.env.GOOGLE_CLIENT_ID!,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            }),
        ],
        pages: {
            signIn: "/login",
            error: "/login",
        },
        callbacks: {
            /**
             * Called after a successful OAuth sign-in.
             * We call our backend's google-login endpoint to register/login the user
             * and store the resulting JWT tokens directly in the NextAuth token.
             */
            async jwt({ token, account, profile }) {
                if (account?.provider === "google" && profile) {
                    try {
                        const res = await fetch(`${BACKEND}/auth/user/google-login`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                email: profile.email,
                                full_name: (profile as any).name ?? "",
                                google_id: (profile as any).sub,
                                avatar_url: (profile as any).picture ?? null,
                                client_slug: clientSlug,
                            }),
                        });

                        if (res.ok) {
                            const data = await res.json();
                            token.backendAccessToken = data.access_token;
                            token.backendRefreshToken = data.refresh_token;
                        } else {
                            const err = await res.json().catch(() => ({}));
                            token.backendError = (err as any)?.detail ?? "Backend registration failed";
                        }
                    } catch (err) {
                        token.backendError = "Could not reach backend";
                    }
                }
                return token;
            },

            async session({ session, token }) {
                (session as any).backendAccessToken = token.backendAccessToken;
                (session as any).backendRefreshToken = token.backendRefreshToken;
                (session as any).backendError = token.backendError;
                return session;
            },
        },
    };
}

function handler(req: NextRequest, ctx: unknown) {
    const slug = resolveSlug(req);
    return NextAuth(buildAuthOptions(slug))(req as any, ctx as any);
}

export { handler as GET, handler as POST };