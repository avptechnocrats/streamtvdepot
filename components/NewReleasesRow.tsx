"use client";

import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@/hooks/use-theme";
import { listVideos } from "@/lib/services/videos";
import { videoToMovie } from "@/lib/media";
import ContentRowSkeleton from "@/components/ContentRowSkeleton";

export default function NewReleasesRow() {
    const { activeTheme } = useTheme();
    const { ContentRow } = activeTheme.components;
    const { data = [], isLoading, isError } = useQuery({
        queryKey: ["movies-new-releases"],
        queryFn: () => listVideos({ sort_by: "latest", page_size: 10 }),
        staleTime: 60_000,
        retry: 1,
    });
    const movies = data.slice(0, 10).map(video => videoToMovie(video, true));
    if (isError || (!isLoading && !movies.length)) return null;

    return <div className="pt-8 pb-2">
        {isLoading ? <ContentRowSkeleton count={10} variant="landscape" /> : <ContentRow title="New Releases" movies={movies} variant="landscape" />}
    </div>;
}