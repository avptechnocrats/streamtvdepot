"use client";

import { useMemo } from "react";
import { Activity, Clock3, LogIn, Monitor } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useAdminAuth } from "@/hooks/use-admin-auth";

export default function AccountActivityPage() {
    const { session, role } = useAdminAuth();

    const events = useMemo(
        () => [
            { label: "Session started", value: session ? new Date(session.loginAt).toLocaleString() : "Unknown", icon: LogIn },
            { label: "Session expires", value: session ? new Date(session.expiresAt).toLocaleString() : "Unknown", icon: Clock3 },
            { label: "Login method", value: "Email + password", icon: Monitor },
            { label: "Role", value: role === "superadmin" ? "Super Admin" : "Client Admin", icon: Activity },
        ],
        [role, session],
    );

    return (
        <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
            <Card className="border-border/80 bg-card/90 backdrop-blur-sm">
                <CardContent className="p-6 space-y-4">
                    <div className="space-y-1">
                        <h2 className="text-2xl font-display font-semibold tracking-tight text-foreground">Account Activity</h2>
                        <p className="text-sm text-muted-foreground">This view is populated from the current authenticated session until server-side audit history is available.</p>
                    </div>

                    <div className="space-y-3">
                        {events.map(({ label, value, icon: Icon }) => (
                            <div key={label} className="flex items-start gap-3 rounded-2xl border border-border bg-background/60 p-4">
                                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                    <Icon size={16} />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
                                    <p className="mt-1 text-sm font-medium text-foreground break-words">{value}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            <Card className="border-border/80 bg-card/90 backdrop-blur-sm">
                <CardContent className="p-6 space-y-4">
                    <p className="text-sm font-semibold text-foreground">Planned audit events</p>
                    <div className="space-y-3 text-sm text-muted-foreground">
                        <p>Successful and failed sign-in attempts.</p>
                        <p>Password changes and recovery actions.</p>
                        <p>Device and browser metadata for each login.</p>
                        <p>Future API-backed access logs when the audit endpoint is added.</p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}