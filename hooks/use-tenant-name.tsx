"use client";

import { useEffect, useState } from "react";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { getTenantNameFromHost, toDisplayName } from "@/lib/tenant-display";

export function useTenantName(fallback = "your service"): string {
    const { site_title } = useSiteSettings();
    const [hostTenantName, setHostTenantName] = useState<string | null>(null);

    useEffect(() => {
        const fromHost = getTenantNameFromHost(window.location.hostname);
        if (fromHost) {
            setHostTenantName(fromHost);
            return;
        }

        const fromEnv = process.env.NEXT_PUBLIC_CLIENT_SLUG
            ? toDisplayName(process.env.NEXT_PUBLIC_CLIENT_SLUG)
            : "";
        setHostTenantName(fromEnv || null);
    }, []);

    return site_title?.trim() || hostTenantName || fallback;
}