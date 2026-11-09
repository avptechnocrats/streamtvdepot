"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useThemeSettings } from "@/hooks/use-theme-settings";
import { useTheme } from "@/hooks/use-theme";
import { useUserPrefs } from "@/hooks/use-user-prefs";
import { useSiteSettings } from "@/hooks/use-site-settings";
import TenantMaintenanceScreen from "@/components/TenantMaintenanceScreen";
import SiteLogo from "@/components/SiteLogo";
import { Skeleton } from "@/components/ui/skeleton";
import { checkTenantAvailability } from "@/lib/services/tenant-status";
import { fetchPublicActiveMenus, type PublicActiveMenus } from "@/lib/services/menus";

export default function AppShell({ children }: { children: React.ReactNode }) {
    useThemeSettings();
    const { activeTheme } = useTheme();
    const { prefsReady } = useUserPrefs();
    const { isLoading: settingsLoading } = useSiteSettings();
    const queryClient = useQueryClient();
    const { isPending: menusLoading } = useQuery({
        queryKey: ["active-menus"],
        queryFn: () => fetchPublicActiveMenus().catch(() =>
            queryClient.getQueryData<PublicActiveMenus>(["active-menus"]) ?? { header: null, footer: null }
        ),
        staleTime: 60_000,
    });
    const { Navbar, Footer } = activeTheme.components;
    const [isTenantInactive, setIsTenantInactive] = useState(false);

    useEffect(() => {
        let cancelled = false;

        checkTenantAvailability().then((result) => {
            if (!cancelled) {
                setIsTenantInactive(result.inactive);
            }
        });

        return () => {
            cancelled = true;
        };
    }, []);

    if (isTenantInactive) {
        return <TenantMaintenanceScreen />;
    }

    if (!prefsReady || settingsLoading || menusLoading) {
        return <div className="min-h-screen bg-background" aria-busy="true" aria-label="Loading site">
            <div role="status" className="sr-only">Loading site</div>
            <div className="flex h-[73px] items-center justify-between gap-6 border-b border-border/30 px-4 sm:px-6 lg:px-14">
                <SiteLogo />
                <div aria-hidden="true" className="hidden items-center gap-6 md:flex">
                    <Skeleton className="h-4 w-16 rounded" />
                    <Skeleton className="h-4 w-16 rounded" />
                    <Skeleton className="h-4 w-16 rounded" />
                </div>
                <Skeleton aria-hidden="true" className="h-8 w-20 rounded-md" />
            </div>
        </div>;
    }

    return (
        <div className="min-h-screen bg-background">
            <Navbar />
            {children}
            <Footer />
        </div>
    );
}
