"use client";

import { useState, useEffect, useRef } from "react";
import type { AltchaWidgetElement } from "altcha";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, Clapperboard, Eye, EyeOff, Film, Loader2, MailCheck, Tv } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { userResendVerification, userSignup, userVerifyEmail } from "@/lib/services/user-auth";
import { fetchSocialAuthConfig, type SocialAuthConfigOut } from "@/lib/services/site-settings";
import SiteLogo from "@/components/SiteLogo";
import { useTenantName } from "@/hooks/use-tenant-name";

function SignupChallenge({ onChange }: { onChange: (value: string) => void }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [loadError, setLoadError] = useState(false);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let cancelled = false;
        let widget: AltchaWidgetElement | undefined;
        const handleState = (event: Event) => {
            const detail = (event as CustomEvent<{ state: string; payload?: string }>).detail;
            onChange(detail.state === "verified" ? detail.payload ?? "" : "");
        };
        setLoadError(false);
        void import("altcha").then(() => {
            if (cancelled || !containerRef.current) return;
            widget = document.createElement("altcha-widget");
            widget.setAttribute("challenge", "/api/auth/signup-challenge");
            widget.setAttribute("auto", "onload");
            widget.setAttribute("configuration", JSON.stringify({ humanInteractionSignature: false }));
            widget.addEventListener("statechange", handleState);
            containerRef.current.appendChild(widget);
        }).catch(() => {
            if (!cancelled) setLoadError(true);
        });
        return () => {
            cancelled = true;
            widget?.removeEventListener("statechange", handleState);
            widget?.remove();
        };
    }, [onChange, attempt]);

    return <div className="min-w-0 space-y-2">
        <div ref={containerRef} className="min-h-16 w-full [--altcha-max-width:100%] [--altcha-color-base:hsl(var(--card))] [--altcha-color-base-content:hsl(var(--foreground))] [--altcha-color-neutral:hsl(var(--border))] [--altcha-color-neutral-content:hsl(var(--muted-foreground))] [--altcha-color-primary:hsl(var(--primary))]" />
        {loadError && <div role="alert" className="space-y-2 text-sm text-destructive">
            <p>Verification could not load.</p>
            <Button type="button" variant="outline" onClick={() => setAttempt(value => value + 1)}>Retry verification</Button>
        </div>}
    </div>;
}

