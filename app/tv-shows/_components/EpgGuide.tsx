"use client";

/**
 * EpgGuide — JioTV-style Electronic Program Guide
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────────┐
 *   │  [◄ Prev]  10:00  11:00  12:00  13:00  [Next ►]         │  ← sticky header
 *   ├─────────────┬────────────────────────────────────────────┤
 *   │ [thumb] Ch1 │ ▓▓▓▓▓▓News(30m)▓▓▓▓▓ Sports Today (60m)  │
 *   ├─────────────┼────────────────────────────────────────────┤
 *   │ [thumb] Ch2 │ ▓▓▓▓▓▓▓▓▓▓▓ Movie (90m) ▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │
 *   └─────────────┴────────────────────────────────────────────┘
 */

import { useRef, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Tv, Clock, RefreshCw } from "lucide-react";
import { useQueries } from "@tanstack/react-query";
import Link from "next/link";

import { getChannelEpg, type LiveTvChannelOut, type EpgProgram } from "@/lib/services";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Pixels per minute in the timeline */
const MIN_PX = 4;
/** How many hours of schedule the guide exposes for horizontal dragging */
const WINDOW_HOURS = 24;
/** Fixed width of the channel name column (px) */
const CHANNEL_COL = 160;

function toMinutes(date: Date): number {
    return date.getHours() * 60 + date.getMinutes();
}

function roundDownToHour(date: Date): Date {
    const d = new Date(date);
    d.setMinutes(0, 0, 0);
    return d;
}

