"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, KeyRound, Loader2, CheckCircle2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { userChangePassword } from "@/lib/services/user-auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function SecurityClient() {
    const { user, accessToken, isLoading } = useAuth();
    const router = useRouter();

    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    if (!isLoading && !user) {
        router.replace("/login");
        return null;
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);

        if (newPassword.length < 8) {
            setError("New password must be at least 8 characters.");
            return;
        }
        if (newPassword !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        setLoading(true);
        try {
            await userChangePassword(
                { current_password: currentPassword, new_password: newPassword },
                accessToken!,
            );
            setSuccess(true);
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to change password.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div>
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-2xl font-black text-foreground tracking-tight">Security</h1>
                <p className="text-sm text-muted-foreground mt-0.5">Update your password</p>
            </div>

            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
                <section className="rounded-2xl border border-border/60 bg-card">
                    <div className="px-6 py-5 border-b border-border/50 flex items-center gap-3">
                        <span className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                            <KeyRound size={18} className="text-primary" />
                        </span>
                        <div>
                            <p className="text-sm font-semibold text-foreground">Change Password</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Must be at least 8 characters</p>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="p-6 space-y-5">
                        {success && (
                            <div className="flex items-center gap-2.5 text-sm text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-3">
                                <CheckCircle2 size={16} className="shrink-0" />
                                Password updated successfully.
                            </div>
                        )}

                        {error && (
                            <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3">
                                <span className="mt-0.5 shrink-0">⚠</span>
                                {error}
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <Label htmlFor="current_password" className="text-sm font-medium">Current password</Label>
                            <div className="relative">
                                <Input
                                    id="current_password"
                                    type={showCurrent ? "text" : "password"}
                                    placeholder="Enter current password"
                                    autoComplete="current-password"
                                    required
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    className="h-11 bg-secondary/50 border-border/60 focus:border-primary/60 pr-11"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowCurrent((v) => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                    aria-label={showCurrent ? "Hide" : "Show"}
                                >
                                    {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
                                </button>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="new_password" className="text-sm font-medium">New password</Label>
                            <div className="relative">
                                <Input
                                    id="new_password"
                                    type={showNew ? "text" : "password"}
                                    placeholder="At least 8 characters"
                                    autoComplete="new-password"
                                    required
                                    minLength={8}
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="h-11 bg-secondary/50 border-border/60 focus:border-primary/60 pr-11"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowNew((v) => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                    aria-label={showNew ? "Hide" : "Show"}
                                >
                                    {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                                </button>
                            </div>
                            {newPassword.length > 0 && newPassword.length < 8 && (
                                <p className="text-xs text-muted-foreground">At least 8 characters required</p>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="confirm_password" className="text-sm font-medium">Confirm new password</Label>
                            <div className="relative">
                                <Input
                                    id="confirm_password"
                                    type={showConfirm ? "text" : "password"}
                                    placeholder="Re-enter new password"
                                    autoComplete="new-password"
                                    required
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="h-11 bg-secondary/50 border-border/60 focus:border-primary/60 pr-11"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirm((v) => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                    aria-label={showConfirm ? "Hide" : "Show"}
                                >
                                    {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                                </button>
                            </div>
                            {confirmPassword.length > 0 && confirmPassword !== newPassword && (
                                <p className="text-xs text-destructive">Passwords do not match</p>
                            )}
                        </div>

                        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-center text-sm text-muted-foreground sm:text-left">
                                Forgot your current password?{" "}
                                <Link href="/forgot-password" className="font-medium text-primary transition-colors hover:text-primary/80">
                                    Reset it
                                </Link>
                            </p>
                            <Button
                                type="submit"
                                className="h-9 w-full font-semibold sm:w-auto"
                                disabled={loading}
                            >
                                {loading
                                    ? <><Loader2 size={15} className="mr-2 animate-spin" />Updating…</>
                                    : "Update Password"}
                            </Button>
                        </div>
                    </form>
                </section>

                <section className="rounded-2xl border border-border/60 bg-card">
                    <div className="flex items-center gap-3 border-b border-border/50 px-6 py-5">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                            <ShieldCheck size={18} className="text-primary" />
                        </span>
                        <div>
                            <p className="text-sm font-semibold text-foreground">Password guidelines</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">Keep your account protected</p>
                        </div>
                    </div>

                    <div className="space-y-6 p-6">
                        <div>
                            <h2 className="text-sm font-semibold text-foreground">Password rules</h2>
                            <ul className="mt-3 space-y-3 text-sm text-muted-foreground">
                                <li className="flex items-start gap-2.5">
                                    <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-500" />
                                    <span>Use at least 8 characters.</span>
                                </li>
                                <li className="flex items-start gap-2.5">
                                    <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-500" />
                                    <span>Use a mix of uppercase and lowercase letters, numbers, and symbols.</span>
                                </li>
                                <li className="flex items-start gap-2.5">
                                    <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-500" />
                                    <span>Do not reuse a password from another account.</span>
                                </li>
                            </ul>
                        </div>

                        <div className="border-t border-border/50 pt-5">
                            <h2 className="text-sm font-semibold text-foreground">Create a strong password</h2>
                            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground marker:text-primary">
                                <li>Choose a memorable phrase that is difficult to guess.</li>
                                <li>Avoid names, birthdays, phone numbers, and common words.</li>
                                <li>Use a password manager to create and store unique passwords.</li>
                            </ul>
                        </div>
                    </div>
                </section>
            </div>

        </div>
    );
}
