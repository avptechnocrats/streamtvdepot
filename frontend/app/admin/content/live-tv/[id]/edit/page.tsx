"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, AlertTriangle } from "lucide-react";
import { getLiveTvChannel, type LiveTvChannelOut } from "@/lib/api";
import { LiveTvForm, liveTvChannelToFormValues } from "../../_components/LiveTvForm";

interface EditLiveTvPageProps {
    params: Promise<{ id: string }>;
}

export default function EditLiveTvPage({ params }: EditLiveTvPageProps) {
    const [channel, setChannel] = useState<LiveTvChannelOut | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [channelId, setChannelId] = useState<string>("");

    useEffect(() => {
        params.then(({ id }) => {
            setChannelId(id);
            getLiveTvChannel(id)
                .then(setChannel)
                .catch((err: unknown) =>
                    setError(err instanceof Error ? err.message : "Failed to load channel"),
                )
                .finally(() => setLoading(false));
        });
    }, [params]);

    return (
        <div className="p-6 space-y-6">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2">
                <Link
                    href="/admin/content/live-tv"
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ChevronLeft size={15} />
                    Live TV
                </Link>
                <span className="text-muted-foreground/40 text-sm">/</span>
                <span className="text-sm text-foreground font-medium">
                    {channel ? channel.title : "Edit Channel"}
                </span>
            </div>

            <div>
                <h1 className="text-xl font-bold text-foreground">Edit Channel</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Update channel details, stream settings and access control
                </p>
            </div>

            {loading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    Loading channel...
                </div>
            )}

            {error && (
                <div className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm text-red-300 border border-red-500/20 bg-red-500/8">
                    <AlertTriangle size={14} /> {error}
                </div>
            )}

            {!loading && !error && channel && (
                <LiveTvForm
                    mode="edit"
                    channelId={channelId}
                    defaultValues={liveTvChannelToFormValues(channel)}
                />
            )}
        </div>
    );
}
