"use client";

import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@/hooks/use-theme";
import { listVideos } from "@/lib/services/videos";
import { videoToMovie } from "@/lib/media";
import ContentRowSkeleton from "@/components/ContentRowSkeleton";

export default function NewReleasesRow({ contentClassification }: { contentClassification?: string }) {
    const { activeTheme } = useTheme();
    const { ContentRow } = activeTheme.components;
    const { data = [], isLoading, isError } = useQuery({
        queryKey: ["movies-new-releases", contentClassification],
        queryFn: () => listVideos({ sort_by: "latest", page_size: 10, content_classification: contentClassification }),
        staleTime: 60_000,
        retry: 1,
    });
    const movies = data.filter(video => !contentClassification || video.content_classification === contentClassification).slice(0, 10).map(video => videoToMovie(video, true));
    if (isError || (!isLoading && !movies.length)) return null;

    return <div className="pt-8 pb-2">
        {isLoading ? <ContentRowSkeleton count={10} variant="landscape" /> : <ContentRow title="New Releases" movies={movies} variant="landscape" />}
    </div>;
}