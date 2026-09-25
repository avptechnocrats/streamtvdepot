"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import LoginLogo from "@/components/LoginLogo";

export default function AdminLoginPage() {
    const { login } = useAdminAuth();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);
        const result = await login(email, password);
        setLoading(false);
        if (!result.ok) {
            setError(result.error ?? "Login failed.");
        }
        // Navigation is handled by AdminAuthGuard once isAuthenticated is true.
    };

    return (
        <div
            className="min-h-screen flex items-center justify-center px-4 py-16"
            data-theme="blue"
            style={{
                background: "radial-gradient(ellipse at 20% 50%, hsl(215 100% 50% / 0.07) 0%, transparent 55%), radial-gradient(ellipse at 80% 20%, hsl(220 60% 25% / 0.15) 0%, transparent 50%), #08090f",
            }}
        >
            {/* Subtle grid texture */}
            <div
                className="pointer-events-none fixed inset-0 opacity-[0.03]"
                style={{
                    backgroundImage: "linear-gradient(hsl(215 100% 50%) 1px, transparent 1px), linear-gradient(90deg, hsl(215 100% 50%) 1px, transparent 1px)",
                    backgroundSize: "60px 60px",
                }}
            />

            <div className="relative w-full max-w-md">

                {/* Card */}
                <div
                    className="relative rounded-2xl border border-white/8 px-8 py-10 sm:px-10 sm:py-12 shadow-2xl"
                    style={{ background: "rgba(255,255,255,0.03)", backdropFilter: "blur(24px)" }}
                >
                    {/* Top accent line */}
                    <div className="absolute top-0 left-8 right-8 h-[1px] rounded-full" style={{ background: "linear-gradient(90deg, transparent, hsl(215 100% 50% / 0.6), transparent)" }} />

                    {/* Logo */}
                    <div className="mb-10 flex justify-center">
                        <LoginLogo href="/" />
                    </div>

                    {/* Heading */}
                    <div className="mb-8 mt-5">
                        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">Admin Portal</p>
                        {/* <span className="text-[10px] font-bold tracking-[0.3em] uppercase mb-2 block" style={{ color: "hsl(215 100% 50% / 0.7)" }}>
                            Admin Portal
                        </span> */}
                        <h1 className="text-2xl font-bold text-white">Sign in to your account</h1>
                        <p className="text-sm text-white/35 mt-1">Manage your streaming platform</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">

                        {/* Email */}
                        <div className="space-y-1.5">
                            <label htmlFor="email" className="block text-xs font-semibold text-white/45 tracking-wide">
                                Email address
                            </label>
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="admin@example.com"
                                autoComplete="email"
                                required
                                className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 border border-white/8 focus:outline-none focus:border-[hsl(40_90%_55%/0.5)] focus:ring-1 focus:ring-[hsl(40_90%_55%/0.2)] transition-all"
                                style={{ background: "rgba(255,255,255,0.04)" }}
                            />
                        </div>

                        {/* Password */}
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <label htmlFor="password" className="block text-xs font-semibold text-white/45 tracking-wide">
                                    Password
                                </label>
                                <Link href="/forgot-password" className="text-xs text-muted-foreground hover:text-foreground  transition-colors">
                                    Forgot password?
                                </Link>
                            </div>
                            <div className="relative">
                                <input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••••"
                                    autoComplete="current-password"
                                    required
                                    className="w-full rounded-xl px-4 py-3 pr-11 text-sm text-white placeholder:text-white/20 border border-white/8 focus:outline-none focus:border-[hsl(40_90%_55%/0.5)] focus:ring-1 focus:ring-[hsl(40_90%_55%/0.2)] transition-all"
                                    style={{ background: "rgba(255,255,255,0.04)" }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((v) => !v)}
                                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors"
                                    aria-label={showPassword ? "Hide password" : "Show password"}
                                >
                                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                                </button>
                            </div>
                        </div>

                        {/* Error */}
                        {error && (
                            <div className="rounded-lg px-4 py-3 text-xs text-red-300 border border-red-500/20 bg-red-500/8">
                                {error}
                            </div>
                        )}

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                            style={{ background: "hsl(215 100% 50%)" }}
                        >
                            {loading ? (
                                <><Loader2 size={15} className="animate-spin" /> Signing in…</>
                            ) : (
                                "Sign In"
                            )}
                        </button>

                    </form>

                    {/* Bottom divider */}
                    <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between text-muted-foreground">
                        <Link href="/" className="text-xs hover:text-foreground  transition-colors">
                            ← Back to home
                        </Link>
                        <span className="text-[10px]">
                            © {new Date().getFullYear()} StreamTVDepot. All rights reserved.
                        </span>
                    </div>
                    
                </div>

                {/* Below card hint */}
                <p className="text-center text-xs text-white/40 mt-6">
                    Don’t have an account?{" "}
                    <Link href="/signup" className="text-white/45 hover:text-white/75 transition-colors underline underline-offset-2 px-1">
                        Sign Up Now
                    </Link>
                </p>
            </div>
        </div>
    );
}
