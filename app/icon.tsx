import { ImageResponse } from "next/og";
import { headers } from "next/headers";

export const size = {
    width: 64,
    height: 64,
};

export const contentType = "image/png";

async function getBranding(): Promise<{ faviconUrl: string | null; initial: string }> {
    try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL;
        const headersList = await headers();
        const slug = process.env.CLIENT_SLUG || headersList.get("x-client-slug");
        if (!apiUrl || !slug) return { faviconUrl: null, initial: "S" };

        const response = await fetch(`${apiUrl}/public/site-settings?slug=${encodeURIComponent(slug)}`, {
            next: { revalidate: 3600 },
        });
        if (!response.ok) return { faviconUrl: null, initial: "S" };

        const data = await response.json() as { site_title?: string | null; favicon_url?: string | null };
        return {
            faviconUrl: data.favicon_url ?? null,
            initial: data.site_title?.trim().charAt(0).toUpperCase() || "S",
        };
    } catch {
        return { faviconUrl: null, initial: "S" };
    }
}

export default async function Icon() {
    const { faviconUrl, initial } = await getBranding();
    if (faviconUrl) {
        const favicon = await fetch(faviconUrl);
        if (favicon.ok) return new Response(await favicon.arrayBuffer(), { headers: { "Content-Type": favicon.headers.get("content-type") || "image/png" } });
    }

    return new ImageResponse(
        (
            <div
                style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#0b0e17",
                    color: "#d9a441",
                    fontSize: 42,
                    fontWeight: 800,
                    fontFamily: "sans-serif",
                }}
            >
                {initial}
            </div>
        ),
        size,
    );
}