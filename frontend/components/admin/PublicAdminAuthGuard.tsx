"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AdminAuthProvider, useAdminAuth } from "@/hooks/use-admin-auth";

function RedirectAuthenticatedAdmin({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, isLoading } = useAdminAuth();
    const router = useRouter();

    useEffect(() => {
        if (!isLoading && isAuthenticated) {
            router.replace("/admin");
        }
    }, [isAuthenticated, isLoading, router]);

    if (isLoading || isAuthenticated) return null;

    return <>{children}</>;
}

export default function PublicAdminAuthGuard({ children }: { children: React.ReactNode }) {
    return (
        <AdminAuthProvider>
            <RedirectAuthenticatedAdmin>{children}</RedirectAuthenticatedAdmin>
        </AdminAuthProvider>
    );
}