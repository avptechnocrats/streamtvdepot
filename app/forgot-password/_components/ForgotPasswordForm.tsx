"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, ArrowLeft, Mail, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { userForgotPassword } from "@/lib/services/user-auth";
import SiteLogo from "@/components/SiteLogo";

export default function ForgotPasswordForm() {
    const [email, setEmail] = useState("");
    const [sent, setSent] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            await userForgotPassword({ email });
            setSent(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Request failed");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="fixed inset-0 z-[100] flex">
            {/* ── Left panel — cinematic backdrop ─────────────────────── */}
            <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
                <img
                    src="/images/hero-banner.jpg"
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-background/60 via-background/30 to-background/80" />
                <div className="relative z-10 flex flex-col justify-between p-12 w-full">
                    <SiteLogo imageSize={36} showLabel={false} />
                    <div className="space-y-4">
                        <h2 className="text-4xl font-display font-800 text-foreground leading-tight">
                            We&apos;ve got<br />
                            <span className="text-gradient-gold">you covered</span>.
                        </h2>
                        <p className="text-muted-foreground text-base max-w-xs">
                            Password resets are quick and secure. You&apos;ll be back to watching in no time.
                        </p>
                    </div>
                    <div className="flex gap-6 text-sm text-muted-foreground">
                        <span>🔒 Secure reset</span>
                        <span>📧 Email verified</span>
                    </div>
                </div>
            </div>

            {/* ── Right panel — form ───────────────────────────────────── */}
            <div className="w-full lg:w-1/2 bg-background flex items-center justify-center p-6 overflow-auto">
                <div className="w-full max-w-sm">
                    {/* Mobile logo */}
                    <div className="flex lg:hidden mb-10">
                        <SiteLogo imageSize={32} showLabel={false} />
                    </div>

                    {sent ? (
                        <div className="text-center space-y-6">
                            <div className="w-16 h-16 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center mx-auto">
                                <CheckCircle2 size={32} className="text-primary" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-foreground">Check your inbox</h1>
                                <p className="text-muted-foreground text-sm mt-2">
                                    If <span className="text-foreground font-medium">{email}</span> is registered,
                                    you&apos;ll receive a reset link shortly.
                                </p>
                            </div>
                            <div className="bg-secondary/40 border border-border/40 rounded-xl p-4 flex items-start gap-3 text-left">
                                <Mail size={18} className="text-primary mt-0.5 shrink-0" />
                                <p className="text-sm text-muted-foreground">
                                    Didn&apos;t get the email? Check your spam folder or{" "}
                                    <button
                                        onClick={() => setSent(false)}
                                        className="text-primary hover:text-primary/80 underline transition-colors"
                                    >
                                        try again
                                    </button>.
                                </p>
                            </div>
                            <Link href="/login">
                                <Button variant="outline" className="w-full h-11 gap-2">
                                    <ArrowLeft size={16} />
                                    Back to Sign In
                                </Button>
                            </Link>
                        </div>
                    ) : (
                        <>
                            <Link
                                href="/login"
                                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
                            >
                                <ArrowLeft size={15} />
                                Back to Sign In
                            </Link>

                            <div className="mb-8">
                                <h1 className="text-2xl font-bold text-foreground">Forgot your password?</h1>
                                <p className="text-muted-foreground text-sm mt-1">
                                    Enter your email and we&apos;ll send you a reset link.
                                </p>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-5">
                                <div className="space-y-1.5">
                                    <Label htmlFor="email" className="text-sm font-medium">Email address</Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="you@example.com"
                                        autoComplete="email"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="h-11 bg-secondary/50 border-border/60 focus:border-primary/60"
                                    />
                                </div>

                                {error && (
                                    <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2.5">
                                        <span className="mt-0.5 shrink-0">⚠</span>
                                        <span>{error}</span>
                                    </div>
                                )}

                                <Button
                                    type="submit"
                                    className="w-full h-11 font-semibold"
                                    disabled={loading}
                                >
                                    {loading
                                        ? <><Loader2 size={16} className="mr-2 animate-spin" />Sending…</>
                                        : "Send Reset Link"
                                    }
                                </Button>
                            </form>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
