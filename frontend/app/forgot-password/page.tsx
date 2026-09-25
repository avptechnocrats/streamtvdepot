"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Mail, Shield } from "lucide-react";
import { unifiedForgotPassword } from "@/lib/api";
import LoginLogo from "@/components/LoginLogo";

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [resetToken, setResetToken] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);
        setMessage(null);
        setResetToken(null);
        setLoading(true);

        try {
            const response = await unifiedForgotPassword(email.trim());
            setMessage(response.message || "If that email exists, a reset link has been sent.");
            if (response.reset_token) setResetToken(response.reset_token);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unable to process your request.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-16 bg-background">
            <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-xl">
                <div className="mb-10 flex justify-center">
                    <LoginLogo href="/" />
                </div>
                <div className="mb-6">
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">Account Recovery</p>
                    <h1 className="mt-2 text-2xl font-display font-semibold text-foreground">Forgot password</h1>
                    <p className="mt-1 text-sm text-muted-foreground">Enter your admin email and we will send a reset link.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                        <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email</label>
                        <div className="relative">
                            <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                                placeholder="admin@example.com"
                                required
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                            {error}
                        </div>
                    )}

                    {message && (
                        <div className="space-y-2 rounded-lg border border-emerald-700/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                            <p>{message}</p>
                            {resetToken && (
                                <div className="rounded-md border border-border bg-background/70 p-2">
                                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Development reset token</p>
                                    <p className="break-all font-mono text-xs text-foreground mt-1">{resetToken}</p>
                                    <Link href={`/reset-password?token=${encodeURIComponent(resetToken)}`} className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                                        <Shield size={12} /> Open reset page with token
                                    </Link>
                                </div>
                            )}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="h-10 w-full rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <span className="inline-flex items-center gap-2">
                                <Loader2 size={14} className="animate-spin" /> Sending...
                            </span>
                        ) : (
                            "Send reset instructions"
                        )}
                    </button>
                </form>

                <div className="mt-5 flex items-center justify-between text-xs text-muted-foreground">
                    <Link href="/login" className="hover:text-foreground">Back to sign in</Link>
                    <Link href="/reset-password" className="hover:text-foreground">Already have a token?</Link>
                </div>
            </div>
        </div>
    );
}
