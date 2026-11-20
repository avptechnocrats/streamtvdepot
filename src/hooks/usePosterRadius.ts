import { useQuery } from "@tanstack/react-query";
import { fetchThemeSettings } from "@/services/settingsService";

export function usePosterRadius() {
  const { data } = useQuery({
    queryKey: ["theme-settings"],
    queryFn: fetchThemeSettings,
    staleTime: 5 * 60 * 1000,
  });

  if (data?.radius === "sharp") return 2 + 3;
  if (data?.radius === "rounded") {
    const radius = typeof data.radius_size === "number" && Number.isFinite(data.radius_size)
      ? Math.min(64, Math.max(0, data.radius_size)) : 16;
    return radius + 3;
  }
  return 8 + 3;
}