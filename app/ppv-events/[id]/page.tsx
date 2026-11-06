"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Loader2, Lock, Play, Radio } from "lucide-react";
import { getPpvEvent } from "@/lib/services";
import { authorizePpvPlayback } from "@/lib/services/ppv-events";
import { usePlayGate } from "@/hooks/use-play-gate";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { playbackAuthorizationExpiry, playbackResource } from "@/lib/playback-authorization";

const VideoPlayer = dynamic(() => import("@/components/VideoPlayer"), { ssr: false });

export default function PpvEventWatchPage() {
    const { id } = useParams<{ id: string }>();
    const { user } = useAuth();
    const { data: eventData, isLoading, isError } = useQuery({
        queryKey: ["ppv-event", id],
        queryFn: () => getPpvEvent(id),
        enabled: Boolean(id),
        refetchInterval: 15_000,
    });
    const { handlePlay, hasAccess, accessLoading } = usePlayGate({
        contentId: id,
        accessType: "pay_per_view",
        contentTitle: eventData?.title ?? "this PPV event",
        onPlay: () => undefined,
    });
    const hasStarted = !eventData?.scheduled_at || new Date(eventData.scheduled_at).getTime() <= Date.now();
    const { data: playback, isError: playbackError, error: playbackFailure, isFetching: authorizing, refetch: retryPlayback } = useQuery({
        queryKey: ["ppv-playback", id, user?.id, hasAccess, eventData?.is_live, eventData?.scheduled_at],
        queryFn: () => authorizePpvPlayback(id),
        enabled: Boolean(user && eventData?.is_live && hasAccess && hasStarted),
        refetchInterval: (query) => {
            if (query.state.error) return false;
            const expiry = query.state.data?.stream_url ? playbackAuthorizationExpiry(query.state.data.stream_url) : null;
            return expiry ? Math.max(1000, expiry - Date.now() - 60_000) : 10 * 60_000;
        },
        retry: false,
    });
    const event = eventData ? { ...eventData, stream_url: playback?.stream_url ?? null } : null;
    const initialSource = useRef<{ key: string; source: string } | null>(null);
    if (!user || !hasAccess || !eventData?.is_live || playbackError) {
        initialSource.current = null;
    } else if (playback?.stream_url) {
        const key = `${user?.id}:${id}:${playbackResource(playback.stream_url)}`;
        if (initialSource.current?.key !== key) initialSource.current = { key, source: playback.stream_url };
    }

    if (isLoading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;
    if (isError || !event) return <div className="flex min-h-screen flex-col items-center justify-center gap-4"><p className="text-muted-foreground">PPV event not found.</p><Link href="/ppv-events"><Button variant="outline">Back to PPV Events</Button></Link></div>;

    const poster = event.thumbnails.banner || event.thumbnails.wide || event.thumbnails.portrait || undefined;
    const expiry = event.stream_url ? playbackAuthorizationExpiry(event.stream_url) : null;
    const canPlay = Boolean(user && hasAccess && hasStarted && event.is_live && event.stream_url && !playbackError && (!expiry || expiry > Date.now()));

    return <main className="min-h-screen bg-black pt-16">
        <section className="mx-auto max-w-screen-2xl px-4 py-5 sm:px-6 lg:px-10">
            <Link href="/ppv-events"><Button variant="ghost" size="sm" className="mb-3 text-white/80 hover:bg-white/10 hover:text-white"><ChevronLeft size={16} /> PPV Events</Button></Link>
            {canPlay ? <VideoPlayer src={initialSource.current!.source} authorizationSrc={event.stream_url!} poster={poster} autoPlay allowSeeking={false} className="w-full" /> : (
                <div className="relative flex w-full min-h-72 sm:aspect-video flex-col items-center justify-center overflow-hidden bg-zinc-950" style={{ backgroundImage: poster ? `linear-gradient(rgba(0,0,0,.72), rgba(0,0,0,.88)), url(${poster})` : undefined, backgroundSize: "cover", backgroundPosition: "center" }}>
                    <div className="relative z-10 flex max-w-md flex-col items-center gap-4 px-6 py-6 text-center">
                        {authorizing || accessLoading ? <Loader2 size={30} className="animate-spin text-white/75" /> : <Lock size={30} className="text-white/75" />}
                        <h1 className="text-xl font-bold text-white">{event.title}</h1>
                        {event.scheduled_at && <time dateTime={event.scheduled_at} className="text-sm text-white/75">{new Date(event.scheduled_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} ({Intl.DateTimeFormat().resolvedOptions().timeZone})</time>}
                        <p className="text-sm text-white/65">{playbackError ? playbackFailure?.message || "Unable to authorize playback." : !hasStarted ? "Upcoming event" : !event.is_live ? "Waiting for the broadcast" : hasAccess ? "Preparing your stream" : "Purchase access to watch this event."}</p>
                        {!hasAccess && <Button onClick={handlePlay} disabled={accessLoading} className="gap-2 px-7"><Play size={17} /> Buy Event Access</Button>}
                        {hasAccess && !canPlay && !playbackError && <p className="text-sm text-emerald-400">You have access to this event.</p>}
                        {playbackError && <Button variant="outline" onClick={() => retryPlayback()} disabled={authorizing}>Try Again</Button>}
                    </div>
                </div>
            )}
            <div className="py-7 text-white"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-red-400"><Radio size={14} className={event.is_live ? "animate-pulse" : ""} /> {event.is_live ? "Live now" : "Offline"}</div><h1 className="mt-2 text-3xl font-display font-700">{event.title}</h1>{event.category && <p className="mt-2 text-sm text-white/60">{event.category}</p>}{event.description && <p className="mt-5 max-w-3xl leading-relaxed text-white/70">{event.description}</p>}</div>
            {event.scheduled_at && <p className="text-sm text-white/70">Starts <time dateTime={event.scheduled_at}>{new Date(event.scheduled_at).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" })}</time> ({Intl.DateTimeFormat().resolvedOptions().timeZone})</p>}
        </section>
    </main>;
}