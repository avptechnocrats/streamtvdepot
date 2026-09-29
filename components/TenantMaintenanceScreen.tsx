"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Mail, RefreshCw } from "lucide-react";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { getTenantNameFromHost, toDisplayName } from "@/lib/tenant-display";

export default function TenantMaintenanceScreen() {
    const { site_title, tagline, contact_email } = useSiteSettings();
    const [tenantName, setTenantName] = useState<string | null>(null);

    useEffect(() => {
        const fromHost = getTenantNameFromHost(window.location.hostname);
        if (fromHost) {
            setTenantName(fromHost);
            return;
        }

        const fromEnv = process.env.NEXT_PUBLIC_CLIENT_SLUG
            ? toDisplayName(process.env.NEXT_PUBLIC_CLIENT_SLUG)
            : "";
        setTenantName(fromEnv || null);
    }, []);

    const title = site_title?.trim() || tenantName || "SignalView";

    return (
        <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
            <div className="pointer-events-none absolute inset-0">
                <div className="absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
                <div className="absolute bottom-0 left-0 h-60 w-60 rounded-full bg-primary/10 blur-3xl" />
                <div className="absolute right-0 top-1/3 h-52 w-52 rounded-full bg-primary/10 blur-3xl" />
            </div>

            <div className="relative mx-auto flex min-h-screen w-full max-w-3xl items-center px-6 py-12 sm:px-10">
                <section className="w-full rounded-2xl border border-border/70 bg-card/70 p-8 shadow-2xl backdrop-blur md:p-10">
                    <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold tracking-wide text-primary">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Service Notice
                    </div>

                    <h1 className="text-3xl font-bold leading-tight sm:text-4xl">
                        {title} is temporarily under maintenance
                    </h1>

                    <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
                        {tagline || "We are making improvements and will be back online shortly."}
                    </p>
                    <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
                        If your access has been interrupted, please contact support for immediate assistance.
                    </p>

                    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                        <button
                            type="button"
                            onClick={() => window.location.reload()}
                            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
                        >
                            <RefreshCw className="h-4 w-4" />
                            Retry
                        </button>

                        {contact_email ? (
                            <Link
                                href={`mailto:${contact_email}`}
                                className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-secondary px-4 py-2.5 text-sm font-semibold text-secondary-foreground transition hover:bg-surface-hover"
                            >
                                <Mail className="h-4 w-4" />
                                Contact Support
                            </Link>
                        ) : null}
                    </div>

                    <p className="mt-6 text-xs text-muted-foreground">
                        Error code: tenant_plan_inactive
                    </p>
                </section>
            </div>
        </main>
    );
}
