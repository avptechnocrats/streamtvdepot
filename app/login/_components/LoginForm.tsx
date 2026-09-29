"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2, MailCheck } from "lucide-react";
import { signIn, getSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { userLogin, userResendVerification, userVerifyEmail } from "@/lib/services/user-auth";
import { fetchSocialAuthConfig } from "@/lib/services/site-settings";
import SiteLogo from "@/components/SiteLogo";
import { useTenantName } from "@/hooks/use-tenant-name";

export default function LoginForm() {
    const router = useRouter();
    const tenantName = useTenantName();
    const searchParams = useSearchParams();
    const requestedReturnTo = searchParams.get("returnTo") ?? "/";
    const returnTo = requestedReturnTo.startsWith("/") && !requestedReturnTo.startsWith("//")
        ? requestedReturnTo
        : "/";
    const { login, user, isLoading: authLoading } = useAuth();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPass, setShowPass] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [needsVerification, setNeedsVerification] = useState(false);
    const [otp, setOtp] = useState("");
    const [verifying, setVerifying] = useState(false);
    const [resendNotice, setResendNotice] = useState<string | null>(null);
    const [resending, setResending] = useState(false);
    const [googleEnabled, setGoogleEnabled] = useState(false);
    const [oauthLoading, setOauthLoading] = useState(true);

    useEffect(() => {
        const loadOAuthConfig = async () => {
            try {
                const config = await fetchSocialAuthConfig();
                setGoogleEnabled(config?.google?.enabled ?? false);
            } catch (err) {
                // Silently fail - just disable OAuth
                setGoogleEnabled(false);
            } finally {
                setOauthLoading(false);
            }
        };
        loadOAuthConfig();
    }, []);

    useEffect(() => {
        if (!authLoading && user) {
            router.replace(returnTo);
        }
    }, [authLoading, router, returnTo, user]);

    if (authLoading || user) return null;

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setNeedsVerification(false);
        setResendNotice(null);
        setLoading(true);
        try {
            const tokens = await userLogin({ email, password });
            login(tokens.access_token, tokens.refresh_token);
            router.replace(tokens.requires_subscription
                ? `/pricing?returnTo=${encodeURIComponent(returnTo)}`
                : returnTo);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Login failed";
            setError(msg);
            setNeedsVerification(msg.toLowerCase().includes("email not verified"));
        } finally {
            setLoading(false);
        }
    }

    async function handleResendVerification() {
        setResending(true);
        setResendNotice(null);
        try {
            const res = await userResendVerification(email);
            setResendNotice(res.message);
        } catch (err) {
            setResendNotice(err instanceof Error ? err.message : "Could not resend verification email");
        } finally {
            setResending(false);
        }
    }

    async function handleVerifyEmail() {
        setError(null);
        setResendNotice(null);
        setVerifying(true);
        try {
            const verification = await userVerifyEmail(email, otp);
            if (!verification.verified) {
                setError("Invalid OTP. Please try again.");
                return;
            }
            const tokens = await userLogin({ email, password });
            login(tokens.access_token, tokens.refresh_token);
            router.replace(tokens.requires_subscription
                ? `/pricing?returnTo=${encodeURIComponent(returnTo)}`
                : returnTo);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Invalid OTP. Please try again.");
        } finally {
            setVerifying(false);
        }
    }

    async function handleGoogleLogin() {
        setGoogleLoading(true);
        try {
            const result = await signIn("google", {
                callbackUrl: "/",
                redirect: false,
            });

            if (result?.error) {
                setError("Google login failed. Please try again.");
                return;
            }

            if (result?.ok || result?.url) {
                // Fetch the NextAuth session which contains the backend JWT tokens
                const session = await getSession();
                const accessToken = (session as any)?.backendAccessToken;
                const refreshToken = (session as any)?.backendRefreshToken;
                const backendError = (session as any)?.backendError;

                if (backendError || !accessToken || !refreshToken) {
                    setError(backendError ?? "Google login failed. Please try again.");
                    return;
                }

                login(accessToken, refreshToken);
                router.replace(returnTo);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Google login failed");
        } finally {
            setGoogleLoading(false);
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
                            Your world of<br />
                            <span className="text-gradient-gold">entertainment</span><br />
                            starts here.
                        </h2>
                        <p className="text-muted-foreground text-base max-w-xs">
                            Stream thousands of movies, live TV channels, and exclusive shows.
                        </p>
                    </div>
                    <div className="flex gap-6 text-sm text-muted-foreground">
                        <span>🎬 Movies</span>
                        <span>📺 Live TV</span>
                        <span>🎭 Series</span>
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

                    {/* Google Login Button */}
                    {!oauthLoading && googleEnabled && (
                    <Button
                        type="button"
                        onClick={handleGoogleLogin}
                        variant="outline"
                        className="w-full h-11 mb-5 flex items-center justify-center gap-2"
                        disabled={googleLoading || loading}
                    >
                        {googleLoading ? (
                            <>
                                <Loader2 size={16} className="animate-spin" />
                                <span>Signing in...</span>
                            </>
                        ) : (
                            <>
                                <svg className="w-5 h-5" viewBox="0 0 24 24">
                                    <path
                                        fill="currentColor"
                                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                    />
                                    <path
                                        fill="currentColor"
                                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                    />
                                    <path
                                        fill="currentColor"
                                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                    />
                                    <path
                                        fill="currentColor"
                                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                    />
                                </svg>
                                <span>Sign in with Google</span>
                            </>
                        )}
                    </Button>
                    )}

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

                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                                <Link
                                    href="/forgot-password"
                                    className="text-xs text-primary hover:text-primary/80 transition-colors"
                                >
                                    Forgot password?
                                </Link>
                            </div>
                            <div className="relative">
                                <Input
                                    id="password"
                                    type={showPass ? "text" : "password"}
                                    placeholder="••••••••"
                                    autoComplete="current-password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="h-11 bg-secondary/50 border-border/60 focus:border-primary/60 pr-11"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPass((v) => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                    aria-label={showPass ? "Hide password" : "Show password"}
                                >
                                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>

                        {error && (
                            <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2.5">
                                <span className="mt-0.5 shrink-0">⚠</span>
                                <span>{error}</span>
                            </div>
                        )}

                        {needsVerification && (
                            <div className="space-y-3 rounded-lg border border-border/60 bg-secondary/30 p-4 text-center">
                                <MailCheck className="mx-auto h-7 w-7 text-primary" />
                                <p className="text-sm text-muted-foreground">Enter the code sent to your email.</p>
                                <InputOTP maxLength={6} value={otp} onChange={setOtp} disabled={verifying}>
                                    <InputOTPGroup className="mx-auto">
                                        {Array.from({ length: 6 }, (_, index) => <InputOTPSlot key={index} index={index} />)}
                                    </InputOTPGroup>
                                </InputOTP>
                                <Button type="button" className="w-full" onClick={handleVerifyEmail} disabled={verifying || otp.length !== 6}>
                                    {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify email"}
                                </Button>
                                <button
                                    type="button"
                                    onClick={handleResendVerification}
                                    disabled={resending || !email}
                                    className="text-sm text-primary hover:text-primary/80 font-medium transition-colors disabled:opacity-60"
                                >
                                    {resending ? "Sending…" : "Resend OTP"}
                                </button>
                            </div>
                        )}

                        {resendNotice && (
                            <p className="text-sm text-muted-foreground">{resendNotice}</p>
                        )}

                        <Button
                            type="submit"
                            className="w-full h-11 font-semibold"
                            disabled={loading}
                        >
                            {loading
                                ? <><Loader2 size={16} className="mr-2 animate-spin" />Signing in…</>
                                : "Sign In"
                            }
                        </Button>
                    </form>

                    <div className="relative my-6">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-border/40" />
                        </div>
                        <div className="relative flex justify-center">
                            <span className="bg-background px-3 text-xs text-muted-foreground">New to {tenantName}?</span>
                        </div>
                    </div>

                    <Link href="/signup">
                        <Button variant="outline" className="w-full h-11">
                            Create an account
                        </Button>
                    </Link>
                </div>
            </div>
        </div>
    );
}