export default function SignupForm() {
    const router = useRouter();
    const { login } = useAuth();
    const tenantName = useTenantName();

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
    const [altchaPayload, setAltchaPayload] = useState("");
    const [website, setWebsite] = useState("");
    const [challengeVersion, setChallengeVersion] = useState(0);

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
        if (loading) return;
        if (!altchaPayload) {
            setError("Please complete verification before signing up.");
            return;
        }
        setLoading(true);
        try {
            const res = await userSignup({ email, password, full_name: fullName, altcha: altchaPayload, website });
            if (res.verification_required || !res.access_token || !res.refresh_token) {
                setPendingVerification(true);
                setNotice(res.message);
                return;
            }
            login(res.access_token, res.refresh_token);
            router.replace("/");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Sign up failed");
            setAltchaPayload("");
            setChallengeVersion(value => value + 1);
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
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-background">
            <div className="grid min-h-full lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
            {/* ── Left panel — cinematic backdrop ─────────────────────── */}
            <div className="relative hidden min-w-0 overflow-hidden lg:sticky lg:top-0 lg:flex lg:h-[100svh]">
                <img
                    src="/images/hero-banner.jpg"
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover object-[60%_center]"
                    fetchPriority="high"
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.3)_0%,rgba(0,0,0,0.1)_30%,rgba(0,0,0,0.88)_100%)]" />
                <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.3),transparent_65%)]" />
                <div className="relative z-10 flex w-full flex-col justify-between gap-8 p-10 xl:p-14">
                    <SiteLogo imageSize={36} showLabel={false} />
                    <div className="mt-auto max-w-lg space-y-6">
                        <div className="space-y-4">
                        <h2 className="break-words font-display text-3xl font-extrabold leading-tight tracking-normal text-white xl:text-4xl">
                            Join millions of viewers. Watch anywhere, on any device.
                        </h2>
                        <p className="max-w-sm text-xl font-medium leading-relaxed text-white/90">
                            Your next great watch starts here.
                        </p>
                        </div>
                    <div className="flex flex-wrap gap-x-6 gap-y-3 border-t border-white/20 pt-6 text-sm font-semibold text-white">
                        {[{ icon: Film, label: "Movies" }, { icon: Tv, label: "Live TV" }, { icon: Clapperboard, label: "Series" }].map(({ icon: Icon, label }) => (
                            <span key={label} className="inline-flex items-center gap-2">
                                <Icon size={18} strokeWidth={2} className="shrink-0 text-primary" aria-hidden="true" />
                                {label}
                            </span>
                        ))}
                    </div>
                    </div>
                </div>
            </div>

            {/* ── Right panel — form ───────────────────────────────────── */}
            <div
                className="flex min-h-[100svh] min-w-0 flex-col bg-background px-6 py-6 sm:px-10 lg:px-12 xl:px-16"
                style={{ backgroundImage: "linear-gradient(145deg, hsl(var(--primary) / 0.16) 0%, transparent 45%), linear-gradient(325deg, hsl(var(--accent) / 0.1) 0%, transparent 55%)" }}
            >
                <div className="mx-auto flex w-full max-w-[420px] items-center justify-between gap-4 text-sm">
                    <Link href="/" className="inline-flex min-h-10 items-center gap-2 font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                        <ArrowLeft size={16} aria-hidden="true" /> Browse
                    </Link>
                    <Link href="/login" className="inline-flex min-h-10 items-center font-semibold text-foreground transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">Sign in</Link>
                </div>
                <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-8 sm:py-10">
                    {/* Mobile logo */}
                    <div className="mb-8 flex lg:hidden">
                        <SiteLogo imageSize={32} showLabel={false} />
                    </div>

                    {pendingVerification ? (
                        <div className="space-y-6 text-center">
                            <MailCheck className="mx-auto h-12 w-12 text-primary" />
                            <div className="space-y-2">
                                <h1 className="text-3xl font-bold tracking-normal text-foreground">Check your inbox</h1>
                                <p className="break-words text-sm leading-relaxed text-muted-foreground">{notice}</p>
                            </div>

                            <InputOTP maxLength={6} value={otp} onChange={setOtp} disabled={verifying}>
                                <InputOTPGroup className="mx-auto">
                                    {Array.from({ length: 6 }, (_, index) => <InputOTPSlot key={index} index={index} />)}
                                </InputOTPGroup>
                            </InputOTP>

                            {error && (
                                <div role="alert" className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2.5 text-left">
                                    <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                                    <span>{error}</span>
                                </div>
                            )}

                            <Button
                                type="button"
                                className="w-full h-12 text-base font-semibold"
                                disabled={verifying || otp.length !== 6}
                                onClick={handleVerify}
                            >
                                {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify email"}
                            </Button>

                            <Button
                                type="button"
                                variant="outline"
                                className="w-full h-12 text-base font-semibold"
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
                    <form onSubmit={handleSubmit} className="relative space-y-5">
                        <div aria-hidden="true" className="absolute -left-[10000px] top-0 h-px w-px overflow-hidden">
                            <label htmlFor="signup-website">Website</label>
                            <input id="signup-website" name="website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={event => setWebsite(event.target.value)} />
                        </div>
                        <div className="mb-7 space-y-2">
                            <h1 className="text-3xl font-bold leading-tight tracking-normal text-foreground">Create your account</h1>
                            <p className="text-sm leading-relaxed text-muted-foreground">Join {tenantName} and find your next favourite.</p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="full_name" className="text-sm font-medium">Full name</Label>
                            <Input
                                id="full_name"
                                type="text"
                                placeholder="Jane Doe"
                                autoComplete="name"
                                required
                                disabled={loading}
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                className="h-12 rounded-md border-border bg-card/60 px-3.5 text-base placeholder:text-muted-foreground/65 focus-visible:border-primary"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="email" className="text-sm font-medium">Email address</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="you@example.com"
                                autoComplete="email"
                                required
                                disabled={loading}
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="h-12 rounded-md border-border bg-card/60 px-3.5 text-base placeholder:text-muted-foreground/65 focus-visible:border-primary"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                            <div className="relative">
                                <Input
                                    id="password"
                                    type={showPass ? "text" : "password"}
                                    placeholder="At least 8 characters"
                                    autoComplete="new-password"
                                    required
                                    minLength={8}
                                    disabled={loading}
                                    aria-describedby="signup-password-help"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="h-12 rounded-md border-border bg-card/60 pl-3.5 pr-12 text-base placeholder:text-muted-foreground/65 focus-visible:border-primary"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPass((v) => !v)}
                                    className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                                    aria-label={showPass ? "Hide password" : "Show password"}
                                    aria-pressed={showPass}
                                >
                                    {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                            <p id="signup-password-help" className="text-xs leading-relaxed text-muted-foreground">At least 8 characters.</p>
                        </div>

                        <SignupChallenge key={challengeVersion} onChange={setAltchaPayload} />

                        {error && (
                            <div role="alert" className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2.5">
                                <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                                <span>{error}</span>
                            </div>
                        )}

                        <Button
                            type="submit"
                            className="w-full h-12 text-base font-semibold"
                            disabled={loading || !altchaPayload}
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
                                    className="w-full h-12 text-sm font-semibold"
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
                        <Link href="/login" className="text-primary hover:text-primary/80 font-semibold transition-colors">
                            Sign in
                        </Link>
                    </p>
                    )}

                    {!pendingVerification && (
                    <p className="mt-5 text-center text-xs leading-relaxed text-muted-foreground">
                        By creating an account you agree to our{" "}
                        <span className="text-muted-foreground underline cursor-pointer">Terms of Service</span>
                        {" "}and{" "}
                        <span className="text-muted-foreground underline cursor-pointer">Privacy Policy</span>.
                    </p>
                    )}
                </div>
            </div>
            </div>
        </div>
    );
}
