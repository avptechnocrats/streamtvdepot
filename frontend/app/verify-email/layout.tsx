import PublicAdminAuthGuard from "@/components/admin/PublicAdminAuthGuard";

export default function VerifyEmailLayout({ children }: { children: React.ReactNode }) {
    return <PublicAdminAuthGuard>{children}</PublicAdminAuthGuard>;
}