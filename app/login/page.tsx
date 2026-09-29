import type { Metadata } from "next";
import { Suspense } from "react";
import LoginForm from "./_components/LoginForm";

export const metadata: Metadata = {
    title: "Sign In",
    description: "Sign in to your SignalView account to start streaming.",
};

export default function LoginPage() {
    return (
        <Suspense fallback={null}>
            <LoginForm />
        </Suspense>
    );
}
