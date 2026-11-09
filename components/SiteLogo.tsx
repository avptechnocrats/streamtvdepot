"use client";

import Image from "next/image";
import Link from "next/link";
import { Play } from "lucide-react";
import { useState } from "react";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { useTenantName } from "@/hooks/use-tenant-name";

interface SiteLogoProps {
    /** Extra class names for the wrapper <Link> */
    className?: string;
    /** Image size in px (used for both width and height) */
    imageSize?: number;
    /** Whether to show the fallback text label */
    showLabel?: boolean;
    /** Override the text colour for the fallback label */
    labelClassName?: string;
}

/**
 * Renders the site logo:
 * - If site_config has a logo_url: renders the uploaded image
 * - Otherwise: renders the default Play icon + tenant/site label text
 */

export default function SiteLogo({
    className = "flex items-center gap-3",
    imageSize = 48,
    showLabel = true,
    labelClassName = "text-xl font-display font-800 text-gradient-gold tracking-tight",
}: SiteLogoProps) {
    const { logo_url } = useSiteSettings();
    const label = useTenantName();
    const [localLogoLoaded, setLocalLogoLoaded] = useState(false);
    const [localLogoFailed, setLocalLogoFailed] = useState(false);
    const [loadedLogoUrl, setLoadedLogoUrl] = useState<string | null>(null);
    const remoteLogoLoaded = Boolean(logo_url && loadedLogoUrl === logo_url);
    const hasLogo = localLogoLoaded || remoteLogoLoaded;

    return (
        <Link href="/" className={className}>
            {logo_url || !localLogoFailed ? (
                <span className="relative block w-[130px] h-10 shrink-0">
                    {!hasLogo && (
                        <span className="flex h-full items-center gap-2">
                            <Play size={Math.round(imageSize * 0.44)} className="shrink-0 text-primary" fill="currentColor" />
                            {showLabel && <span className="truncate text-sm font-medium">{label}</span>}
                        </span>
                    )}
                    {!localLogoFailed && (
                        <Image
                            src="/api/public/site-logo"
                            alt={label}
                            width={130}
                            height={40}
                            unoptimized
                            loading="eager"
                            className={`absolute inset-0 w-full h-full object-contain rounded-lg ${remoteLogoLoaded ? "invisible" : ""}`}
                            onLoad={() => setLocalLogoLoaded(true)}
                            onError={() => { setLocalLogoFailed(true); setLocalLogoLoaded(false); }}
                        />
                    )}
                    {logo_url && (
                        <Image
                            key={logo_url}
                            src={logo_url}
                            alt={label}
                            width={130}
                            height={40}
                            unoptimized
                            loading="eager"
                            className={`absolute inset-0 w-full h-full object-contain rounded-lg ${remoteLogoLoaded ? "" : "opacity-0"}`}
                            onLoad={() => setLoadedLogoUrl(logo_url)}
                            onError={() => setLoadedLogoUrl(null)}
                        />
                    )}
                </span>
            ) : (
                <div
                    className="rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center shrink-0"
                    style={{ width: imageSize, height: imageSize }}
                >
                    <Play size={Math.round(imageSize * 0.44)} className="text-primary ml-0.5" fill="currentColor" />
                </div>
            )}
            {showLabel && !logo_url && localLogoFailed && (
                <span className={labelClassName}>{label}</span>
            )}
        </Link>
    );
}
