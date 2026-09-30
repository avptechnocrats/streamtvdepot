import PublicAdminAuthGuard from "@/components/admin/PublicAdminAuthGuard";

export default function LoginLayout({ children }: { children: React.ReactNode }) {
    return (
        <PublicAdminAuthGuard>{children}</PublicAdminAuthGuard>
    );
}
