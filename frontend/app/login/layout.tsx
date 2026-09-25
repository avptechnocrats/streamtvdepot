"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AdminAuthProvider, useAdminAuth } from "@/hooks/use-admin-auth";

function LoginGuard({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, isLoading } = useAdminAuth();
    const router = useRouter();

    useEffect(() => {
        if (!isLoading && isAuthenticated) {
            router.replace("/admin");
        }
    }, [isAuthenticated, isLoading, router]);

    return <>{children}</>;
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
    return (
        <AdminAuthProvider>
            <LoginGuard>{children}</LoginGuard>
        </AdminAuthProvider>
    );
}
