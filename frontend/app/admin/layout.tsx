"use client";

import { AdminAuthProvider } from "@/hooks/use-admin-auth";
import AdminAuthGuard from "@/components/admin/AdminAuthGuard";
import { UploadQueueProvider } from "./media-library/_components/UploadQueueProvider";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return (
        <AdminAuthProvider>
            <AdminAuthGuard>
                <UploadQueueProvider>{children}</UploadQueueProvider>
            </AdminAuthGuard>
        </AdminAuthProvider>
    );
}
