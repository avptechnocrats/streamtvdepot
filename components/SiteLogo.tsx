"use client";

import Image from "next/image";
import Link from "next/link";
import { Play } from "lucide-react";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { useTenantName } from "@/hooks/use-tenant-name";
import { Skeleton } from "@/components/ui/skeleton";

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
    const { logo_url, isLoading } = useSiteSettings();
    const label = useTenantName();

    if (isLoading) {
        return (
            <div className={className}>
                <Skeleton className="rounded-lg shrink-0" style={{ width: imageSize, height: imageSize }} />
                {showLabel && <Skeleton className="h-5 w-32 rounded-md" />}
            </div>
        );
    }

    return (
        <Link href="/" className={className}>
            {logo_url ? (
                <Image
                    src={logo_url}
                    alt={label}
                    width={130}
                    height={40}
                    className="object-contain rounded-lg"
                />
            ) : (
                <div
                    className="rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center shrink-0"
                    style={{ width: imageSize, height: imageSize }}
                >
                    <Play size={Math.round(imageSize * 0.44)} className="text-primary ml-0.5" fill="currentColor" />
                </div>
            )}
            {showLabel && !logo_url && (
                <span className={labelClassName}>{label}</span>
            )}
        </Link>
    );
}
