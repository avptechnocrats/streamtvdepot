import { useMutation, useQuery } from "@tanstack/react-query";
import { fetchPlaybackProgress, syncPlaybackProgress } from "@/services/playbackService";

export function usePlaybackProgress(contentId: string) {
  const progressQuery = useQuery({
    queryKey: ["playback-progress", contentId],
    queryFn: () => fetchPlaybackProgress(contentId),
  });

  const syncMutation = useMutation({
    mutationFn: (payload: { positionSeconds: number; durationSeconds: number }) =>
      syncPlaybackProgress({
        contentId,
        positionSeconds: payload.positionSeconds,
        durationSeconds: payload.durationSeconds,
      }),
  });

  return {
    progressQuery,
    syncMutation,
  };
}
