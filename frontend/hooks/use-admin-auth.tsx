"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from "react";
import {
    ADMIN_SESSION_KEY,
    createSession,
    isSessionValid,
    validateCredentials,
    type AdminRole,
    type AdminSession,
} from "@/lib/admin-auth";
import { clearTokens } from "@/lib/api";

// ─── Context shape ─────────────────────────────────────────────────────────────

interface AdminAuthContextType {
    /** True once session has been checked from localStorage */
    isLoading: boolean;
    isAuthenticated: boolean;
    session: AdminSession | null;
    role: AdminRole | null;
    /** Validates credentials and, on success, creates & persists a session */
    login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
    /** Clears the session from memory and localStorage */
    logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthContextType>({
    isLoading: true,
    isAuthenticated: false,
    session: null,
    role: null,
    login: async () => ({ ok: false }),
    logout: () => { },
});

// ─── Provider ──────────────────────────────────────────────────────────────────

export function AdminAuthProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<AdminSession | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Rehydrate from localStorage on first mount
    useEffect(() => {
        try {
            const raw = localStorage.getItem(ADMIN_SESSION_KEY);
            if (raw) {
                const s: AdminSession = JSON.parse(raw);
                if (isSessionValid(s)) {
                    setSession(s);
                } else {
                    // Expired — clean up
                    localStorage.removeItem(ADMIN_SESSION_KEY);
                }
            }
        } catch {
            /* ignore corrupt storage */
        } finally {
            setIsLoading(false);
        }
    }, []);

    const login = useCallback(async (email: string, password: string) => {
        const result = await validateCredentials(email, password);
        if (result.ok && result.role) {
            const s = createSession(email, result.role, result.fullName);
            setSession(s);
            localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(s));
        }
        return result;
    }, []);

    const logout = useCallback(() => {
        setSession(null);
        localStorage.removeItem(ADMIN_SESSION_KEY);
        localStorage.removeItem("sv_role");
        clearTokens();
    }, []);

    return (
        <AdminAuthContext.Provider
            value={{ isLoading, isAuthenticated: !!session, session, role: session?.role ?? null, login, logout }}
        >
            {children}
        </AdminAuthContext.Provider>
    );
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function useAdminAuth() {
    return useContext(AdminAuthContext);
}
