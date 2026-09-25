"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, AlertTriangle } from "lucide-react";
import { getVideo, type VideoOut } from "@/lib/api";
import { VideoForm, videoToFormValues } from "../../_components/VideoForm";
import { VideoFormSkeleton } from "../../_components/Skeletons";

interface EditVideoPageProps {
    params: Promise<{ id: string }>;
}

export default function EditVideoPage({ params }: EditVideoPageProps) {
    const [video, setVideo] = useState<VideoOut | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [videoId, setVideoId] = useState<string>("");

    useEffect(() => {
        params.then(({ id }) => {
            setVideoId(id);
            getVideo(id)
                .then(setVideo)
                .catch((err: unknown) =>
                    setError(err instanceof Error ? err.message : "Failed to load video"),
                )
                .finally(() => setLoading(false));
        });
    }, [params]);

    return (
        <div className="p-6 space-y-6">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2">
                <Link
                    href="/admin/content/videos"
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ChevronLeft size={15} />
                    Videos
                </Link>
                <span className="text-muted-foreground/40 text-sm">/</span>
                <span className="text-sm text-foreground font-medium">
                    {video ? video.title : "Edit Video"}
                </span>
            </div>

            <div>
                <h1 className="text-xl font-bold text-foreground">Edit Video</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Update video details, metadata and settings
                </p>
            </div>

            {loading && <VideoFormSkeleton />}

            {error && (
                <div className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm text-red-300 border border-red-500/20 bg-red-500/8">
                    <AlertTriangle size={14} /> {error}
                </div>
            )}

            {!loading && !error && video && (
                <VideoForm
                    mode="edit"
                    videoId={videoId}
                    defaultValues={videoToFormValues(video)}
                    previewVideo={video}
                />
            )}
        </div>
    );
}
