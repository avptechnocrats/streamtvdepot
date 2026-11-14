import { useQuery } from "@tanstack/react-query";
import { fetchSiteBranding } from "@/services/settingsService";

export function useSiteBranding() {
  return useQuery({
    queryKey: ["site-branding"],
    queryFn: fetchSiteBranding,
  });
}
