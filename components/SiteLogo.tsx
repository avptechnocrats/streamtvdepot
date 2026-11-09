"use client";

import Image from "next/image";
import Link from "next/link";
import { Play } from "lucide-react";
import { useState } from "react";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { useTenantName } from "@/hooks/use-tenant-name";
import { Skeleton } from "@/components/ui/skeleton";

const bundledLogoUrl = process.env.NEXT_PUBLIC_CLIENT_LOGO?.trim();

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
 * - Shows bundled branding immediately while the uploaded logo loads
 * - Uses the server-local copy when bundled branding is unavailable
 * - Otherwise: renders the default Play icon + tenant/site label text
 */

export default function SiteLogo({
    className = "flex items-center gap-3",
    imageSize = 48,
    showLabel = true,
    labelClassName = "text-xl font-display font-800 text-gradient-gold tracking-tight",
}: SiteLogoProps) {
    const { logo_url, isLoading } = useSiteSettings();
    const label = useTenantName();
    const [localLogoLoaded, setLocalLogoLoaded] = useState(false);
    const [localLogoFailed, setLocalLogoFailed] = useState(false);
    const [loadedLogoUrl, setLoadedLogoUrl] = useState<string | null>(null);
    const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);
    const [bundledLogoFailed, setBundledLogoFailed] = useState(false);
    const remoteLogoLoaded = Boolean(logo_url && loadedLogoUrl === logo_url);
    const bundledLogoAvailable = Boolean(bundledLogoUrl && !bundledLogoFailed);
    const hasLogo = bundledLogoAvailable || localLogoLoaded || remoteLogoLoaded;
    const logoPending = isLoading || (!bundledLogoAvailable && !localLogoFailed)
        || Boolean(logo_url && !remoteLogoLoaded && failedLogoUrl !== logo_url);
    const showLogoFrame = hasLogo || logoPending;

    return (
        <Link href="/" className={className} aria-label={label}>
            {showLogoFrame ? (
                <span className="relative block w-[130px] h-10 shrink-0">
                    {!hasLogo && (
                        <Skeleton className="absolute inset-0 h-full w-full rounded-lg" role="status" aria-label="Loading logo" />
                    )}
                    {bundledLogoUrl && bundledLogoAvailable && (
                        <Image
                            src={bundledLogoUrl}
                            alt={label}
                            aria-hidden={remoteLogoLoaded}
                            width={130}
                            height={40}
                            unoptimized
                            loading="eager"
                            fetchPriority="high"
                            className={`absolute inset-0 w-full h-full object-contain rounded-lg ${remoteLogoLoaded ? "invisible" : ""}`}
                            onError={() => setBundledLogoFailed(true)}
                        />
                    )}
                    {!bundledLogoAvailable && !localLogoFailed && (
                        <Image
                            src="/api/public/site-logo"
                            alt={label}
                            aria-hidden={!localLogoLoaded || remoteLogoLoaded}
                            width={130}
                            height={40}
                            unoptimized
                            loading="eager"
                            className={`absolute inset-0 w-full h-full object-contain rounded-lg ${!localLogoLoaded || remoteLogoLoaded ? "invisible" : ""}`}
                            onLoad={() => setLocalLogoLoaded(true)}
                            onError={() => { setLocalLogoFailed(true); setLocalLogoLoaded(false); }}
                        />
                    )}
                    {logo_url && (
                        <Image
                            key={logo_url}
                            src={logo_url}
                            alt={label}
                            aria-hidden={!remoteLogoLoaded}
                            width={130}
                            height={40}
                            unoptimized
                            loading="eager"
                            className={`absolute inset-0 w-full h-full object-contain rounded-lg ${remoteLogoLoaded ? "" : "opacity-0"}`}
                            onLoad={() => setLoadedLogoUrl(logo_url)}
                            onError={() => { setLoadedLogoUrl(null); setFailedLogoUrl(logo_url); }}
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
            {showLabel && !showLogoFrame && (
                <span className={labelClassName}>{label}</span>
            )}
        </Link>
    );
}
