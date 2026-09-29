"use client";

import { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { userResetPassword } from "@/lib/services/user-auth";
import AuthLayout from "@/app/layout-auth";
import { useTenantName } from "@/hooks/use-tenant-name";

function ResetPasswordForm() {
    const router = useRouter();
    const tenantName = useTenantName();
    const searchParams = useSearchParams();
    const token = searchParams.get("token") ?? "";

    const [password, setPassword] = useState("");
    const [showPass, setShowPass] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);

    useEffect(() => { document.title = `Reset Password | ${tenantName}`; }, [tenantName]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!token) {
            setError("Invalid or missing reset token.");
            return;
        }
        setError(null);
        setLoading(true);
        try {
            await userResetPassword({ token, new_password: password });
            setDone(true);
            setTimeout(() => router.replace("/login"), 2500);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Reset failed");
        } finally {
            setLoading(false);
        }
    }

    if (!token) {
        return (
            <p className="text-sm text-destructive">
                Missing reset token. Please use the link from your email.
            </p>
        );
    }

    if (done) {
        return (
            <p className="text-sm text-center text-muted-foreground py-4">
                Password updated! Redirecting to sign in…
            </p>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
                <Label htmlFor="password">New Password</Label>
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
                        className="pr-10"
                    />
                    <button
                        type="button"
                        onClick={() => setShowPass((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={showPass ? "Hide password" : "Show password"}
                    >
                        {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                </div>
            </div>

            {error && (
                <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                    {error}
                </p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 size={16} className="mr-2 animate-spin" />}
                Reset Password
            </Button>
        </form>
    );
}

export default function ResetPasswordPage() {
    const tenantName = useTenantName();

    return (
        <AuthLayout>
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-display font-800 text-gradient-gold tracking-tight">
                        {tenantName}
                    </h1>
                </div>

                <div className="bg-card border border-border/50 rounded-xl p-8 shadow-lg">
                    <h2 className="text-xl font-semibold mb-6">Reset Password</h2>

                    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
                        <ResetPasswordForm />
                    </Suspense>

                    <p className="text-center text-sm text-muted-foreground mt-6">
                        <Link href="/login" className="text-primary hover:underline">
                            Back to Sign In
                        </Link>
                    </p>
                </div>
            </div>
        </AuthLayout>
    );
}
