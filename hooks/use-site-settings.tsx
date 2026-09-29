"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { fetchPublicSiteSettings, type PublicSiteSettings } from "@/lib/services/site-settings";

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

export function SiteSettingsProvider({ children }: { children: React.ReactNode }) {
    const [settings, setSettings] = useState<PublicSiteSettings>(defaultSettings);
    const [isLoading, setIsLoading] = useState(true);
    const fetched = useRef(false);

    useEffect(() => {
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
