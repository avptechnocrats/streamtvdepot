"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { setTokens, verifySignupEmail } from "@/lib/api";
import { persistAdminSession } from "@/lib/admin-auth";
import AdminLogo from "@/components/AdminLogo";

export default function VerifyEmailPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [verified, setVerified] = useState(false);
    const [message, setMessage] = useState("Verifying your email...");

    const token = useMemo(() => {
        if (typeof window === "undefined") return "";
        const params = new URLSearchParams(window.location.search);
        return params.get("token") || "";
    }, []);

    useEffect(() => {
        let active = true;

        const run = async () => {
            if (!token) {
                if (!active) return;
                setVerified(false);
                setMessage("Missing verification token.");
                setLoading(false);
                return;
            }

            try {
                const response = await verifySignupEmail(token);
                if (!active) return;
                setVerified(Boolean(response.verified));
                setMessage(response.message || "Email verified successfully.");
                if (response.verified && response.access_token && response.refresh_token && response.email) {
                    setTokens(response.access_token, response.refresh_token);
                    persistAdminSession(response.email, "clientAdmin", response.full_name ?? undefined);
                    router.replace("/setup");
                    return;
                }
            } catch (err) {
                if (!active) return;
                const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
                setVerified(false);
                setMessage(detail || "Verification failed. The link may be invalid or expired.");
            } finally {
                if (active) setLoading(false);
            }
        };

        run();
        return () => {
            active = false;
        };
    }, [router, token]);

    return (
        <div className="min-h-screen flex items-center justify-center px-6 py-16" style={{ background: "#08090f" }}>
            <div className="w-full max-w-md rounded-2xl border border-white/8 px-8 py-10 sm:px-10 sm:py-11 shadow-2xl" style={{ background: "rgba(255,255,255,0.025)", backdropFilter: "blur(24px)" }}>
                <AdminLogo href="/" className="flex items-center gap-3 mb-8 w-fit" />

                {loading ? (
                    <div className="text-center py-6 space-y-4">
                        <Loader2 size={28} className="animate-spin mx-auto text-white/70" />
                        <p className="text-sm text-white/55">Verifying your email...</p>
                    </div>
                ) : (
                    <div className="text-center py-6 space-y-5">
                        <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center" style={{ background: verified ? "hsl(144 80% 40% / 0.15)" : "hsl(0 80% 55% / 0.14)" }}>
                            {verified ? (
                                <CheckCircle2 size={28} style={{ color: "hsl(144 80% 55%)" }} />
                            ) : (
                                <XCircle size={28} style={{ color: "hsl(0 85% 65%)" }} />
                            )}
                        </div>

                        <div>
                            <h1 className="text-xl font-bold text-white">
                                {verified ? "Email verified" : "Verification failed"}
                            </h1>
                            <p className="text-sm text-white/45 mt-2">{message}</p>
                        </div>

                        <Link href="/login" className="inline-block text-sm text-white/60 hover:text-white/85 transition-colors underline underline-offset-2">
                            Go to login
                        </Link>
                    </div>
                )}
            </div>
        </div>
    );
}
