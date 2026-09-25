"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UserPrefsProvider, useUserPrefs } from "@/hooks/use-user-prefs";
import { ThemeProvider } from "@/hooks/use-theme";
import type { ThemeDefinition } from "@/themes/types";

/**
 * Bridges the two independent contexts:
 * When the user picks a new theme, its nativeAccent (+ any defaultPrefs) are
 * automatically pushed into UserPrefs so inline-style overrides stay consistent.
 * This component must live *inside* UserPrefsProvider.
 */
function ThemeProviderWithSync({ children }: { children: React.ReactNode }) {
    const { setPrefs } = useUserPrefs();

    const handleThemeChange = (theme: ThemeDefinition) => {
        setPrefs({
            accentColor: theme.nativeAccent,
            ...theme.defaultPrefs,
        });
    };

    return (
        <ThemeProvider onThemeChange={handleThemeChange}>
            {children}
        </ThemeProvider>
    );
}

export default function Providers({ children }: { children: React.ReactNode }) {
    const [queryClient] = useState(() => new QueryClient());

    return (
        <UserPrefsProvider>
            <ThemeProviderWithSync>
                <QueryClientProvider client={queryClient}>
                    <TooltipProvider>
                        <Toaster />
                        <Sonner />
                        {children}
                    </TooltipProvider>
                </QueryClientProvider>
            </ThemeProviderWithSync>
        </UserPrefsProvider>
    );
}
