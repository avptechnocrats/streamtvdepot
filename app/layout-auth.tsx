/**
 * AuthLayout — used directly by auth pages (login, signup, etc.).
 * Renders as a fixed full-screen overlay so the root AppShell Navbar/Footer
 * are visually covered without needing a separate Next.js layout.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="fixed inset-0 z-[100] bg-background flex items-center justify-center p-4 overflow-auto">
            {children}
        </div>
    );
}
