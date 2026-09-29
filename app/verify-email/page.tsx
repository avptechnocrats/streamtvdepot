"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { userVerifyEmail } from "@/lib/services/user-auth";
import AuthLayout from "@/app/layout-auth";
import { useTenantName } from "@/hooks/use-tenant-name";

function VerifyEmailInner() {
    const tenantName = useTenantName();
    const [email, setEmail] = useState("");
    const [otp, setOtp] = useState("");
    const [loading, setLoading] = useState(false);
    const [verified, setVerified] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    useEffect(() => {
        document.title = `Verify Email | ${tenantName}`;
    }, [tenantName]);

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        setMessage(null);
        setLoading(true);
        try {
            const response = await userVerifyEmail(email, otp);
            setVerified(response.verified);
            setMessage(response.message);
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Invalid OTP. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="space-y-4 py-2 text-center">
            {verified ? (
                <>
                <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
                <p className="text-sm text-muted-foreground">{message}</p>
                <Button asChild className="w-full">
                    <Link href="/login">Go to sign in</Link>
                </Button>
                </>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-4 text-left">
                    <div className="space-y-2 text-center">
                        <MailCheck className="mx-auto h-10 w-10 text-primary" />
                        <p className="text-sm text-muted-foreground">Enter the six-digit code from your email.</p>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="email">Email address</Label>
                        <Input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
                    </div>
                    <InputOTP maxLength={6} value={otp} onChange={setOtp} disabled={loading}>
                        <InputOTPGroup className="mx-auto">
                            {Array.from({ length: 6 }, (_, index) => <InputOTPSlot key={index} index={index} />)}
                        </InputOTPGroup>
                    </InputOTP>
                    {message && <p className="text-center text-sm text-destructive">{message}</p>}
                    <Button type="submit" className="w-full" disabled={loading || otp.length !== 6}>
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify email"}
                    </Button>
                </form>
            )}
        </div>
    );
}

export default function VerifyEmailPage() {
    return (
        <AuthLayout>
            <VerifyEmailInner />
        </AuthLayout>
    );
}
