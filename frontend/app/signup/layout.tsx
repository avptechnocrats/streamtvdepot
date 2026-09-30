import PublicAdminAuthGuard from "@/components/admin/PublicAdminAuthGuard";

export default function SignupLayout({ children }: { children: React.ReactNode }) {
    return <PublicAdminAuthGuard>{children}</PublicAdminAuthGuard>;
}