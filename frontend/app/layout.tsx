import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import Providers from "@/components/Providers";

export const metadata: Metadata = {
    title: "StreamTVDepot",
    description: "Your premium streaming destination",
};

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
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
