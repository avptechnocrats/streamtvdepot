"use client";

import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@/hooks/use-theme";
import { listVideos } from "@/lib/services/videos";
import { videoToMovie } from "@/lib/media";
import ContentRowSkeleton from "@/components/ContentRowSkeleton";

export default function FeaturedRow({ contentClassification }: { contentClassification?: string }) {
    const { activeTheme } = useTheme();
    const { ContentRow } = activeTheme.components;
    const { data = [], isLoading, isError } = useQuery({
        queryKey: ["movies-featured", contentClassification],
        queryFn: () => listVideos({ is_featured: true, page_size: 10, content_classification: contentClassification }),
        staleTime: 60_000,
        retry: 1,
    });
    const movies = data.filter(video => video.is_featured && video.is_active && (!contentClassification || video.content_classification === contentClassification)).slice(0, 10)
        .map(video => videoToMovie(video));
    if (isError || (!isLoading && !movies.length)) return null;

    return <div className="pt-8 pb-2">
        {isLoading ? <ContentRowSkeleton count={10} /> : <ContentRow title="Featured" movies={movies} variant="featured" />}
    </div>;
}