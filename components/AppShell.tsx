"use client";

import { useEffect, useState } from "react";
import { useThemeSettings } from "@/hooks/use-theme-settings";
import { useTheme } from "@/hooks/use-theme";
import TenantMaintenanceScreen from "@/components/TenantMaintenanceScreen";
import { checkTenantAvailability } from "@/lib/services/tenant-status";

export default function AppShell({ children }: { children: React.ReactNode }) {
    useThemeSettings();
    const { activeTheme } = useTheme();
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

    return (
        <div className="min-h-screen bg-background">
            <Navbar />
            {children}
            <Footer />
        </div>
    );
}
