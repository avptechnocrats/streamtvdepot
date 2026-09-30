"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { fetchPublicSiteSettings, type PublicSiteSettings } from "@/lib/services/site-settings";
import { getTenantNameFromHost } from "@/lib/tenant-display";

const defaultSettings: PublicSiteSettings = {
    site_title: null,
    tagline: null,
    site_language: null,
    copyright_text: null,
    logo_s3_key: null,
    logo_url: null,
    contact_email: null,
    youtube_url: null,
    instagram_url: null,
    facebook_url: null,
};

interface SiteSettingsContextValue extends PublicSiteSettings {
    isLoading: boolean;
}

const SiteSettingsContext = createContext<SiteSettingsContextValue>({
    ...defaultSettings,
    isLoading: true,
});

function shouldSkipPublicSettingsFetch(): boolean {
    if (typeof window === "undefined") return false;

    const hostname = window.location.hostname.toLowerCase();
    const hasExplicitClientSlug = Boolean(process.env.NEXT_PUBLIC_CLIENT_SLUG);
    const hasPreviewTenant = Boolean(getTenantNameFromHost(hostname));
    const isLocalTenantless = ["localhost", "127.0.0.1", "0.0.0.0"].includes(hostname)
        && !hasExplicitClientSlug
        && !hasPreviewTenant;

    return isLocalTenantless;
}

export function SiteSettingsProvider({ children }: { children: React.ReactNode }) {
    const [settings, setSettings] = useState<PublicSiteSettings>(defaultSettings);
    const [isLoading, setIsLoading] = useState(true);
    const fetched = useRef(false);

    useEffect(() => {
        if (shouldSkipPublicSettingsFetch()) {
            setIsLoading(false);
            return;
        }

        if (fetched.current) return;
        fetched.current = true;
        fetchPublicSiteSettings()
            .then(setSettings)
            .catch(() => {/* keep defaults */ })
            .finally(() => setIsLoading(false));
    }, []);

    return (
        <SiteSettingsContext.Provider value={{ ...settings, isLoading }}>
            {children}
        </SiteSettingsContext.Provider>
    );
}

export function useSiteSettings(): SiteSettingsContextValue {
    return useContext(SiteSettingsContext);
}
