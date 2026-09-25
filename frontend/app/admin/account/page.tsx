"use client";

import { useMemo } from "react";
import { BadgeCheck, Clock3, Mail, Shield, UserRound } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { getAdminDisplayName, getAdminFirstName } from "@/lib/admin-auth";

export default function AccountInformationPage() {
    const { session, role } = useAdminAuth();
    const displayName = getAdminDisplayName(session);
    const firstName = getAdminFirstName(session);

    const details = useMemo(
        () => [
            { label: "Full Name", value: displayName, icon: UserRound },
            { label: "Email", value: session?.email ?? "Not available", icon: Mail },
            { label: "Role", value: role === "superadmin" ? "Super Admin" : "Client Admin", icon: Shield },
            { label: "Signed in", value: session ? new Date(session.loginAt).toLocaleString() : "Unknown", icon: Clock3 },
            { label: "Session expires", value: session ? new Date(session.expiresAt).toLocaleString() : "Unknown", icon: BadgeCheck },
        ],
        [displayName, role, session],
    );

    return (
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <Card className="border-border/80 bg-card/90 backdrop-blur-sm">
                <CardContent className="p-6 space-y-6">
                    <div className="flex items-center gap-4">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                            <UserRound size={28} />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-muted-foreground">Account Information</p>
                            <h2 className="text-2xl font-display font-semibold tracking-tight text-foreground">
                                {firstName}
                            </h2>
                            <p className="text-sm text-foreground/80">{displayName}</p>
                            <p className="text-sm text-muted-foreground">Identity details for the active admin session.</p>
                        </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        {details.map(({ label, value, icon: Icon }) => (
                            <div key={label} className="rounded-2xl border border-border bg-background/60 p-4">
                                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                    <Icon size={16} />
                                </div>
                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
                                <p className="mt-1 text-sm font-medium text-foreground break-words">{value}</p>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            <Card className="border-border/80 bg-card/90 backdrop-blur-sm">
                <CardContent className="p-6 space-y-4">
                    <p className="text-sm font-semibold text-foreground">What you can do here</p>
                    <div className="space-y-3 text-sm text-muted-foreground">
                        <p>Review the email and session metadata tied to your login.</p>
                        <p>Use Security to change the password for this admin account.</p>
                        <p>Use Notification Settings to control reminder and alert preferences.</p>
                        <p>Use Account Activity to review recent sign-in history and session timing.</p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}