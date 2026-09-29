"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Loader2, Lock, Play, Radio, WifiOff } from "lucide-react";
import { getPpvEvent } from "@/lib/services";
import { usePlayGate } from "@/hooks/use-play-gate";
import { Button } from "@/components/ui/button";

const VideoPlayer = dynamic(() => import("@/components/VideoPlayer"), { ssr: false });

export default function PpvEventWatchPage() {
    const { id } = useParams<{ id: string }>();
    const { data: event, isLoading, isError } = useQuery({
        queryKey: ["ppv-event", id],
        queryFn: () => getPpvEvent(id),
        enabled: Boolean(id),
    });
    const { handlePlay, hasAccess, accessLoading } = usePlayGate({
        contentId: id,
        accessType: "pay_per_view",
        contentTitle: event?.title ?? "this PPV event",
        onPlay: () => undefined,
    });

    if (isLoading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;
    if (isError || !event) return <div className="flex min-h-screen flex-col items-center justify-center gap-4"><p className="text-muted-foreground">PPV event not found.</p><Link href="/ppv-events"><Button variant="outline">Back to PPV Events</Button></Link></div>;

    const poster = event.thumbnails.banner || event.thumbnails.wide || event.thumbnails.portrait || undefined;
    const canPlay = hasAccess && event.is_live && Boolean(event.stream_url);

    return <main className="min-h-screen bg-black pt-16">
        <section className="mx-auto max-w-screen-2xl px-4 py-5 sm:px-6 lg:px-10">
            <Link href="/ppv-events"><Button variant="ghost" size="sm" className="mb-3 text-white/80 hover:bg-white/10 hover:text-white"><ChevronLeft size={16} /> PPV Events</Button></Link>
            {canPlay ? <VideoPlayer src={event.stream_url!} poster={poster} autoPlay allowSeeking={false} className="w-full" /> : <div className="relative flex aspect-video flex-col items-center justify-center overflow-hidden bg-zinc-950" style={{ backgroundImage: poster ? `linear-gradient(rgba(0,0,0,.72), rgba(0,0,0,.88)), url(${poster})` : undefined, backgroundSize: "cover", backgroundPosition: "center" }}><div className="relative z-10 flex max-w-md flex-col items-center gap-4 px-6 text-center"><span className="flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-black/30"><Lock size={27} className="text-white/75" /></span><div><h1 className="text-xl font-bold text-white">{event.title}</h1><p className="mt-1 text-sm text-white/65">{event.is_live ? "Purchase access to watch this live PPV event." : "This PPV event is not live right now."}</p></div>{event.is_live ? <Button onClick={handlePlay} disabled={accessLoading} className="gap-2 px-7">{accessLoading ? <><Loader2 size={17} className="animate-spin" /> Checking access</> : <><Play size={17} fill="currentColor" /> {hasAccess ? "Watch now" : "Buy & Watch"}</>}</Button> : <WifiOff className="text-white/45" size={30} />}</div></div>}
            <div className="py-7 text-white"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-red-400"><Radio size={14} className={event.is_live ? "animate-pulse" : ""} /> {event.is_live ? "Live now" : "Offline"}</div><h1 className="mt-2 text-3xl font-display font-700">{event.title}</h1>{event.category && <p className="mt-2 text-sm text-white/60">{event.category}</p>}{event.description && <p className="mt-5 max-w-3xl leading-relaxed text-white/70">{event.description}</p>}</div>
        </section>
    </main>;
}