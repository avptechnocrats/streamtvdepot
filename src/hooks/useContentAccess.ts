import { useQuery } from "@tanstack/react-query";
import { checkContentAccess } from "@/services/historyService";
import { useAuthStore } from "@/store/authStore";

export function useContentAccess(contentId: string | null | undefined) {
  const token = useAuthStore((s) => s.token);

  return useQuery({
    queryKey: ["content-access", contentId],
    queryFn: () => checkContentAccess(contentId as string),
    enabled: Boolean(token && contentId),
  });
}
