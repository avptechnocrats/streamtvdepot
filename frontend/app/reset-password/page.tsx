"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { unifiedResetPassword } from "@/lib/api";

export default function ResetPasswordPage() {
    const [token, setToken] = useState("");
    const [hasTokenFromLink, setHasTokenFromLink] = useState(false);
    const [isInvitation, setIsInvitation] = useState(false);
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const canSubmit = useMemo(
        () => token.trim().length > 0 && newPassword.length >= 8 && confirmPassword.length >= 8,
        [token, newPassword, confirmPassword],
    );

    useEffect(() => {
        if (typeof window === "undefined") return;
        const params = new URLSearchParams(window.location.search);
        const linkedToken = params.get("token") || "";
        setToken(linkedToken);
        setHasTokenFromLink(Boolean(linkedToken));
        setIsInvitation(params.get("intent") === "invite");
    }, []);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);
        setSuccess(null);

        if (newPassword.length < 8) {
            setError("Password must be at least 8 characters.");
            return;
        }
        if (newPassword !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        setLoading(true);
        try {
            await unifiedResetPassword({ token: token.trim(), new_password: newPassword });

            setSuccess(
                isInvitation
                    ? "Your account is ready. You can now sign in with your new password."
                    : "Password reset successful. You can now sign in with your new password.",
            );
            setNewPassword("");
            setConfirmPassword("");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unable to reset password.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-16 bg-background">
            <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-xl">
                <div className="mb-6">
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">
                        {isInvitation ? "Team Invitation" : "Account Recovery"}
                    </p>
                    <h1 className="mt-2 text-2xl font-display font-semibold text-foreground">
                        {isInvitation ? "Set up your account" : "Reset password"}
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {isInvitation
                            ? "Choose a strong password to activate your team account."
                            : "Set a strong new password for your admin account."}
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {!hasTokenFromLink && (
                        <div className="space-y-1.5">
                            <label htmlFor="token" className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reset token</label>
                            <textarea
                                id="token"
                                value={token}
                                onChange={(event) => setToken(event.target.value)}
                                rows={3}
                                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                                placeholder="Paste your reset token"
                                required
                            />
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <label htmlFor="newPassword" className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">New password</label>
                        <div className="relative">
                            <input
                                id="newPassword"
                                type={showPassword ? "text" : "password"}
                                value={newPassword}
                                onChange={(event) => setNewPassword(event.target.value)}
                                className="h-10 w-full rounded-lg border border-border bg-background px-3 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                                placeholder="Minimum 8 characters"
                                autoComplete="new-password"
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword((prev) => !prev)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label htmlFor="confirmPassword" className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Confirm new password</label>
                        <input
                            id="confirmPassword"
                            type={showPassword ? "text" : "password"}
                            value={confirmPassword}
                            onChange={(event) => setConfirmPassword(event.target.value)}
                            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                            placeholder="Re-enter your password"
                            autoComplete="new-password"
                            required
                        />
                    </div>

                    {error && (
                        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                            {error}
                        </div>
                    )}

                    {success && (
                        <div className="rounded-lg border border-emerald-700/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                            {success}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading || !canSubmit}
                        className="h-10 w-full rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <span className="inline-flex items-center gap-2">
                                <Loader2 size={14} className="animate-spin" /> Resetting...
                            </span>
                        ) : (
                            isInvitation ? "Set up account" : "Reset password"
                        )}
                    </button>
                </form>

                <div className="mt-5 flex items-center justify-between text-xs text-muted-foreground">
                    <Link href="/login" className="hover:text-foreground">Back to sign in</Link>
                    <Link href="/forgot-password" className="hover:text-foreground">Request another token</Link>
                </div>
            </div>
        </div>
    );
}
