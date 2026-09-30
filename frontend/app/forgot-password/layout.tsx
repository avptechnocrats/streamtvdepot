import PublicAdminAuthGuard from "@/components/admin/PublicAdminAuthGuard";

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
    return <PublicAdminAuthGuard>{children}</PublicAdminAuthGuard>;
}