import PublicAdminAuthGuard from "@/components/admin/PublicAdminAuthGuard";

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
    return <PublicAdminAuthGuard>{children}</PublicAdminAuthGuard>;
}