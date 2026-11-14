import { create } from "zustand";
import { UserProfile } from "@/types/models";
import { clearTokens, getAccessToken, getRefreshToken, saveTokens } from "@/services/sessionStorage";
import { fetchMe, refreshSession } from "@/services/authService";

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: UserProfile | null;
  isHydrating: boolean;
  setSession: (token: string, user: UserProfile, refreshToken?: string | null) => Promise<void>;
  hydrateSession: () => Promise<void>;
  setTokenOnly: (token: string, refreshToken?: string | null) => Promise<void>;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  refreshToken: null,
  user: null,
  isHydrating: true,
  setSession: async (token, user, refreshToken = null) => {
    await saveTokens(token, refreshToken);
    set({ token, refreshToken, user });
  },
  setTokenOnly: async (token, refreshToken = null) => {
    await saveTokens(token, refreshToken);
    set({ token, refreshToken });
  },
  hydrateSession: async () => {
    try {
      const persistedAccess = await getAccessToken();
      const persistedRefresh = await getRefreshToken();

      if (!persistedAccess) {
        set({ isHydrating: false });
        return;
      }

      set({ token: persistedAccess, refreshToken: persistedRefresh });

      try {
        const user = await fetchMe();
        set({ user, isHydrating: false });
        return;
      } catch {
        if (!persistedRefresh) {
          await clearTokens();
          set({ token: null, refreshToken: null, user: null, isHydrating: false });
          return;
        }

        const refreshed = await refreshSession(persistedRefresh);
        const nextAccess = refreshed.access_token;
        const nextRefresh = refreshed.refresh_token ?? persistedRefresh;
        await saveTokens(nextAccess, nextRefresh);
        set({ token: nextAccess, refreshToken: nextRefresh });
        const user = await fetchMe();
        set({ user, isHydrating: false });
      }
    } catch {
      await clearTokens();
      set({ token: null, refreshToken: null, user: null, isHydrating: false });
    }
  },
  clearSession: () => {
    clearTokens().catch(() => undefined);
    set({ token: null, refreshToken: null, user: null, isHydrating: false });
  },
}));
