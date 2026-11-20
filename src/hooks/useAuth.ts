import { useMutation } from "@tanstack/react-query";
import { fetchMe, login, LoginPayload, signup, verifyEmail } from "@/services/authService";
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
  });

  const verifyEmailMutation = useMutation({
    mutationFn: ({ email, otp }: { email: string; otp: string }) => verifyEmail(email, otp),
  });

  const establishVerifiedSession = async (
    payload: Awaited<ReturnType<typeof verifyEmail>>,
  ): Promise<void> => {
    if (!payload.access_token || !payload.user) {
      throw new Error("Email verification did not return a mobile session.");
    }
    await setSession(payload.access_token, payload.user, payload.refresh_token ?? null);
  };

  return {
    loginMutation,
    signupMutation,
    verifyEmailMutation,
    establishVerifiedSession,
  };
}
