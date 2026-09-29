import type { Metadata } from "next";
import Script from "next/script";
import { headers } from "next/headers";
import "./globals.css";
import Providers from "@/components/Providers";
import AppShell from "@/components/AppShell";

async function fetchSiteTitle(): Promise<{ title: string; desc: string }> {
    try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL;
        // Production deployments use CLIENT_SLUG env; preview mode reads the
        // header injected by middleware from the request subdomain.
        const headersList = await headers();
        const slug = process.env.CLIENT_SLUG || headersList.get("x-client-slug");
        if (!apiUrl || !slug) throw new Error("Missing env");
        const res = await fetch(`${apiUrl}/public/site-settings?slug=${slug}`, {
            next: { revalidate: 3600 },
        });
        if (!res.ok) throw new Error("Bad response");
        const data = await res.json();
        return {
            title: data.site_title || "StreamTVDepot",
            desc: data.tagline || "Watch movies, TV shows and live channels.",
        };
    } catch {
        return { title: "StreamTVDepot", desc: "Watch movies, TV shows and live channels." };
    }
}

export async function generateMetadata(): Promise<Metadata> {
    const { title, desc } = await fetchSiteTitle();
    return {
        title: { template: `%s | ${title}`, default: `${title} — ${desc}` },
        description: desc,
    };
}

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body>
                {/*
                  * Google IMA3 SDK — required by videojs-ima for VAST / VPAID / VMAP ads.
                  * strategy="afterInteractive" loads it after hydration; the VideoPlayer
                  * component waits for window.google?.ima to exist before calling player.ima().
                  */}
                <Script
                    src="https://imasdk.googleapis.com/js/sdkloader/ima3.js"
                    strategy="afterInteractive"
                />
                <Providers>
                    <AppShell>{children}</AppShell>
                </Providers>
            </body>
        </html>
    );
}