function formatHHMM(date: Date): string {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatDateKey(d: Date): string {
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

// ─── Program pill ─────────────────────────────────────────────────────────────

interface ProgramPillProps {
    prog: EpgProgram;
    windowStartMs: number;   // ms timestamp of window start
    windowEndMs: number;     // ms timestamp of window end
    nowMs: number;
}

function ProgramPill({ prog, windowStartMs, windowEndMs, nowMs }: ProgramPillProps) {
    const startMs = new Date(prog.start_time).getTime();
    const endMs = new Date(prog.end_time).getTime();

    // Clamp to window
    const visibleStartMs = Math.max(startMs, windowStartMs);
    const visibleEndMs = Math.min(endMs, windowEndMs);
    if (visibleEndMs <= visibleStartMs) return null;

    const leftPx = ((visibleStartMs - windowStartMs) / 60_000) * MIN_PX;
    const widthPx = Math.max(((visibleEndMs - visibleStartMs) / 60_000) * MIN_PX - 2, 8);

    const isCurrent = startMs <= nowMs && endMs > nowMs;
    const isPast = endMs <= nowMs;
    const progressPct = isCurrent
        ? Math.min(100, ((nowMs - startMs) / (endMs - startMs)) * 100)
        : 0;

    return (
        <div
            className={`absolute top-1 bottom-1 rounded overflow-hidden flex flex-col justify-center px-2 text-xs select-none border transition-colors cursor-default group/pill
                ${isCurrent
                    ? "bg-primary/20 border-primary/60 text-foreground"
                    : isPast
                        ? "bg-muted/40 border-border/30 text-muted-foreground"
                        : "bg-secondary/60 border-border/40 text-foreground hover:bg-secondary"
                }`}
            style={{ left: leftPx, width: widthPx }}
            title={`${prog.title}${prog.description ? `\n${prog.description}` : ""}\n${formatHHMM(new Date(prog.start_time))} – ${formatHHMM(new Date(prog.end_time))}`}
        >
            {/* Progress bar for current program */}
            {isCurrent && (
                <div
                    className="absolute top-0 left-0 bottom-0 bg-primary/25 rounded pointer-events-none"
                    style={{ width: `${progressPct}%` }}
                />
            )}

            {widthPx > 40 && (
                <span className="relative truncate font-medium leading-tight">
                    {isCurrent && (
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse mr-1 align-middle" />
                    )}
                    {prog.title}
                </span>
            )}
            {widthPx > 80 && (
                <span className="relative text-[10px] opacity-60 truncate mt-0.5">
                    {formatHHMM(new Date(prog.start_time))} · {prog.duration_minutes}m
                    {prog.category && ` · ${prog.category}`}
                </span>
            )}

            {/* Tooltip on hover for narrow pills */}
            {widthPx <= 40 && (
                <span className="absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 hidden group-hover/pill:block bg-popover border border-border rounded px-2 py-1 text-xs whitespace-nowrap shadow-lg pointer-events-none">
                    {prog.title} · {formatHHMM(new Date(prog.start_time))} – {formatHHMM(new Date(prog.end_time))}
                </span>
            )}
        </div>
    );
}

// ─── Channel row ─────────────────────────────────────────────────────────────

interface ChannelRowProps {
    channel: LiveTvChannelOut;
    programs: EpgProgram[];
    windowStartMs: number;
    windowEndMs: number;
    nowMs: number;
}

function ChannelRow({ channel, programs, windowStartMs, windowEndMs, nowMs }: ChannelRowProps) {
    const thumb =
        channel.thumbnails.wide ||
        channel.thumbnails.portrait ||
        channel.thumbnails.banner;

    const nowProg = programs.find(
        (p) => new Date(p.start_time).getTime() <= nowMs && new Date(p.end_time).getTime() > nowMs,
    );

    const hasVisiblePrograms = programs.some((p) => {
        const s = new Date(p.start_time).getTime();
        const e = new Date(p.end_time).getTime();
        return Math.min(e, windowEndMs) > Math.max(s, windowStartMs);
    });

    return (
        <div className="flex border-b border-border/30 hover:bg-surface-hover/30 transition-colors">
            {/* Channel info cell — navigates directly to the channel page */}
            <Link
                href={`/tv-shows/${channel.id}?play=true`}
                onPointerDown={(event) => event.stopPropagation()}
                className="sticky left-0 z-30 flex-shrink-0 flex items-center gap-2 border-r border-border/30 bg-card px-3 py-2 text-left hover:bg-surface-hover/50 transition-colors"
                style={{ width: CHANNEL_COL }}
            >
                {thumb ? (
                    <img
                        src={thumb}
                        alt={channel.title}
                        className="w-9 h-9 rounded object-cover bg-secondary flex-shrink-0"
                        loading="lazy"
                    />
                ) : (
                    <div className="w-9 h-9 rounded bg-secondary flex items-center justify-center flex-shrink-0">
                        <Tv size={16} className="text-muted-foreground" />
                    </div>
                )}
                <div className="min-w-0">
                    <p className="text-xs font-semibold truncate text-foreground">{channel.title}</p>
                    {channel.is_live && (
                        <span className="flex items-center gap-0.5 text-[10px] text-red-400 font-medium">
                            <span className="w-1 h-1 rounded-full bg-red-400 animate-pulse" />
                            LIVE
                        </span>
                    )}
                    {!channel.is_live && nowProg && (
                        <p className="text-[10px] text-muted-foreground truncate">{nowProg.title}</p>
                    )}
                </div>
            </Link>

            {/* Program timeline cell */}
            <div
                className="flex-1 relative overflow-hidden"
                style={{ height: 56 }}
            >
                {programs.length === 0 && (
                    <div className="absolute inset-0 flex items-center px-3">
                        <span className="text-xs text-muted-foreground italic">No schedule available</span>
                    </div>
                )}
                {programs.length > 0 && !hasVisiblePrograms && (
                    <div className="absolute inset-0 flex items-center px-3">
                        <span className="text-xs text-muted-foreground italic">
                            Scheduled at another time — use ‹ › to navigate
                        </span>
                    </div>
                )}
                {programs.map((prog) => (
                    <ProgramPill
                        key={`${prog.id}-${prog.start_time}`}
                        prog={prog}
                        windowStartMs={windowStartMs}
                        windowEndMs={windowEndMs}
                        nowMs={nowMs}
                    />
                ))}
            </div>
        </div>
    );
}

// ─── Time header ──────────────────────────────────────────────────────────────

function TimeHeader({ windowStartMs, windowHours }: { windowStartMs: number; windowHours: number }) {
    const ticks = Array.from({ length: windowHours + 1 }, (_, i) => {
        const ms = windowStartMs + i * 3_600_000;
        return { ms, label: formatHHMM(new Date(ms)) };
    });

    return (
        <div className="flex-1 relative" style={{ height: 28 }}>
            {ticks.map(({ ms, label }) => {
                const leftPx = ((ms - windowStartMs) / 60_000) * MIN_PX;
                return (
                    <div
                        key={ms}
                        className="absolute top-0 flex items-center gap-1 text-xs text-muted-foreground"
                        style={{ left: leftPx }}
                    >
                        <div className="w-px h-3 bg-border/60" />
                        <span>{label}</span>
                    </div>
                );
            })}
        </div>
    );
}

// ─── Current time indicator ───────────────────────────────────────────────────

function NowLine({ windowStartMs, windowEndMs, nowMs }: { windowStartMs: number; windowEndMs: number; nowMs: number }) {
    if (nowMs < windowStartMs || nowMs > windowEndMs) return null;
    const leftPx = ((nowMs - windowStartMs) / 60_000) * MIN_PX;
    return (
        <div
            className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10 pointer-events-none"
            style={{ left: leftPx }}
        >
            <div className="absolute -top-1 -left-1 w-2.5 h-2.5 rounded-full bg-red-500" />
        </div>
    );
}

// ─── Main Guide ───────────────────────────────────────────────────────────────

interface EpgGuideProps {
    channels: LiveTvChannelOut[];
    embedded?: boolean;
}

export default function EpgGuide({ channels, embedded = false }: EpgGuideProps) {
    const [now, setNow] = useState(() => new Date());
    const [windowStart, setWindowStart] = useState(() => roundDownToHour(new Date()));
    const [isDragging, setIsDragging] = useState(false);
    const gridRef = useRef<HTMLDivElement>(null);
    const timeHeaderRef = useRef<HTMLDivElement>(null);
    const dragStartX = useRef(0);
    const dragStartScrollLeft = useRef(0);
    const didDrag = useRef(false);

    // Keep "now" updated every minute
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 60_000);
        return () => clearInterval(t);
    }, []);

    const windowStartMs = windowStart.getTime();
    const windowHours = WINDOW_HOURS;
    const windowEndMs = windowStartMs + windowHours * 3_600_000;
    const nowMs = now.getTime();

    // Derive date string from window start for EPG fetching
    const dateKey = useMemo(() => formatDateKey(windowStart), [windowStart]);

    // Fetch EPG for all channels in parallel
    const epgQueries = useQueries({
        queries: channels.map((ch) => ({
            queryKey: ["epg", ch.id, dateKey],
            queryFn: () => getChannelEpg(ch.id, dateKey, 1),
            staleTime: 5 * 60_000,
            retry: 1,
        })),
    });

    const isLoading = epgQueries.some((q) => q.isLoading);

    function shiftWindow(hours: number) {
        setWindowStart((prev) => {
            const next = new Date(prev.getTime() + hours * 3_600_000);
            // Don't go before midnight of the current day
            const midnight = new Date(now);
            midnight.setHours(0, 0, 0, 0);
            if (next < midnight) return prev;
            return next;
        });
    }

    function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
        if (event.button !== 0) return;
        const grid = event.currentTarget;
        dragStartX.current = event.clientX;
        dragStartScrollLeft.current = grid.scrollLeft;
        didDrag.current = false;
        setIsDragging(true);
        grid.setPointerCapture(event.pointerId);
    }

    function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
        if (!isDragging) return;
        const grid = event.currentTarget;
        const distance = event.clientX - dragStartX.current;
        if (Math.abs(distance) > 4) didDrag.current = true;
        event.preventDefault();
        grid.scrollTo({
            left: dragStartScrollLeft.current - distance,
            behavior: "auto",
        });
    }

    function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
        if (!isDragging) return;
        const grid = event.currentTarget;
        setIsDragging(false);
        grid.releasePointerCapture(event.pointerId);
    }

    function handleGridClick(event: React.MouseEvent<HTMLDivElement>) {
        if (!didDrag.current) return;
        event.preventDefault();
        event.stopPropagation();
        didDrag.current = false;
    }

    function handleGridScroll(event: React.UIEvent<HTMLDivElement>) {
        if (timeHeaderRef.current) {
            timeHeaderRef.current.scrollLeft = event.currentTarget.scrollLeft;
        }
    }

    // Scroll the grid so the current time is in view when component mounts
    useEffect(() => {
        if (!gridRef.current) return;
        const offsetMs = nowMs - windowStartMs;
        if (offsetMs > 0) {
            const scrollLeft = (offsetMs / 60_000) * MIN_PX - 80;
            gridRef.current.scrollLeft = Math.max(0, scrollLeft);
            if (timeHeaderRef.current) {
                timeHeaderRef.current.scrollLeft = gridRef.current.scrollLeft;
            }
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const windowTotalPx = windowHours * 60 * MIN_PX;

    return (
        <section className={`w-full min-w-0 ${embedded ? "mt-0 mb-0" : "mt-8 mb-12 px-4 lg:px-8"}`}>
            {/* Section header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Clock size={18} className="text-primary" />
                    <h2 className="text-xl font-semibold text-foreground">TV Guide</h2>
                    <span className="text-xs text-muted-foreground ml-2">
                        {now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {isLoading && <RefreshCw size={14} className="text-muted-foreground animate-spin" />}
                    <button
                        onClick={() => shiftWindow(-1)}
                        className="p-1.5 rounded-md border border-border/50 text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                        aria-label="Earlier"
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <button
                        onClick={() => {
                            setWindowStart(roundDownToHour(new Date()));
                        }}
                        className="px-2.5 py-1 text-xs font-medium rounded-md border border-border/50 text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                    >
                        Now
                    </button>
                    <button
                        onClick={() => shiftWindow(1)}
                        className="p-1.5 rounded-md border border-border/50 text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                        aria-label="Later"
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>

            {/* Guide container */}
            <div className="rounded-xl border border-border/40 overflow-hidden bg-card">
                {/* Sticky top row: empty channel col + time header */}
                <div className="flex border-b border-border/50 bg-card sticky top-0 z-10">
                    {/* Empty channel name column header */}
                    <div
                        className="flex-shrink-0 flex items-center px-3 text-xs font-medium text-muted-foreground bg-card border-r border-border/30"
                        style={{ width: CHANNEL_COL, height: 28 }}
                    >
                        Channel
                    </div>

                    {/* Time ticks — scrollable container synced with grid */}
                    <div
                        ref={timeHeaderRef}
                        className="flex-1 overflow-hidden"
                        style={{ minWidth: 0 }}
                    >
                        <div style={{ width: windowTotalPx, position: "relative", height: 28 }}>
                            <TimeHeader windowStartMs={windowStartMs} windowHours={windowHours} />
                        </div>
                    </div>
                </div>

                {/* Channel rows */}
                <div className="relative">
                    {channels.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
                            <Tv size={40} className="opacity-30" />
                            <p className="text-sm">No channels available</p>
                        </div>
                    ) : (
                        <div
                            ref={gridRef}
                            className={`scrollbar-hide overflow-x-auto select-none ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
                            onPointerDown={handlePointerDown}
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerUp}
                            onPointerCancel={handlePointerUp}
                            onClick={handleGridClick}
                            onScroll={handleGridScroll}
                            style={{
                                scrollBehavior: isDragging ? "auto" : "smooth",
                                touchAction: "pan-x",
                            }}
                        >
                            {/* Relative container so NowLine can span all rows */}
                            <div
                                style={{
                                    minWidth: CHANNEL_COL + windowTotalPx,
                                    position: "relative",
                                }}
                            >
                                {channels.map((ch, idx) => {
                                    const epgData = epgQueries[idx]?.data;
                                    const programs = epgData?.programs ?? [];
                                    return (
                                        <ChannelRow
                                            key={ch.id}
                                            channel={ch}
                                            programs={programs}
                                            windowStartMs={windowStartMs}
                                            windowEndMs={windowEndMs}
                                            nowMs={nowMs}
                                        />
                                    );
                                })}

                                <div
                                    className="absolute top-0 bottom-0 overflow-hidden pointer-events-none"
                                    style={{ left: CHANNEL_COL, right: 0 }}
                                >
                                    <NowLine
                                        windowStartMs={windowStartMs}
                                        windowEndMs={windowEndMs}
                                        nowMs={nowMs}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>


            </div>

            <p className="mt-2 text-xs text-muted-foreground text-right">
                All times shown in your local timezone
            </p>
        </section>
    );
}
