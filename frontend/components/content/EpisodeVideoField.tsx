"use client";

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, Loader2, AlertTriangle } from "lucide-react";
import { S3VideoField } from "@/app/admin/content/videos/_components/VideoForm";
import { getEpisodeStreamPreview, retryEpisodeTranscode, type EpisodeOut } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api/error-utils";
import { getVideoAssetRendition, retryMediaAssetTranscode } from "@/lib/api/services/upload";

export function assetRenditionQueryOptions(source: string) {
    return queryOptions({
        queryKey: ["media-asset-rendition", source],
        queryFn: () => getVideoAssetRendition(source),
        enabled: !!source,
        staleTime: 5000,
        retry: 1,
        refetchInterval: query => query.state.data?.transcode_status === "pending" || query.state.data?.transcode_status === "processing" ? 5000 : false,
    });
}

export function episodeSourceMatches(episode: EpisodeOut | undefined, source: string): boolean {
    if (!episode?.video_url || !source) return false;
    try { return decodeURIComponent(new URL(episode.video_url).pathname) === decodeURIComponent(new URL(source).pathname); }
    catch { return false; }
}

export default function EpisodeVideoField({ episode, seriesId, value, onChange, onUploadStateChange, onDurationDetected }: {
    episode?: EpisodeOut;
    seriesId?: string;
    value: string;
    onChange: (value: string) => void;
    onUploadStateChange: (uploading: boolean) => void;
    onDurationDetected: (duration: number) => void;
}) {
    const queryClient = useQueryClient();
    const matches = episodeSourceMatches(episode, value) && !!episode?.media_asset_rendition_id;
    const asset = useQuery({ ...assetRenditionQueryOptions(value), enabled: !!value && !matches });
    const media = matches ? episode : asset.data;
    const status = media?.transcode_status ?? null;
    const ready = !!media?.stream_ready;
    const preview = useQuery({
        queryKey: ["episode-stream-preview", seriesId, episode?.id, episode?.media_asset_rendition_id],
        queryFn: () => getEpisodeStreamPreview(seriesId!, episode!.id),
        enabled: !!seriesId && matches && ready,
        staleTime: 300_000,
        retry: 1,
    });
    const retry = useMutation({
        mutationFn: async () => {
            if (matches && seriesId) await retryEpisodeTranscode(seriesId, episode!.id);
            else await retryMediaAssetTranscode(asset.data!.asset_id);
        },
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["series-episodes", seriesId] }),
                queryClient.invalidateQueries({ queryKey: ["media-asset-rendition", value] }),
            ]);
        },
    });
    const label = ready ? "Transcoded" : status === "processing" ? `Transcoding ${media?.transcode_progress ?? 0}%` : status === "pending" ? "Queued" : status === "failed" ? "Failed" : asset.isFetching ? "Checking media" : asset.isError ? "Status unavailable" : "Not transcoded";
    const canRetry = (matches && !!seriesId) || !!asset.data?.asset_id;

    return <div className="space-y-2">
        <S3VideoField label="Episode Video" hint="Adaptive HLS streaming" accept="video/*" value={value}
            onChange={onChange} onUploadStateChange={onUploadStateChange} onDurationDetected={onDurationDetected}
            streamPreviewUrl={ready ? matches ? preview.data?.stream_url : asset.data?.stream_url ?? undefined : undefined}
            transcodeStatus={status} transcodeProgress={media?.transcode_progress}
            onRetryTranscode={canRetry && !retry.isPending ? async () => {
                if (ready) { if (matches) await preview.refetch(); else await asset.refetch(); }
                else { await retry.mutateAsync().catch(() => undefined); }
            } : undefined}
        />
        {value && <div role="status" className={`flex items-center gap-1.5 text-xs ${ready ? "text-emerald-500" : status === "failed" ? "text-red-500" : "text-muted-foreground"}`}>
            {ready ? <CheckCircle2 size={13} /> : status === "processing" || retry.isPending ? <Loader2 size={13} className="animate-spin" /> : status === "failed" ? <AlertTriangle size={13} /> : <Clock size={13} />}{label}
        </div>}
        {media?.transcode_error && <p role="alert" className="break-words text-xs text-red-500">{media.transcode_error}</p>}
        {(retry.isError || preview.isError || (!matches && asset.isError)) && <p role="alert" className="text-xs text-red-500">{getApiErrorMessage(retry.error || preview.error || asset.error, "Episode processing could not be updated")}</p>}
    </div>;
}