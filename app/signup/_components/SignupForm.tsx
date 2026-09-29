"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { userResendVerification, userSignup, userVerifyEmail } from "@/lib/services/user-auth";
import { fetchSocialAuthConfig, type SocialAuthConfigOut } from "@/lib/services/site-settings";
import SiteLogo from "@/components/SiteLogo";

export default function SignupForm() {
    const router = useRouter();
    const { login } = useAuth();

    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPass, setShowPass] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [pendingVerification, setPendingVerification] = useState(false);
    const [otp, setOtp] = useState("");
    const [verifying, setVerifying] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const [resending, setResending] = useState(false);
    const [socialAuthConfig, setSocialAuthConfig] = useState<SocialAuthConfigOut | null>(null);
    const [loadingAuth, setLoadingAuth] = useState(true);

    useEffect(() => {
        const loadSocialAuthConfig = async () => {
            try {
                const config = await fetchSocialAuthConfig();
                setSocialAuthConfig(config);
            } catch (err) {
                // Silently fail if we can't load social auth config
                console.error("Failed to load social auth config:", err);
                setSocialAuthConfig({
                    google: { enabled: false, client_id: null, redirect_uri: null }
                });
            } finally {
                setLoadingAuth(false);
            }
        };
        loadSocialAuthConfig();
    }, []);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const res = await userSignup({ email, password, full_name: fullName });
            if (res.verification_required || !res.access_token || !res.refresh_token) {
                setPendingVerification(true);
                setNotice(res.message);
                return;
            }
            login(res.access_token, res.refresh_token);
            router.replace("/");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Sign up failed");
        } finally {
            setLoading(false);
        }
    }

    async function handleResend() {
        setResending(true);
        setError(null);
        try {
            const res = await userResendVerification(email);
            setNotice(res.message);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not resend verification email");
        } finally {
            setResending(false);
        }
    }

    async function handleVerify() {
        setError(null);
        setVerifying(true);
        try {
            await userVerifyEmail(email, otp);
            router.replace("/login");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Invalid OTP. Please try again.");
        } finally {
            setVerifying(false);
        }
    }

    const handleGoogleSignIn = () => {
        if (!socialAuthConfig?.google.client_id || !socialAuthConfig?.google.redirect_uri) return;

        const params = new URLSearchParams({
            client_id: socialAuthConfig.google.client_id,
            redirect_uri: socialAuthConfig.google.redirect_uri,
            response_type: "code",
            scope: "openid email profile",
            access_type: "offline",
        });

        window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    };

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
                            Unlimited <span className="text-gradient-gold">streaming</span>,<br />
                            no limits.
                        </h2>
                        <p className="text-muted-foreground text-base max-w-xs">
                            Join millions of viewers. Watch anywhere, on any device.
                        </p>
                        <div className="flex gap-3 flex-wrap">
                            {["No ads on premium", "HD & 4K quality", "Download & watch offline"].map((f) => (
                                <span key={f} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-white/5 border border-white/10 rounded-full px-3 py-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                                    {f}
                                </span>
                            ))}
                        </div>
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

                    {pendingVerification ? (
                        <div className="space-y-5 text-center">
                            <MailCheck className="mx-auto h-12 w-12 text-primary" />
                            <div className="space-y-2">
                                <h2 className="text-xl font-semibold text-foreground">Confirm your email</h2>
                                <p className="text-sm text-muted-foreground">{notice}</p>
                            </div>

                            <InputOTP maxLength={6} value={otp} onChange={setOtp} disabled={verifying}>
                                <InputOTPGroup className="mx-auto">
                                    {Array.from({ length: 6 }, (_, index) => <InputOTPSlot key={index} index={index} />)}
                                </InputOTPGroup>
                            </InputOTP>

                            {error && (
                                <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2.5 text-left">
                                    <span className="mt-0.5 shrink-0">⚠</span>
                                    <span>{error}</span>
                                </div>
                            )}

                            <Button
                                type="button"
                                className="w-full h-11 font-semibold"
                                disabled={verifying || otp.length !== 6}
                                onClick={handleVerify}
                            >
                                {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify email"}
                            </Button>

                            <Button
                                type="button"
                                variant="outline"
                                className="w-full h-11 font-semibold"
                                disabled={resending}
                                onClick={handleResend}
                            >
                                {resending ? (
                                    <span className="flex items-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" /> Sending…
                                    </span>
                                ) : (
                                    "Resend OTP"
                                )}
                            </Button>

                            <Link href="/login" className="block text-sm text-primary hover:text-primary/80">
                                Back to sign in
                            </Link>
                        </div>
                    ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="full_name" className="text-sm font-medium">Full name</Label>
                            <Input
                                id="full_name"
                                type="text"
                                placeholder="Jane Doe"
                                autoComplete="name"
                                required
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                className="h-11 bg-secondary/50 border-border/60 focus:border-primary/60"
                            />
                        </div>

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
                            <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                            <div className="relative">
                                <Input
                                    id="password"
                                    type={showPass ? "text" : "password"}
                                    placeholder="At least 8 characters"
                                    autoComplete="new-password"
                                    required
                                    minLength={8}
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
                            {password.length > 0 && password.length < 8 && (
                                <p className="text-xs text-muted-foreground">Password must be at least 8 characters</p>
                            )}
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
                                ? <><Loader2 size={16} className="mr-2 animate-spin" />Creating account…</>
                                : "Create Account"
                            }
                        </Button>

                        {!loadingAuth && socialAuthConfig?.google.enabled && (
                            <>
                                <div className="relative my-4">
                                    <div className="absolute inset-0 flex items-center">
                                        <div className="w-full border-t border-border/40" />
                                    </div>
                                    <div className="relative flex justify-center text-xs uppercase">
                                        <span className="bg-background px-2 text-muted-foreground/60">Or continue with</span>
                                    </div>
                                </div>

                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full h-11 font-semibold"
                                    onClick={handleGoogleSignIn}
                                >
                                    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                    </svg>
                                    Sign up with Google
                                </Button>
                            </>
                        )}
                    </form>
                    )}

                    {!pendingVerification && (
                    <p className="text-center text-sm text-muted-foreground mt-6">
                        Already have an account?{" "}
                        <Link href="/login" className="text-primary hover:text-primary/80 font-medium transition-colors">
                            Sign in
                        </Link>
                    </p>
                    )}

                    {!pendingVerification && (
                    <p className="text-center text-xs text-muted-foreground/60 mt-4">
                        By creating an account you agree to our{" "}
                        <span className="text-muted-foreground underline cursor-pointer">Terms of Service</span>
                        {" "}and{" "}
                        <span className="text-muted-foreground underline cursor-pointer">Privacy Policy</span>.
                    </p>
                    )}
                </div>
            </div>
        </div>
    );
}
