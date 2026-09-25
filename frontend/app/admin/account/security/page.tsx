"use client";

import { useState } from "react";
import { Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { useToast } from "@/hooks/use-toast";
import { clientAdminChangePassword, superadminChangePassword, type ChangePasswordRequest } from "@/lib/api";
import { getAdminDisplayName } from "@/lib/admin-auth";

export default function SecurityPage() {
    const { session, role } = useAdminAuth();
    const displayName = getAdminDisplayName(session);
    const { toast } = useToast();
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (newPassword.length < 8) {
            toast({ title: "Password too short", description: "Use at least 8 characters.", variant: "destructive" });
            return;
        }

        if (newPassword !== confirmPassword) {
            toast({ title: "Passwords do not match", description: "Confirm the new password before saving.", variant: "destructive" });
            return;
        }

        if (newPassword === currentPassword) {
            toast({ title: "Choose a different password", description: "New password must be different from current password.", variant: "destructive" });
            return;
        }

        const payload: ChangePasswordRequest = {
            current_password: currentPassword,
            new_password: newPassword,
        };

        setIsSaving(true);
        try {
            if (role === "superadmin") {
                await superadminChangePassword(payload);
            } else {
                await clientAdminChangePassword(payload);
            }

            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
            toast({
                title: "Password updated",
                description: "Your admin password has been changed successfully.",
                variant: "success",
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unable to update password.";
            toast({ title: "Update failed", description: message, variant: "destructive" });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
            <Card className="border-border/80 bg-card/90 backdrop-blur-sm">
                <CardContent className="p-6 space-y-6">
                    <div className="flex items-start gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                            <ShieldCheck size={24} />
                        </div>
                        <div className="space-y-1">
                            <h2 className="text-2xl font-display font-semibold tracking-tight text-foreground">Security</h2>
                            <p className="text-sm text-muted-foreground">Change the password for {displayName}.</p>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">Current password</label>
                                <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" required />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">New password</label>
                                <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" required />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">Confirm new password</label>
                                <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" required />
                            </div>
                        </div>

                        <Button type="submit" disabled={isSaving} className="min-w-40">
                            {isSaving ? <Loader2 size={16} className="animate-spin" /> : null}
                            {isSaving ? "Updating..." : "Update password"}
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <Card className="border-border/80 bg-card/90 backdrop-blur-sm">
                <CardContent className="p-6 space-y-4">
                    <div className="flex items-center gap-3 text-amber-500">
                        <TriangleAlert size={18} />
                        <p className="text-sm font-semibold text-foreground">Password guidance</p>
                    </div>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                        <li>Use at least 8 characters.</li>
                        <li>Mix letters, numbers, and symbols.</li>
                        <li>Do not reuse passwords from other systems.</li>
                    </ul>
                </CardContent>
            </Card>
        </div>
    );
}