"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Play, Radio, Ticket } from "lucide-react";
import { listPpvEvents } from "@/lib/services";

function PpvEventCard({ event }: { event: Awaited<ReturnType<typeof listPpvEvents>>[number] }) {
    const image = event.thumbnails.portrait || event.thumbnails.wide || event.thumbnails.banner || "/images/movie-1.jpg";

    return (
        <Link href={`/ppv-events/${event.id}`} className="group block">
            <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-secondary">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image} alt={event.title} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/45">
                    <span className="flex h-12 w-12 scale-75 items-center justify-center rounded-full bg-primary text-primary-foreground opacity-0 transition-all group-hover:scale-100 group-hover:opacity-100"><Play size={20} fill="currentColor" /></span>
                </div>
                <span className={`absolute left-2 top-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${event.is_live ? "bg-red-600 text-white" : "bg-amber-500 text-black"}`}>
                    <Radio size={10} className={event.is_live ? "animate-pulse" : ""} /> {event.is_live ? "LIVE" : "PPV"}
                </span>
            </div>
            <div className="mt-2 space-y-0.5"><p className="truncate text-sm font-medium text-foreground">{event.title}</p><p className="truncate text-xs text-muted-foreground">{event.category || "Pay-per-view event"}</p></div>
        </Link>
    );
}

export default function PpvEventsPage() {
    const { data: events = [], isLoading } = useQuery({
        queryKey: ["ppv-events"],
        queryFn: () => listPpvEvents({ page_size: 100 }),
        staleTime: 60_000,
    });

    return (
        <main className="min-h-screen px-6 pb-16 pt-28 lg:px-12">
            <div className="mx-auto max-w-screen-2xl">
                <div className="mb-8 flex items-end justify-between gap-4"><div><div className="flex items-center gap-2 text-primary"><Ticket size={18} /><span className="text-xs font-semibold uppercase tracking-wider">Live access</span></div><h1 className="mt-2 text-3xl font-display font-700 text-foreground sm:text-4xl">PPV Events</h1><p className="mt-2 text-sm text-muted-foreground">Watch exclusive live events with one-time access.</p></div><div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex"><CalendarDays size={15} /> {events.length} event{events.length === 1 ? "" : "s"}</div></div>
                {isLoading ? <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="aspect-[2/3] animate-pulse rounded-lg bg-secondary" />)}</div> : events.length ? <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">{events.map((event) => <PpvEventCard key={event.id} event={event} />)}</div> : <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-border bg-card px-6 text-center"><Ticket size={34} className="text-muted-foreground/40" /><h2 className="mt-4 text-base font-semibold text-foreground">No PPV events available</h2><p className="mt-1 text-sm text-muted-foreground">Check back soon for the next exclusive live event.</p></div>}
            </div>
        </main>
    );
}