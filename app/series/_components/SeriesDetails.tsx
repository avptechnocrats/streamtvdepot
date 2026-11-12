"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, ChevronDown, ChevronLeft, Clapperboard, Film, Loader2, Play, RotateCcw, Share2 } from "lucide-react";
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

function formatEpisodeDate(value?: string): string | null {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

function SeasonSelector({ seasons, value, onChange }: { seasons: number[]; value: number; onChange: (season: number) => void }) {
    const rowRef = useRef<HTMLDivElement>(null);
    const measureRef = useRef<HTMLDivElement>(null);
    const [visibleCount, setVisibleCount] = useState(seasons.length);
    const [menuOpen, setMenuOpen] = useState(false);
    const seasonKey = seasons.join(",");

    useEffect(() => {
        const row = rowRef.current;
        const measure = measureRef.current;
        if (!row || !measure) return;
        const updateVisibleCount = () => {
            const availableWidth = row.clientWidth;
            const widths = Array.from(measure.querySelectorAll<HTMLElement>("[data-season-measure]"))
                .slice(0, seasons.length)
                .map(button => button.getBoundingClientRect().width);
            const moreWidth = measure.querySelector<HTMLElement>("[data-season-more-measure]")?.getBoundingClientRect().width ?? 40;
            const gap = 28;
            let usedWidth = 0;
            let count = 0;
            for (let index = 0; index <= widths.length; index += 1) {
                const hasMore = index < widths.length;
                const candidateWidth = usedWidth
                    + (hasMore ? (index > 0 ? gap : 0) + moreWidth : 0);
                if (candidateWidth > availableWidth + 1) break;
                count = index;
                if (hasMore) usedWidth += (index > 0 ? gap : 0) + widths[index];
            }
            setVisibleCount(count);
        };
        updateVisibleCount();
        const observer = new ResizeObserver(updateVisibleCount);
        observer.observe(row);
        window.addEventListener("resize", updateVisibleCount);
        return () => {
            observer.disconnect();
            window.removeEventListener("resize", updateVisibleCount);
        };
    }, [seasonKey]);

    if (!seasons.length) return null;
    const visibleSeasons = seasons.slice(0, visibleCount);
    const overflowSeasons = seasons.slice(visibleCount);

    return <div ref={rowRef} className="relative w-full border-t border-border">
        <div className="flex h-[68px] w-full items-center gap-7 px-1">
            {visibleSeasons.map(season => <SeasonButton key={season} season={season} selected={value === season} onClick={() => { onChange(season); setMenuOpen(false); }} />)}
            {overflowSeasons.length > 0 && <div className="relative shrink-0">
                <button type="button" aria-label="More seasons" aria-expanded={menuOpen} title={value > visibleSeasons.at(-1)! ? `Season ${value}` : "More seasons"} onClick={() => setMenuOpen(open => !open)} className={`inline-flex h-10 items-center justify-center gap-1 px-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${value > visibleSeasons.at(-1)! ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                    {value > visibleSeasons.at(-1)! && <span>Season {value}</span>}<ChevronDown size={16} />
                </button>
                {menuOpen && <div role="menu" aria-label="Additional seasons" className="absolute right-0 top-full z-30 mt-1 max-h-64 min-w-40 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-xl">
                    {overflowSeasons.map(season => <button key={season} type="button" role="menuitemradio" aria-checked={value === season} onClick={() => { onChange(season); setMenuOpen(false); }} className={`block w-full rounded-sm px-3 py-2 text-left text-sm ${value === season ? "bg-primary/10 font-semibold text-primary" : "text-foreground hover:bg-secondary"}`}>Season {season}</button>)}
                </div>}
            </div>}
        </div>
        <div ref={measureRef} aria-hidden className="pointer-events-none invisible absolute -left-[9999px] top-0 flex w-max items-center gap-7">
            {seasons.map(season => <SeasonButton key={season} season={season} selected={false} onClick={() => undefined} measure />)}
            {seasons.length > 0 && <span data-season-more-measure className="inline-flex h-10 items-center px-2"><ChevronDown size={16} /></span>}
        </div>
    </div>;
}

function SeasonButton({ season, selected, onClick, measure = false }: { season: number; selected: boolean; onClick: () => void; measure?: boolean }) {
    return <button type="button" data-season-measure={measure ? "" : undefined} aria-pressed={measure ? undefined : selected} onClick={onClick} className={`h-10 shrink-0 px-1 text-base transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${selected ? "font-semibold text-foreground" : "font-normal text-muted-foreground hover:text-foreground"}`}>
        Season {season}
    </button>;
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
                <div className="mb-4"><SeasonSelector seasons={seasons} value={activeSeason} onChange={setSeason} /></div>
                {playbackError && <p role="alert" className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{playbackError}</p>}
                {episodesLoading ? <div role="status" aria-label="Loading episodes" className="space-y-4">{[1, 2, 3].map(value => <Skeleton key={value} className="h-28 w-full" />)}</div> : episodesError ? <div role="alert" className="flex flex-wrap items-center gap-4 py-8 text-sm text-muted-foreground"><span>Episodes are temporarily unavailable.</span><Button variant="outline" onClick={() => void refetchEpisodes()} className="gap-2"><RotateCcw size={14} />Try Again</Button></div> : !episodes.length ? <p className="py-10 text-sm text-muted-foreground">Episodes are coming soon.</p> : visibleEpisodes.map(episode => {
                    const progressItem = savedItems.find(item => item.id === episode.id);
                    const progress = progressItem && progressItem.duration > 0 ? Math.min(100, Math.max(0, progressItem.position / progressItem.duration * 100)) : 0;
                    const runtimeMinutes = episode.duration_seconds != null ? Math.max(1, Math.round(episode.duration_seconds / 60)) : null;
                    const releaseDate = formatEpisodeDate(episode.created_at);
                    return <button key={episode.id} type="button" aria-label={`Play episode ${episode.episode_number}: ${episode.title}`} disabled={!episode.has_media || authorization.isPending || accessLoading} onClick={() => chooseEpisode(episode)} className="group/episode grid w-full grid-cols-[120px_minmax(0,1fr)] items-start gap-4 border-b border-border/50 py-5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60 sm:grid-cols-[196px_minmax(0,520px)] sm:gap-7">
                        <div className="relative aspect-video overflow-hidden rounded-sm bg-secondary">
                            <img src={episode.thumbnail_url || seriesArtwork(series, true)} alt="" width={400} height={225} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 motion-reduce:transition-none group-hover/episode:scale-[1.03] group-focus-visible/episode:scale-[1.03]" onError={event => { if (!event.currentTarget.src.endsWith('/images/hero-banner.jpg')) event.currentTarget.src = '/images/hero-banner.jpg'; }} />
                            {episode.has_media && <span aria-hidden className="absolute bottom-2 left-2 flex h-6 w-6 items-center justify-center text-white drop-shadow-md"><Play size={17} fill="currentColor" /></span>}
                            {progress > 0 && <span role="progressbar" aria-label={`${episode.title} watch progress`} aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} className="absolute inset-x-0 bottom-0 h-[3px] bg-white/35"><span className="block h-full bg-sky-500" style={{ width: `${progress}%` }} /></span>}
                        </div>
                        <div className="min-w-0 pt-0.5">
                            <h3 className="break-words text-sm font-semibold leading-snug text-foreground sm:text-base">{episode.title}</h3>
                            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-foreground/90 sm:text-sm">
                                <span>S{episode.season_number} E{episode.episode_number}</span>
                                {releaseDate && <><span aria-hidden>·</span><span>{releaseDate}</span></>}
                                {runtimeMinutes != null && <><span aria-hidden>·</span><span>{runtimeMinutes}m</span></>}
                                {progressItem && <><span aria-hidden>·</span><span>Continue watching</span></>}
                            </p>
                            {episode.description && <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-muted-foreground sm:text-sm">{episode.description}</p>}
                            {!episode.has_media && <p className="mt-2 text-xs text-muted-foreground">Not available</p>}
                        </div>
                    </button>;
                })}
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