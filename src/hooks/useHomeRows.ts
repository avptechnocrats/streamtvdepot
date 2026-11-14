import { useQuery } from "@tanstack/react-query";
import { fetchHomeRows } from "@/services/homeService";

interface UseHomeRowsOptions {
  contentType?: string;
  enabled?: boolean;
}

export function useHomeRows(options: UseHomeRowsOptions = {}) {
  const { contentType = "video", enabled = true } = options;

  return useQuery({
    queryKey: ["home-rows", contentType],
    queryFn: () => fetchHomeRows({ contentType }),
    enabled,
    staleTime: 2 * 60 * 1000,
  });
}
