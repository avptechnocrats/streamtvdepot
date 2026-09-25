"use client";

import { AdminAuthProvider } from "@/hooks/use-admin-auth";
import AdminAuthGuard from "@/components/admin/AdminAuthGuard";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return (
        <AdminAuthProvider>
            <AdminAuthGuard>
                {children}
            </AdminAuthGuard>
        </AdminAuthProvider>
    );
}
