"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Film, Tv, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { listVideos, type VideoOut } from "@/lib/services/videos";
import { listLiveTvChannels, type LiveTvChannelOut } from "@/lib/services/live-tv";

interface SearchOverlayProps {
    open: boolean;
    onClose: () => void;
}

function VideoResult({ video, onClose }: { video: VideoOut; onClose: () => void }) {
    const router = useRouter();
    const thumb =
        video.thumbnails.video_w_thumbnail ||
        video.thumbnails.video_h_thumbnail ||
        video.thumbnails.video_banner;

    function go() {
        onClose();
        router.push(`/movies/${video.id}`);
    }

    return (
        <button
            onClick={go}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg hover:bg-surface-hover transition-colors text-left"
        >
            <div className="w-12 h-16 rounded-md overflow-hidden bg-secondary shrink-0">
                {thumb && <img src={thumb} alt={video.title} className="w-full h-full object-cover" />}
                {!thumb && <div className="w-full h-full flex items-center justify-center"><Film size={16} className="text-muted-foreground" /></div>}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{video.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 capitalize">{video.access_type.replace("_", " ")}</p>
            </div>
        </button>
    );
}

function ChannelResult({ channel, onClose }: { channel: LiveTvChannelOut; onClose: () => void }) {
    const router = useRouter();
    const thumb = channel.thumbnails.wide || channel.thumbnails.portrait || channel.thumbnails.banner;

    function go() {
        onClose();
        router.push(`/tv-shows/${channel.id}`);
    }

    return (
        <button
            onClick={go}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg hover:bg-surface-hover transition-colors text-left"
        >
            <div className="w-12 h-12 rounded-md overflow-hidden bg-secondary shrink-0 flex items-center justify-center">
                {thumb
                    ? <img src={thumb} alt={channel.title} className="w-full h-full object-cover" />
                    : <Tv size={16} className="text-muted-foreground" />
                }
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{channel.title}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                    {channel.is_live && (
                        <span className="flex items-center gap-1 text-[10px] font-semibold text-red-500">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                            LIVE
                        </span>
                    )}
                    <span className="text-xs text-muted-foreground">Live Channel</span>
                </div>
            </div>
        </button>
    );
}

export default function SearchOverlay({ open, onClose }: SearchOverlayProps) {
    const [query, setQuery] = useState("");
    const [debouncedQuery, setDebouncedQuery] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    // Debounce search input by 300ms
    useEffect(() => {
        const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
        return () => clearTimeout(t);
    }, [query]);

    // Auto-focus input when overlay opens
    useEffect(() => {
        if (open) {
            setQuery("");
            setDebouncedQuery("");
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [open]);

    // Close on Escape
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [open, onClose]);

    const enabled = debouncedQuery.length >= 2;

    const { data: videos, isFetching: fetchingVideos } = useQuery({
        queryKey: ["search-videos", debouncedQuery],
        queryFn: () => listVideos({ search: debouncedQuery, page_size: 5, is_active: true }),
        enabled,
        staleTime: 30_000,
    });

    const { data: channels, isFetching: fetchingChannels } = useQuery({
        queryKey: ["search-channels", debouncedQuery],
        queryFn: () => listLiveTvChannels({ page_size: 3 }),
        enabled,
        staleTime: 30_000,
        select: (data) =>
            data.filter((c) =>
                c.title.toLowerCase().includes(debouncedQuery.toLowerCase())
            ),
    });

    const isSearching = fetchingVideos || fetchingChannels;
    const hasResults = (videos?.length ?? 0) > 0 || (channels?.length ?? 0) > 0;
    const showEmpty = enabled && !isSearching && !hasResults;

    if (!open) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-[60] bg-background/80 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Panel */}
            <div className="fixed top-0 left-0 right-0 z-[61] bg-background border-b border-border shadow-2xl">
                {/* Search input row */}
                <div className="flex items-center gap-3 px-6 lg:px-12 h-16">
                    <Search size={20} className="text-muted-foreground shrink-0" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search movies, shows, channels…"
                        className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground text-base outline-none"
                    />
                    {isSearching && <Loader2 size={18} className="text-muted-foreground animate-spin shrink-0" />}
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors shrink-0"
                        aria-label="Close search"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Results */}
                {enabled && (
                    <div className="px-6 lg:px-12 pb-4 max-h-[70vh] overflow-y-auto">
                        {showEmpty && (
                            <p className="text-sm text-muted-foreground py-6 text-center">
                                No results for &ldquo;{debouncedQuery}&rdquo;
                            </p>
                        )}

                        {(videos?.length ?? 0) > 0 && (
                            <div className="mb-3">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-1">Movies & Videos</p>
                                {videos!.map((v) => (
                                    <VideoResult key={v.id} video={v} onClose={onClose} />
                                ))}
                            </div>
                        )}

                        {(channels?.length ?? 0) > 0 && (
                            <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-1">Live Channels</p>
                                {channels!.map((c) => (
                                    <ChannelResult key={c.id} channel={c} onClose={onClose} />
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {!enabled && (
                    <div className="px-6 lg:px-12 pb-4">
                        <p className="text-xs text-muted-foreground py-3">Type at least 2 characters to search</p>
                    </div>
                )}
            </div>
        </>
    );
}
