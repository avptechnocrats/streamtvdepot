"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, ChevronLeft, Clapperboard, Film, Loader2, Play, RotateCcw, Share2 } from "lucide-react";
import { getSeries, getSeriesEpisodes, authorizeSeriesEpisode, fetchSeriesPage, seriesArtwork, type SeriesEpisode } from "@/lib/services/series";
import { usePlayGate } from "@/hooks/use-play-gate";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { readWatchHistory, saveWatchProgress, removeWatchHistoryItem, watchHistoryKey, type WatchHistoryItem } from "@/lib/watch-history";
import SeriesHero from "@/components/SeriesHero";
import { SeriesPoster } from "@/components/SeriesRow";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { playbackAuthorizationExpiry, playbackResource } from "@/lib/playback-authorization";

const VideoPlayer = dynamic(() => import("@/components/VideoPlayer"), { ssr: false });

function trailerSource(value: string | null): { source: string; embed: boolean } | null {
    if (!value) return null;
    try {
        const url = new URL(value);
        if (!["http:", "https:"].includes(url.protocol)) return null;
        const host = url.hostname.replace(/^www\./, "");
        if (["youtube.com", "m.youtube.com", "youtu.be", "youtube-nocookie.com"].includes(host)) {
            const parts = url.pathname.split("/").filter(Boolean);
            const id = host === "youtu.be" ? parts[0] : url.searchParams.get("v") || (["embed", "shorts"].includes(parts[0]) ? parts[1] : null);
            return id && /^[\w-]{11}$/.test(id) ? { source: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`, embed: true } : null;
        }
        if (host === "vimeo.com" || host === "player.vimeo.com") {
            const id = url.pathname.split("/").find(part => /^\d+$/.test(part));
            if (id) {
                const embed = new URL(`https://player.vimeo.com/video/${id}`);
                embed.searchParams.set("autoplay", "1");
                if (url.searchParams.get("h")) embed.searchParams.set("h", url.searchParams.get("h")!);
                return { source: embed.href, embed: true };
            }
        }
        return /\.(mp4|webm|m3u8)(?:[?#]|$)/i.test(value) ? { source: value, embed: false } : null;
    } catch { return null; }
}

export default function SeriesDetails({ id }: { id: string }) {
    const { user, isLoading: authLoading } = useAuth();
    const { toast } = useToast();
    const searchParams = useSearchParams();
    const { data: series, isPending, isError, refetch } = useQuery({ queryKey: ["series-detail", id], queryFn: () => getSeries(id), retry: 1 });
    const { data: episodes = [], isPending: episodesLoading, isError: episodesError, refetch: refetchEpisodes } = useQuery({ queryKey: ["series-public-episodes", id], queryFn: () => getSeriesEpisodes(id), enabled: !!series, retry: 1 });
    const [season, setSeason] = useState(1);
    const [tab, setTab] = useState("episodes");
    const [showTrailer, setShowTrailer] = useState(false);
    const [playback, setPlayback] = useState<{ source: string; episode: SeriesEpisode; startAt: number } | null>(null);
    const [ended, setEnded] = useState(false);
    const [playbackError, setPlaybackError] = useState<string | null>(null);
    const requestedEpisode = useRef<SeriesEpisode | null>(null);
    const autoStarted = useRef(false);
    const pendingProgress = useRef<{ key: string; item: WatchHistoryItem } | null>(null);
    const lastSaved = useRef(0);
    const initialSource = useRef<{ key: string; source: string } | null>(null);
    if (playback) {
        const key = `${user?.id}:${playback.episode.id}:${playbackResource(playback.source)}`;
        if (initialSource.current?.key !== key) initialSource.current = { key, source: playback.source };
    } else {
        initialSource.current = null;
    }
    const historyKey = user?.client_id && user.id ? `${watchHistoryKey(user.client_id, user.id)}:series:${id}` : null;
    const [history, setHistory] = useState<{ key: string; items: WatchHistoryItem[] } | null>(null);

    useEffect(() => {
        setHistory(historyKey ? { key: historyKey, items: readWatchHistory(historyKey) } : null);
        const flush = () => {
            const progress = pendingProgress.current;
            if (!progress) return;
            pendingProgress.current = null;
            saveWatchProgress(progress.key, progress.item);
        };
        const onVisibilityChange = () => { if (document.visibilityState === "hidden") flush(); };
        window.addEventListener("pagehide", flush);
        document.addEventListener("visibilitychange", onVisibilityChange);
        return () => { window.removeEventListener("pagehide", flush); document.removeEventListener("visibilitychange", onVisibilityChange); flush(); };
    }, [historyKey]);

    const authorization = useMutation({
        mutationFn: (episode: SeriesEpisode) => authorizeSeriesEpisode(id, episode.id),
        onSuccess: (source, episode) => {
            if (!/^https?:\/\//i.test(source)) { setPlaybackError("This episode is not available right now."); return; }
            const saved = historyKey ? readWatchHistory(historyKey).find(item => item.id === episode.id) : null;
            setPlaybackError(null);
            setEnded(false);
            setPlayback({ source, episode, startAt: saved?.position ?? 0 });
        },
        onError: () => setPlaybackError("This episode could not be started. Please try again."),
    });
    const { handlePlay, accessLoading } = usePlayGate({ contentId: id, accessType: series?.access_type === "ppv" ? "pay_per_view" : series?.access_type ?? "free", contentTitle: series?.title, onPlay: () => { if (requestedEpisode.current) authorization.mutate(requestedEpisode.current); } });
    const chooseEpisode = (episode: SeriesEpisode) => {
        if (!episode.has_media || authorization.isPending || accessLoading || (series?.access_type !== "free" && authLoading)) return;
        requestedEpisode.current = episode;
        setPlaybackError(null);
        handlePlay();
    };
    useEffect(() => {
        if (!playback) return;
        if (series?.access_type !== "free" && !user) { setPlayback(null); return; }
        const expiry = playbackAuthorizationExpiry(playback.source);
        if (!expiry) return;
        let cancelled = false;
        const timer = setTimeout(() => {
            authorizeSeriesEpisode(id, playback.episode.id).then(source => {
                if (!cancelled) setPlayback(current => current?.episode.id === playback.episode.id ? { ...current, source } : current);
            }).catch(() => {
                if (!cancelled) { setPlayback(null); setPlaybackError("Your playback access could not be renewed."); }
            });
        }, Math.max(1000, expiry - Date.now() - 60_000));
        return () => { cancelled = true; clearTimeout(timer); };
    }, [playback?.source, playback?.episode.id, user?.id, series?.access_type, id]);
    const savedItems = history?.key === historyKey ? history.items : [];
    const resumeEpisode = episodes.find(episode => episode.id === savedItems[0]?.id && episode.has_media);
    const firstEpisode = resumeEpisode ?? episodes.find(episode => episode.has_media);
    useEffect(() => {
        if (searchParams.get("play") !== "true" || !firstEpisode || accessLoading || authLoading || autoStarted.current) return;
        autoStarted.current = true;
        chooseEpisode(firstEpisode);
    }, [searchParams, firstEpisode, accessLoading, authLoading, chooseEpisode]);

    const flushProgress = () => {
        const progress = pendingProgress.current;
        if (progress) {
            pendingProgress.current = null;
            saveWatchProgress(progress.key, progress.item);
            if (progress.key === historyKey) setHistory({ key: progress.key, items: readWatchHistory(progress.key) });
        }
    };
    const { data: related, isError: relatedError, refetch: refetchRelated } = useQuery({ queryKey: ["series-related", id, series?.categories[0]], queryFn: () => fetchSeriesPage(1, { category: series?.categories[0] }), enabled: !!series && tab === "related", staleTime: 60_000, retry: 1 });

    if (isPending) return <div role="status" aria-label="Loading series" className="storefront-row min-h-[70vh] space-y-5 pt-32 pb-16"><Skeleton className="h-12 w-2/3 max-w-xl" /><Skeleton className="h-5 w-48" /><Skeleton className="h-24 w-full max-w-xl" /><Skeleton className="h-12 w-40" /><div className="space-y-4 pt-12">{[1, 2, 3].map(value => <Skeleton key={value} className="h-28 w-full" />)}</div></div>;
    if (isError || !series) return <section className="storefront-row flex min-h-[70vh] flex-col items-center justify-center gap-5 pt-28 text-center"><Clapperboard size={40} className="text-muted-foreground" /><h1 className="text-2xl font-bold">This series is not available</h1><div className="flex gap-3"><Button asChild variant="outline"><Link href="/series">All Series</Link></Button><Button onClick={() => void refetch()} className="gap-2"><RotateCcw size={15} />Try Again</Button></div></section>;

    const seasons = Array.from(new Set(episodes.map(episode => episode.season_number))).sort((first, second) => first - second);
    const activeSeason = seasons.includes(season) ? season : seasons[0] ?? 1;
    const visibleEpisodes = episodes.filter(episode => episode.season_number === activeSeason);
    const trailer = trailerSource(series.trailer_url);
    const nextEpisode = playback ? episodes[episodes.findIndex(episode => episode.id === playback.episode.id) + 1] : null;

    return <>
        <div className="relative">
            <SeriesHero series={series} previewEnabled={!showTrailer && !playback} actions={<>
                <Button size="lg" className="gap-2 px-5" disabled={!firstEpisode || authorization.isPending || accessLoading || (series.access_type !== "free" && authLoading)} onClick={() => firstEpisode && chooseEpisode(firstEpisode)}>{authorization.isPending || accessLoading ? <Loader2 size={17} className="animate-spin" /> : <Play size={18} fill="currentColor" />}{resumeEpisode ? "Resume" : "Watch Now"}</Button>
                {trailer && <Button variant="secondary" size="lg" className="gap-2 bg-white/15 text-white hover:bg-white/25" onClick={() => setShowTrailer(true)}><Film size={17} />Trailer</Button>}
                <Button variant="secondary" size="icon" title="Share series" aria-label="Share series" className="h-11 w-11 rounded-full bg-white/15 text-white hover:bg-white/25" onClick={async () => { try { const url = `${window.location.origin}/series/${series.id}`; if (navigator.share) await navigator.share({ title: series.title, url }); else { await navigator.clipboard.writeText(url); toast({ title: "Series link copied" }); } } catch (error) { if (!(error instanceof Error && error.name === "AbortError")) toast({ title: "Couldn't share this series", variant: "destructive" }); } }}><Share2 size={17} /></Button>
            </>} />
        </div>

        <div className="storefront-row py-8 pb-16"><Link href="/series" className="mb-5 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"><ChevronLeft size={17} />All Series</Link><Tabs value={tab} onValueChange={setTab}>
            <TabsList className="mb-6 grid w-full grid-cols-3 sm:w-auto sm:inline-flex"><TabsTrigger value="episodes" className="px-2 text-xs sm:px-5 sm:text-sm">Episodes</TabsTrigger><TabsTrigger value="related" className="px-2 text-xs sm:px-5 sm:text-sm">More Like This</TabsTrigger><TabsTrigger value="details" className="px-2 text-xs sm:px-5 sm:text-sm">Details</TabsTrigger></TabsList>
            <TabsContent value="episodes">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">Episodes</h2>{seasons.length > 0 && <select aria-label="Select season" value={activeSeason} onChange={event => setSeason(Number(event.target.value))} className="h-10 max-w-full rounded-md border border-border bg-background px-3 text-sm">{seasons.map(value => <option key={value} value={value}>Season {value}</option>)}</select>}</div>
                {playbackError && <p role="alert" className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{playbackError}</p>}
                {episodesLoading ? <div role="status" aria-label="Loading episodes" className="space-y-4">{[1, 2, 3].map(value => <Skeleton key={value} className="h-28 w-full" />)}</div> : episodesError ? <div role="alert" className="flex flex-wrap items-center gap-4 py-8 text-sm text-muted-foreground"><span>Episodes are temporarily unavailable.</span><Button variant="outline" onClick={() => void refetchEpisodes()} className="gap-2"><RotateCcw size={14} />Try Again</Button></div> : !episodes.length ? <p className="py-10 text-sm text-muted-foreground">Episodes are coming soon.</p> : visibleEpisodes.map(episode => <button key={episode.id} type="button" aria-label={`Play episode ${episode.episode_number}: ${episode.title}`} disabled={!episode.has_media || authorization.isPending || accessLoading} onClick={() => chooseEpisode(episode)} className="group/episode grid w-full grid-cols-[100px_minmax(0,1fr)] items-start gap-3 border-b border-border/50 py-5 text-left transition-colors hover:bg-secondary/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 sm:gap-5 md:grid-cols-[36px_200px_minmax(0,1fr)_auto] md:items-center">
                    <span aria-hidden className="hidden text-center text-lg font-semibold text-muted-foreground md:block">{String(episode.episode_number).padStart(2, "0")}</span>
                    <div className="relative aspect-video overflow-hidden rounded-md bg-secondary"><img src={episode.thumbnail_url || seriesArtwork(series, true)} alt="" width={400} height={225} loading="lazy" className="h-full w-full object-cover" onError={event => { if (!event.currentTarget.src.endsWith('/images/hero-banner.jpg')) event.currentTarget.src = '/images/hero-banner.jpg'; }} /><span className="absolute inset-0 flex items-center justify-center bg-black/25 opacity-100 transition-opacity sm:opacity-0 sm:group-hover/episode:opacity-100 sm:group-focus-visible/episode:opacity-100"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-black"><Play size={14} fill="currentColor" /></span></span></div>
                    <div className="min-w-0"><h3 className="break-words text-sm font-semibold sm:text-base"><span className="mr-1 md:hidden">{episode.episode_number}.</span>{episode.title}</h3>{episode.description && <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground sm:text-sm">{episode.description}</p>}{!episode.has_media && <p className="mt-2 text-xs text-muted-foreground">Not available</p>}{episode.duration_seconds != null && <span className="mt-2 block text-xs text-muted-foreground md:hidden">{Math.max(1, Math.round(episode.duration_seconds / 60))} min</span>}</div>
                    {episode.duration_seconds != null && <span className="hidden text-xs text-muted-foreground md:block">{Math.max(1, Math.round(episode.duration_seconds / 60))} min</span>}
                </button>)}
            </TabsContent>
            <TabsContent value="related"><h2 className="mb-5 text-xl font-bold">More Like This</h2>{relatedError ? <Button variant="outline" onClick={() => void refetchRelated()} className="gap-2"><RotateCcw size={15} />Try Again</Button> : related?.items.some(item => item.id !== id) ? <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">{related.items.filter(item => item.id !== id).slice(0, 12).map(item => <div key={item.id} className="min-w-0 [&>a]:block [&>a]:w-full"><SeriesPoster series={item} /></div>)}</div> : <p className="py-8 text-sm text-muted-foreground">{related ? "More series are coming soon." : "Finding more series..."}</p>}</TabsContent>
            <TabsContent value="details"><h2 className="mb-4 text-xl font-bold">About {series.title}</h2><p className="max-w-3xl whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{series.description}</p><dl className="mt-6 grid max-w-3xl grid-cols-1 gap-5 text-sm sm:grid-cols-2">{[["Genre", series.genre], ["Languages", (series.languages?.length ? series.languages : series.language ? [series.language] : []).join(", ")], ["Age Rating", series.age_rating], ["Seasons", String(series.total_seasons)]].filter(([, value]) => value).map(([label, value]) => <div key={label}><dt className="mb-1 text-xs text-muted-foreground">{label}</dt><dd className="font-medium">{value}</dd></div>)}</dl></TabsContent>
        </Tabs></div>

        <Dialog open={!!playback} onOpenChange={open => { if (!open) { flushProgress(); setPlayback(null); } }}><DialogContent className="left-0 top-0 h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 gap-0 rounded-none border-0 bg-black p-0 sm:rounded-none [&>button]:hidden"><DialogTitle className="sr-only">{series.title}: {playback?.episode.title}</DialogTitle><DialogDescription className="sr-only">Episode player</DialogDescription>{playback && <VideoPlayer key={playback.episode.id} src={initialSource.current?.source ?? playback.source} authorizationSrc={playback.source} poster={playback.episode.thumbnail_url || seriesArtwork(series, true)} autoPlay immersiveControls title={`${series.title} - S${playback.episode.season_number} E${playback.episode.episode_number}: ${playback.episode.title}`} startAt={playback.startAt} className="h-full w-full" onClose={() => { flushProgress(); setPlayback(null); }} onError={() => { flushProgress(); setPlayback(null); setPlaybackError("This episode could not be played. Please try again."); }} onPause={flushProgress} onTimeUpdate={(position, duration) => {
            if (!historyKey) return;
            pendingProgress.current = { key: historyKey, item: { id: playback.episode.id, title: playback.episode.title, image: playback.episode.thumbnail_url || seriesArtwork(series, true), position, duration, updatedAt: Date.now() } };
            if (Date.now() - lastSaved.current >= 10_000) { flushProgress(); lastSaved.current = Date.now(); }
        }} onEnded={() => { pendingProgress.current = null; if (historyKey) { removeWatchHistoryItem(historyKey, playback.episode.id); setHistory({ key: historyKey, items: readWatchHistory(historyKey) }); } setEnded(true); }} />}{ended && nextEpisode?.has_media && <Button className="absolute bottom-28 right-4 z-50 gap-2 sm:right-8" onClick={() => chooseEpisode(nextEpisode)}>Next Episode<ArrowRight size={16} /></Button>}</DialogContent></Dialog>
        <Dialog open={showTrailer} onOpenChange={setShowTrailer}><DialogContent className="w-[calc(100%-24px)] max-w-5xl overflow-hidden border-0 bg-black p-0"><DialogTitle className="sr-only">{series.title} trailer</DialogTitle><DialogDescription className="sr-only">Series trailer</DialogDescription>{trailer && (trailer.embed ? <iframe title={`${series.title} trailer`} src={trailer.source} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" className="aspect-video w-full" /> : <VideoPlayer src={trailer.source} autoPlay className="aspect-video w-full" />)}</DialogContent></Dialog>
    </>;
}