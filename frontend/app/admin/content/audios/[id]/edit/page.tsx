"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, AlertTriangle } from "lucide-react";
import { getAudio, type AudioOut } from "@/lib/api";
import { AudioForm, audioToFormValues } from "../../_components/AudioForm";

interface EditAudioPageProps {
    params: Promise<{ id: string }>;
}

export default function EditAudioPage({ params }: EditAudioPageProps) {
    const [audio, setAudio] = useState<AudioOut | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [audioId, setAudioId] = useState<string>("");

    useEffect(() => {
        params.then(({ id }) => {
            setAudioId(id);
            getAudio(id)
                .then(setAudio)
                .catch((err: unknown) =>
                    setError(err instanceof Error ? err.message : "Failed to load audio"),
                )
                .finally(() => setLoading(false));
        });
    }, [params]);

    return (
        <div className="p-6 space-y-6">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2">
                <Link
                    href="/admin/content/audios"
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ChevronLeft size={15} />
                    Audios
                </Link>
                <span className="text-muted-foreground/40 text-sm">/</span>
                <span className="text-sm text-foreground font-medium">
                    {audio ? audio.title : "Edit Audio"}
                </span>
            </div>

            <div>
                <h1 className="text-xl font-bold text-foreground">Edit Audio</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Update audio details, metadata and access settings
                </p>
            </div>

            {loading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    Loading audio…
                </div>
            )}

            {error && (
                <div className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm text-red-300 border border-red-500/20 bg-red-500/8">
                    <AlertTriangle size={14} /> {error}
                </div>
            )}

            {!loading && !error && audio && (
                <AudioForm
                    mode="edit"
                    audioId={audioId}
                    defaultValues={audioToFormValues(audio)}
                />
            )}
        </div>
    );
}
