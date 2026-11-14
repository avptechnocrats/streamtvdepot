import { useMutation } from "@tanstack/react-query";
import { fetchMe, login, LoginPayload, signup } from "@/services/authService";
import { useAuthStore } from "@/store/authStore";

export function useAuth() {
  const setSession = useAuthStore((s) => s.setSession);
  const setTokenOnly = useAuthStore((s) => s.setTokenOnly);

  const loginMutation = useMutation({
    mutationFn: (payload: LoginPayload) => login(payload),
    onSuccess: async (payload) => {
      await setTokenOnly(payload.access_token, payload.refresh_token ?? null);
      const user = payload.user ?? (await fetchMe());
      await setSession(payload.access_token, user, payload.refresh_token ?? null);
    },
  });

  const signupMutation = useMutation({
    mutationFn: ({ fullName, email, password }: { fullName: string; email: string; password: string }) =>
      signup(fullName, email, password),
    onSuccess: async (payload) => {
      await setTokenOnly(payload.access_token, payload.refresh_token ?? null);
      const user = payload.user ?? (await fetchMe());
      await setSession(payload.access_token, user, payload.refresh_token ?? null);
    },
  });

  return {
    loginMutation,
    signupMutation,
  };
}
