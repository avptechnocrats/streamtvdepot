"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Loader2, CheckCircle2 } from "lucide-react";
import AdminLogo from "@/components/AdminLogo";
import { saasRegister } from "@/lib/api";

const perks = [
    "No credit card required",
    "Custom domain included",
    "12+ native app platforms",
    "Cancel any time",
];

export default function SignupPage() {
    const [form, setForm] = useState({
        name: "",
        company: "",
        email: "",
        password: "",
    });
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);
    const [verificationMailSent, setVerificationMailSent] = useState(false);

    const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((f) => ({ ...f, [field]: e.target.value }));

    const slugify = (value: string): string => value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 100);

    const parseError = (err: unknown): string => {
        if (!err || typeof err !== "object") return "Signup failed. Please try again.";
        const maybeResponse = (err as { response?: { data?: { detail?: unknown; message?: unknown } } }).response;
        const detail = maybeResponse?.data?.detail;
        if (typeof detail === "string") return detail;
        const message = maybeResponse?.data?.message;
        if (typeof message === "string") return message;
        return "Signup failed. Please try again.";
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setSuccess(false);
        setLoading(true);

        const generatedSlug = slugify(form.company || form.name);
        if (generatedSlug.length < 3) {
            setError("Company or brand name must contain at least 3 letters or numbers.");
            setLoading(false);
            return;
        }

        try {
            const response = await saasRegister({
                platform_name: form.company.trim(),
                platform_slug: generatedSlug,
                email: form.email.trim(),
                full_name: form.name.trim(),
                password: form.password,
                timezone: "UTC",
            });
            setVerificationMailSent(Boolean(response.verification_email_sent));
            setSuccess(true);
        } catch (err) {
            setError(parseError(err));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            className="min-h-screen flex"
            style={{ background: "#08090f" }}
        >
            {/* ── Left panel — branding ────────────────────────────────── */}
            <div
                className="hidden lg:flex flex-col justify-between w-[420px] xl:w-[480px] shrink-0 px-12 py-14 relative overflow-hidden"
                style={{
                    background: "radial-gradient(ellipse at 30% 60%, hsl(217 100% 51% / 0.12) 0%, transparent 65%), #0d0f1a",
                }}
            >
                {/* Grid texture */}
                <div
                    className="pointer-events-none absolute inset-0 opacity-[0.035]"
                    style={{
                        backgroundImage: "linear-gradient(hsl(217 100% 51%) 1px, transparent 1px), linear-gradient(90deg, hsl(217 100% 51%) 1px, transparent 1px)",
                        backgroundSize: "48px 48px",
                    }}
                />

                {/* Logo */}
                <AdminLogo href="/" className="flex items-center gap-2 w-fit group relative z-10 text-xl" />

                {/* Main copy */}
                <div className="relative z-10 space-y-6">
                    <div>
                        <p className="text-[10px] font-bold tracking-[0.3em] uppercase mb-3" style={{ color: "hsl(217 100% 51% / 0.65)" }}>
                            White-Label OTT Platform
                        </p>
                        <h2 className="text-4xl font-extrabold text-white leading-tight">
                            Launch your own<br />
                            <span style={{ color: "hsl(217 100% 51%)" }}>streaming service</span><br />
                            today.
                        </h2>
                        <p className="text-sm text-white/35 mt-4 leading-relaxed">
                            Join thousands of creators and businesses using StreamTVDepot to build,
                            brand, and grow their streaming platform.
                        </p>
                    </div>

                    <ul className="space-y-3">
                        {perks.map((perk) => (
                            <li key={perk} className="flex items-center gap-3 text-sm text-white/50">
                                <CheckCircle2 size={14} style={{ color: "hsl(217 100% 51%)", flexShrink: 0 }} />
                                {perk}
                            </li>
                        ))}
                    </ul>
                </div>

                <p className="text-[11px] text-white/15 relative z-10">
                    © {new Date().getFullYear()} StreamTVDepot. All rights reserved.
                </p>
            </div>

            {/* ── Right panel — form ───────────────────────────────────── */}
            <div className="flex-1 flex items-center justify-center px-6 py-16 relative">
                {/* Subtle glow */}
                <div
                    className="pointer-events-none absolute top-0 right-0 w-96 h-96 rounded-full opacity-5 blur-3xl"
                    style={{ background: "hsl(217 100% 51%)" }}
                />

                <div className="w-full max-w-md relative">

                    {/* Mobile logo */}
                    <AdminLogo href="/" className="flex lg:hidden items-center gap-3 mb-10 w-fit group" />

                    {/* Card */}
                    <div
                        className="rounded-2xl border border-white/8 px-8 py-10 sm:px-10 sm:py-11 shadow-2xl relative"
                        style={{ background: "rgba(255,255,255,0.025)", backdropFilter: "blur(24px)" }}
                    >
                        {/* Top accent */}
                        <div className="absolute top-0 left-8 right-8 h-[1px] rounded-full" style={{ background: "linear-gradient(90deg, transparent, hsl(217 100% 51% / 0.5), transparent)" }} />

                        {success ? (
                            <div className="text-center py-6 space-y-5">
                                <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center" style={{ background: "hsl(217 100% 51% / 0.12)" }}>
                                    <CheckCircle2 size={28} style={{ color: "hsl(217 100% 51%)" }} />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-white">Account created</h2>
                                    {verificationMailSent ? (
                                        <p className="text-sm text-white/40 mt-2">
                                            We sent a verification mail to <span className="text-white/65">{form.email}</span>.
                                            Please check your inbox and click the verification link to activate login.
                                        </p>
                                    ) : (
                                        <p className="text-sm text-white/40 mt-2">
                                            Your account is ready, but verification mail could not be sent right now.
                                            Please contact support or try again later.
                                        </p>
                                    )}
                                </div>
                                <Link href="/" className="inline-block text-sm text-white/40 hover:text-white/70 transition-colors underline underline-offset-2">
                                    Back to home
                                </Link>
                            </div>
                        ) : (
                            <>
                                <div className="mb-7">
                                    <h1 className="text-2xl font-bold text-white">Create your account</h1>
                                    <p className="text-sm text-white/35 mt-1">Start your free trial, no credit card needed</p>
                                </div>

                                <form onSubmit={handleSubmit} className="space-y-4">

                                    {/* Name + Company row */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <InputField
                                            id="name"
                                            label="Your name"
                                            type="text"
                                            value={form.name}
                                            onChange={set("name")}
                                            placeholder="Jane Smith"
                                            autoComplete="name"
                                        />
                                        <InputField
                                            id="company"
                                            label="Company / Brand"
                                            type="text"
                                            value={form.company}
                                            onChange={set("company")}
                                            placeholder="Acme TV"
                                            autoComplete="organization"
                                        />
                                    </div>

                                    {/* Email */}
                                    <InputField
                                        id="email"
                                        label="Work email"
                                        type="email"
                                        value={form.email}
                                        onChange={set("email")}
                                        placeholder="you@company.com"
                                        autoComplete="email"
                                    />

                                    {/* Password */}
                                    <div className="space-y-1.5">
                                        <label htmlFor="password" className="block text-xs font-semibold text-white/45 tracking-wide">
                                            Password
                                        </label>
                                        <div className="relative">
                                            <input
                                                id="password"
                                                type={showPassword ? "text" : "password"}
                                                value={form.password}
                                                onChange={set("password")}
                                                placeholder="Min. 8 characters"
                                                autoComplete="new-password"
                                                minLength={8}
                                                required
                                                className="w-full rounded-xl px-4 py-3 pr-11 text-sm text-white placeholder:text-white/20 border border-white/8 focus:outline-none focus:border-[hsl(217_100%_51%/0.5)] focus:ring-1 focus:ring-[hsl(217_100%_51%/0.2)] transition-all"
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
                                        className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed mt-1"
                                        style={{ background: "hsl(217 100% 51%)", color: "#ffffff" }}
                                    >
                                        {loading ? (
                                            <><Loader2 size={15} className="animate-spin" /> Creating account…</>
                                        ) : (
                                            "Create free account"
                                        )}
                                    </button>

                                    <p className="text-[11px] text-white/40 text-center pt-1">
                                        By signing up you agree to our{" "}
                                        <a href="https://streamtvdepot.com/terms" className="underline underline-offset-2 hover:text-white/45 transition-colors">Terms</a>
                                        {" "}and{" "}
                                        <a href="https://streamtvdepot.com/privacy" className="underline underline-offset-2 hover:text-white/45 transition-colors">Privacy Policy</a>.
                                    </p>

                                </form>
                            </>
                        )}
                    </div>

                    {/* Below-card link */}
                    {!success && (
                        <p className="text-center text-xs text-white/25 mt-5">
                            Already have an account?{" "}
                            <Link href="/login" className="text-white/45 hover:text-white/75 transition-colors underline underline-offset-2">
                                Sign in
                            </Link>
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Shared input component ──────────────────────────────────────────────────
function InputField({
    id, label, type, value, onChange, placeholder, autoComplete,
}: {
    id: string;
    label: string;
    type: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder: string;
    autoComplete?: string;
}) {
    return (
        <div className="space-y-1.5">
            <label htmlFor={id} className="block text-xs font-semibold text-white/45 tracking-wide">
                {label}
            </label>
            <input
                id={id}
                type={type}
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                autoComplete={autoComplete}
                required
                className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 border border-white/8 focus:outline-none focus:border-[hsl(217_100%_51%/0.5)] focus:ring-1 focus:ring-[hsl(217_100%_51%/0.2)] transition-all"
                style={{ background: "rgba(255,255,255,0.04)" }}
            />
        </div>
    );
}
