"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
    ArrowLeft,
    CalendarDays,
    Clock,
    GripVertical,
    Loader2,
    Plus,
    RefreshCw,
    Save,
    Search,
    Trash2,
    Upload,
    Video,
    X,
    AlertTriangle,
    CheckCircle2,
    ChevronRight,
    Repeat,
    CalendarClock,
    ChevronDown,
} from "lucide-react";
import {
    listEPGChannels,
    listEPGPrograms,
    saveEPGSchedule,
    importEPGXMLTV,
    type EPGChannelSummary,
    type EPGProgramOut,
    type EPGScheduleProgramItem,
} from "@/lib/api";
import { listVideos, type VideoOut } from "@/lib/api";
import { format, addMinutes, parseISO } from "date-fns";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function secToMin(seconds: number | null | undefined): number {
    if (!seconds || seconds <= 0) return 0;
    return Math.max(1, Math.round(seconds / 60));
}

function formatDuration(minutes: number): string {
    if (minutes <= 0) return "—";
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
}

function formatTime(date: Date): string {
    return format(date, "HH:mm");
}

function formatDatetime(date: Date): string {
    return format(date, "dd MMM yyyy, HH:mm");
}

function toLocalDatetimeValue(date: Date): string {
    const y = date.getFullYear();
    const mo = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const h = String(date.getHours()).padStart(2, "0");
    const mi = String(date.getMinutes()).padStart(2, "0");
    return `${y}-${mo}-${d}T${h}:${mi}`;
}

function localDatetimeToDate(value: string): Date {
    return new Date(value);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScheduleItem {
    /** Client-side ID for React key & DnD (not persisted). */
    tempId: string;
    video_id?: string | null;
    title: string;
    duration_minutes: number;
    description?: string | null;
    category?: string | null;
    rating?: string | null;
    thumbnail_url?: string | null;
}

let _uid = 0;
function uid() { return `item-${++_uid}`; }

// ─── Sortable schedule row ────────────────────────────────────────────────────

interface ScheduleRowProps {
    item: ScheduleItem;
    startTime: Date;
    index: number;
    removing: boolean;
    onRemove: (tempId: string) => void;
}

function ScheduleRow({ item, startTime, index, removing, onRemove }: ScheduleRowProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
        useSortable({ id: item.tempId });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging || removing ? 0.45 : 1,
        zIndex: isDragging ? 50 : "auto",
    };

    const endTime = addMinutes(startTime, item.duration_minutes);

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="group flex items-center gap-2 px-3 py-2.5 rounded-lg border border-border bg-card hover:border-primary/30 transition-colors"
        >
            {/* Drag handle */}
            <button
                {...attributes}
                {...listeners}
                className="p-1 shrink-0 text-muted-foreground/30 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none"
                aria-label="Drag to reorder"
            >
                <GripVertical size={15} />
            </button>

            {/* Index */}
            <span className="text-xs font-mono text-muted-foreground/50 w-5 shrink-0 text-right">
                {String(index + 1).padStart(2, "0")}
            </span>

            {/* Thumbnail */}
            {item.thumbnail_url ? (
                <img
                    src={item.thumbnail_url}
                    alt=""
                    className="w-10 h-7 object-cover rounded shrink-0"
                />
            ) : (
                <div className="w-10 h-7 rounded bg-secondary shrink-0 flex items-center justify-center">
                    <Video size={12} className="text-muted-foreground/40" />
                </div>
            )}

            {/* Content */}
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <span className="font-mono">{formatTime(startTime)} – {formatTime(endTime)}</span>
                    <span className="text-muted-foreground/40">·</span>
                    <span>{formatDuration(item.duration_minutes)}</span>
                    {item.category && (
                        <>
                            <span className="text-muted-foreground/40">·</span>
                            <span>{item.category}</span>
                        </>
                    )}
                </div>
            </div>

            {/* Remove */}
            <button
                onClick={() => !removing && onRemove(item.tempId)}
                disabled={removing}
                className="shrink-0 p-1 rounded text-muted-foreground/40 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 disabled:opacity-60 transition-all"
                aria-label="Remove"
            >
                {removing ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
            </button>
        </div>
    );
}

// ─── Video list item (left panel) ─────────────────────────────────────────────

interface VideoItemProps {
    video: VideoOut;
    onAdd: (video: VideoOut) => void;
}

function VideoItem({ video, onAdd }: VideoItemProps) {
    const thumb = video.thumbnails?.video_w_thumbnail ?? video.thumbnails?.video_h_thumbnail ?? null;
    const durationMins = secToMin(video.duration);

    return (
        <div className="group flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-accent/30 transition-colors cursor-pointer" onClick={() => onAdd(video)}>
            {/* Thumbnail */}
            <div className="w-12 h-8 rounded bg-secondary shrink-0 overflow-hidden flex items-center justify-center">
                {thumb ? (
                    <img src={thumb} alt="" className="w-full h-full object-cover" />
                ) : (
                    <Video size={14} className="text-muted-foreground/40" />
                )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate leading-tight">{video.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{durationMins > 0 ? formatDuration(durationMins) : "No duration"}</p>
            </div>

            {/* Add button */}
            <button
                className="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-primary hover:text-primary-foreground transition-all"
                aria-label="Add to schedule"
            >
                <Plus size={12} />
            </button>
        </div>
    );
}

// ─── XMLTV Import Modal ────────────────────────────────────────────────────────

interface XMLTVImportProps {
    channelId: string;
    onImported: () => void;
    onClose: () => void;
}

function XMLTVImportModal({ channelId, onImported, onClose }: XMLTVImportProps) {
    const [file, setFile] = useState<File | null>(null);
    const [replace, setReplace] = useState(false);
    const [importing, setImporting] = useState(false);
    const [result, setResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const handleImport = async () => {
        if (!file) return;
        setImporting(true);
        setError(null);
        setResult(null);
        try {
            const res = await importEPGXMLTV(channelId, file, replace);
            setResult(res);
            onImported();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Import failed");
        } finally {
            setImporting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
            <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                    <h2 className="font-semibold text-foreground">Import from XMLTV</h2>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><X size={18} /></button>
                </div>
                <div className="p-5 space-y-4">
                    <p className="text-sm text-muted-foreground">
                        Upload an XMLTV-format XML file. All <code className="bg-secondary px-1 rounded text-xs">&lt;programme&gt;</code> entries will be imported.
                    </p>
                    <div
                        className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/40 hover:bg-accent/20 transition-colors"
                        onClick={() => fileRef.current?.click()}
                    >
                        <Upload size={24} className="mx-auto mb-2 text-muted-foreground/50" />
                        {file
                            ? <p className="text-sm font-medium text-foreground">{file.name}</p>
                            : <><p className="text-sm font-medium text-foreground">Click to select XML file</p><p className="text-xs text-muted-foreground mt-0.5">XMLTV format (.xml), max 10 MB</p></>
                        }
                        <input ref={fileRef} type="file" accept=".xml,text/xml,application/xml" className="hidden"
                            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }} />
                    </div>
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                        <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="w-4 h-4 rounded accent-primary" />
                        <span className="text-sm text-foreground">Replace existing programs <span className="text-xs text-muted-foreground">(clears before import)</span></span>
                    </label>
                    {result && (
                        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-sm">
                            <p className="font-medium text-emerald-400 flex items-center gap-1.5"><CheckCircle2 size={14} />Import complete</p>
                            <p className="text-muted-foreground mt-1">{result.imported} imported · {result.skipped} skipped</p>
                            {result.errors.slice(0, 5).map((e, i) => <p key={i} className="text-xs text-red-400 mt-0.5">• {e}</p>)}
                        </div>
                    )}
                    {error && <p className="text-xs text-red-400 flex items-center gap-1"><AlertTriangle size={12} />{error}</p>}
                    <div className="flex gap-2">
                        <button onClick={onClose} className="flex-1 h-9 rounded-lg bg-secondary text-sm font-medium hover:bg-accent transition-colors">{result ? "Close" : "Cancel"}</button>
                        {!result && (
                            <button onClick={handleImport} disabled={!file || importing}
                                className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5">
                                {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}Import
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EPGSchedulerPage() {
    const params = useParams();
    const router = useRouter();
    const channelId = params.channelId as string;

    // Channel info
    const [channel, setChannel] = useState<EPGChannelSummary | null>(null);
    const [channels, setChannels] = useState<EPGChannelSummary[]>([]);

    // Left panel — video library
    const [videos, setVideos] = useState<VideoOut[]>([]);
    const [videoSearch, setVideoSearch] = useState("");
    const [videosLoading, setVideosLoading] = useState(true);

    // Schedule config
    const [scheduleStart, setScheduleStart] = useState(() => toLocalDatetimeValue(new Date()));
    const [playoutMode, setPlayoutMode] = useState<"schedule" | "loop">("schedule");

    // Right panel — items to schedule
    const [items, setItems] = useState<ScheduleItem[]>([]);

    // State flags
    const [saving, setSaving] = useState(false);
    const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
    const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
    const [showImport, setShowImport] = useState(false);
    const [loadingExisting, setLoadingExisting] = useState(false);
    const [channelReady, setChannelReady] = useState(false);
    const [confirmClear, setConfirmClear] = useState(false);
    const loadRequestRef = useRef(0);

    function showToast(text: string, ok = true) {
        setToast({ text, ok });
        setTimeout(() => setToast(null), 3500);
    }

    // Load channel info
    useEffect(() => {
        let active = true;
        setChannelReady(false);
        setChannel(null);
        setItems([]);
        setConfirmClear(false);
        (async () => {
            try {
                const availableChannels = await listEPGChannels();
                const ch = availableChannels.find((c) => c.id === channelId);
                if (!active) return;
                if (!ch) { router.push("/admin/content/epg"); return; }
                setChannels(availableChannels);
                setChannel(ch);
                setChannelReady(true);
            } catch {
                if (active) router.push("/admin/content/epg");
            }
        })();
        return () => { active = false; };
    }, [channelId, router]);

    // Load active videos for left panel
    const fetchVideos = useCallback(async (search: string) => {
        setVideosLoading(true);
        try {
            const vids = await listVideos({ is_active: true, search: search || undefined, page_size: 100 });
            setVideos(vids);
        } catch {
            setVideos([]);
        } finally {
            setVideosLoading(false);
        }
    }, []);

    useEffect(() => {
        const t = setTimeout(() => fetchVideos(videoSearch), 300);
        return () => clearTimeout(t);
    }, [videoSearch, fetchVideos]);

    // Load existing schedule for the selected date
    const loadExistingSchedule = useCallback(async (silent = false) => {
        const date = format(localDatetimeToDate(scheduleStart), "yyyy-MM-dd");
        const requestId = ++loadRequestRef.current;
        setLoadingExisting(true);
        try {
            const programs = await listEPGPrograms(channelId, date);
            if (requestId !== loadRequestRef.current) return;
            if (programs.length > 0) {
                setItems(programs.map((p) => ({
                    tempId: uid(),
                    video_id: p.video_id,
                    title: p.title,
                    duration_minutes: p.duration_minutes,
                    description: p.description,
                    category: p.category,
                    rating: p.rating,
                    thumbnail_url: p.thumbnail_url,
                })));
                // Set schedule start to the first program's start time
                setScheduleStart(toLocalDatetimeValue(parseISO(programs[0].start_time)));
                if (programs[0].playout_mode === "loop" || programs[0].playout_mode === "schedule") {
                    setPlayoutMode(programs[0].playout_mode);
                }
                if (!silent) showToast(`Loaded ${programs.length} existing programs`, true);
            } else {
                setItems([]);
                if (!silent) showToast("No programs found for this date", true);
            }
        } catch {
            if (requestId === loadRequestRef.current && !silent) showToast("Failed to load existing schedule", false);
        } finally {
            if (requestId === loadRequestRef.current) setLoadingExisting(false);
        }
    }, [channelId, scheduleStart]);

    // Auto-load on initial page visit (once channel is confirmed)
    useEffect(() => {
        if (channelReady) loadExistingSchedule(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [channelId, channelReady]);

    // Auto-load silently when the date portion of scheduleStart changes
    const scheduleDate = scheduleStart.slice(0, 10); // "YYYY-MM-DD"
    const prevDateRef = useRef<string>(scheduleDate);
    useEffect(() => {
        if (!channelReady) return;
        if (prevDateRef.current === scheduleDate) return;
        prevDateRef.current = scheduleDate;
        loadExistingSchedule(true);
    }, [scheduleDate, channelReady, loadExistingSchedule]);

    // DnD sensors
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const handleDragEnd = (event: DragEndEvent) => {
        if (saving) return;
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIdx = items.findIndex((i) => i.tempId === active.id);
        const newIdx = items.findIndex((i) => i.tempId === over.id);
        setItems(arrayMove(items, oldIdx, newIdx));
    };

    // Add video to schedule
    const addVideo = (video: VideoOut) => {
        if (saving || loadingExisting) return;
        const durationMins = secToMin(video.duration) || 30; // fallback 30 min if no duration
        // Compute when this video will start (current end of schedule)
        const startOffset = items.reduce((sum, i) => sum + i.duration_minutes, 0);
        const startsAt = addMinutes(localDatetimeToDate(scheduleStart), startOffset);
        setItems((prev) => [
            ...prev,
            {
                tempId: uid(),
                video_id: video.id,
                title: video.title,
                duration_minutes: durationMins,
                description: video.short_description,
                category: null,
                rating: video.age_rating,
                thumbnail_url: video.thumbnails?.video_w_thumbnail ?? video.thumbnails?.video_h_thumbnail ?? null,
            },
        ]);
        showToast(
            items.length === 0
                ? `"${video.title}" added — starts at ${formatTime(startsAt)}`
                : `"${video.title}" added at position ${items.length + 1} — starts at ${formatTime(startsAt)}`
        );
    };

    const removeItem = async (tempId: string) => {
        if (saving) return;
        const newItems = items.filter((i) => i.tempId !== tempId);
        setItems(newItems);
        setRemovingIds((prev) => new Set(prev).add(tempId));
        setSaving(true);
        try {
            await saveEPGSchedule(channelId, {
                schedule_start: localDatetimeToDate(scheduleStart).toISOString(),
                playout_mode: playoutMode,
                programs: newItems.map((item) => ({
                    video_id: item.video_id,
                    title: item.title,
                    description: item.description,
                    duration_minutes: item.duration_minutes,
                    category: item.category,
                    rating: item.rating,
                    thumbnail_url: item.thumbnail_url,
                })),
            });
        } catch {
            // Roll back on error
            setItems(items);
            showToast("Failed to remove program", false);
        } finally {
            setRemovingIds((prev) => { const s = new Set(prev); s.delete(tempId); return s; });
            setSaving(false);
        }
    };

    // Compute start times for each item
    const baseTime = localDatetimeToDate(scheduleStart);
    const startTimes: Date[] = [];
    let cursor = baseTime;
    for (const item of items) {
        startTimes.push(cursor);
        cursor = addMinutes(cursor, item.duration_minutes);
    }
    const totalDuration = items.reduce((sum, i) => sum + i.duration_minutes, 0);
    const scheduleEnd = items.length > 0 ? cursor : null;

    // Clear all programs and save empty schedule
    const handleClearSchedule = async () => {
        const previousItems = items;
        setConfirmClear(false);
        setItems([]);
        setSaving(true);
        try {
            await saveEPGSchedule(channelId, {
                schedule_start: localDatetimeToDate(scheduleStart).toISOString(),
                playout_mode: playoutMode,
                programs: [],
            });
            showToast("Schedule cleared — all programs removed");
        } catch (err: unknown) {
            setItems(previousItems);
            showToast(err instanceof Error ? err.message : "Failed to clear schedule", false);
        } finally {
            setSaving(false);
        }
    };

    // Save schedule
    const handleSave = async () => {
        if (items.length === 0) {
            // Saving empty schedule = delete all programs for this date
            setConfirmClear(true);
            return;
        }
        setSaving(true);
        try {
            const payload: EPGScheduleProgramItem[] = items.map((item) => ({
                video_id: item.video_id,
                title: item.title,
                description: item.description,
                duration_minutes: item.duration_minutes,
                category: item.category,
                rating: item.rating,
                thumbnail_url: item.thumbnail_url,
            }));
            await saveEPGSchedule(channelId, {
                schedule_start: localDatetimeToDate(scheduleStart).toISOString(),
                playout_mode: playoutMode,
                programs: payload,
            });
            showToast(`Schedule saved — ${items.length} programs`);
        } catch (err: unknown) {
            showToast(err instanceof Error ? err.message : "Failed to save schedule", false);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex flex-col h-screen overflow-hidden">
            {/* ── Top bar ── */}
            <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-card shrink-0">
                <Link href="/admin/content/epg" className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                    <ArrowLeft size={17} />
                </Link>
                <div className="flex-1 min-w-0">
                    <div className="inline-flex max-w-full items-center gap-2 rounded-lg border border-border bg-secondary/80 px-3 py-1 shadow-sm">
                        <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Channel :</span>
                        <div className="relative min-w-[220px] max-w-[420px]">
                            <select
                                value={channelId}
                                onChange={(event) => router.push(`/admin/content/epg/${event.target.value}`)}
                                disabled={!channelReady}
                                className="w-full appearance-none bg-transparent pr-7 text-base font-bold text-foreground outline-none disabled:cursor-wait cursor-pointer"
                                aria-label="Select TV channel"
                            >
                                {!channelReady && <option value={channelId}>Loading channel...</option>}
                                {channelReady && channels.map((item) => (
                                    <option key={item.id} value={item.id}>
                                        {item.title} ({item.source.toUpperCase()})
                                    </option>
                                ))}
                            </select>
                            <ChevronDown size={14} className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        </div>
                    </div>
                </div>
                <button
                    onClick={() => setShowImport(true)}
                    disabled={saving || loadingExisting}
                    className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:bg-accent/40 transition-colors"
                >
                    <Upload size={13} /> Import XMLTV
                </button>
                <button
                    onClick={() => setConfirmClear(true)}
                    disabled={saving || loadingExisting}
                    title="Delete all programs for this date"
                    className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-red-500/40 text-red-400 text-sm font-medium hover:bg-red-500/10 disabled:opacity-50 transition-colors"
                >
                    <Trash2 size={13} /> Clear Schedule
                </button>
                <button
                    onClick={handleSave}
                    disabled={saving || loadingExisting}
                    className="flex items-center gap-1.5 px-4 h-8 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                    {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                    Save Schedule
                </button>
            </div>

            {/* ── Schedule config bar ── */}
            <div className="flex items-center gap-4 px-5 py-3 border-b border-border bg-card/50 shrink-0 flex-wrap">
                {/* Date & time */}
                <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">Schedule Start</label>
                    <input
                        type="datetime-local"
                        value={scheduleStart}
                        onChange={(e) => setScheduleStart(e.target.value)}
                        disabled={saving || loadingExisting}
                        className="h-8 rounded-lg bg-secondary border border-border px-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                    />
                </div>

                {/* Playout mode */}
                <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">Playout Mode</label>
                    <div className="flex rounded-lg border border-border overflow-hidden text-sm">
                        <button
                            onClick={() => !saving && !loadingExisting && setPlayoutMode("schedule")}
                            disabled={saving || loadingExisting}
                            className={`flex items-center gap-1.5 px-3 h-8 transition-colors ${playoutMode === "schedule" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
                        >
                            <CalendarClock size={13} /> Schedule
                        </button>
                        <button
                            onClick={() => !saving && !loadingExisting && setPlayoutMode("loop")}
                            disabled={saving || loadingExisting}
                            className={`flex items-center gap-1.5 px-3 h-8 transition-colors ${playoutMode === "loop" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
                        >
                            <Repeat size={13} /> Loop
                        </button>
                    </div>
                </div>

                {/* Schedule summary */}
                {items.length > 0 && (
                    <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock size={12} />
                        <span>{items.length} program{items.length !== 1 ? "s" : ""} · {formatDuration(totalDuration)} total</span>
                        {scheduleEnd && <span>· Ends {formatDatetime(scheduleEnd)}</span>}
                    </div>
                )}

                {/* Load existing */}
                <button
                    onClick={() => loadExistingSchedule(false)}
                    disabled={saving || loadingExisting}
                    title="Load existing schedule for this date"
                    className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                    {loadingExisting ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                    Load existing
                </button>
            </div>

            {/* ── Two-panel body ── */}
            <div className="flex flex-1 overflow-hidden">
                {/* ── LEFT: Video Library ── */}
                <div className="w-72 shrink-0 flex flex-col border-r border-border bg-card/30">
                    <div className="px-3 pt-3 pb-2 shrink-0">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Available Videos</p>
                        <div className="relative">
                            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
                            <input
                                type="text"
                                placeholder="Search videos..."
                                value={videoSearch}
                                onChange={(e) => setVideoSearch(e.target.value)}
                                className="w-full h-8 pl-8 pr-3 rounded-lg bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto scrollbar-themed px-1.5 pb-3 space-y-0.5">
                        {videosLoading && (
                            <div className="py-8 text-center">
                                <Loader2 size={18} className="mx-auto animate-spin text-primary/60" />
                            </div>
                        )}
                        {!videosLoading && videos.length === 0 && (
                            <p className="text-xs text-muted-foreground text-center py-8">No active videos found</p>
                        )}
                        {!videosLoading && videos.map((v) => (
                            <VideoItem key={v.id} video={v} onAdd={addVideo} />
                        ))}
                    </div>
                </div>

                {/* ── RIGHT: Schedule ── */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Right header */}
                    <div className="px-4 pt-3 pb-2 shrink-0 flex items-center justify-between">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            Scheduled Programs
                        </p>
                        {items.length > 0 && (
                            <button
                                onClick={() => setConfirmClear(true)}
                                disabled={saving || loadingExisting}
                                className="text-xs text-muted-foreground hover:text-red-400 disabled:opacity-50 transition-colors"
                            >
                                Clear all
                            </button>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto scrollbar-themed px-3 pb-4">
                        {/* Empty state */}
                        {items.length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center text-center py-16">
                                <div className="w-16 h-16 rounded-xl bg-secondary flex items-center justify-center mb-4">
                                    <CalendarDays size={28} className="text-muted-foreground/30" />
                                </div>
                                <p className="font-medium text-muted-foreground">No programs scheduled</p>
                                <p className="text-sm text-muted-foreground/60 mt-1 max-w-xs">
                                    Click a video on the left to add it. The first video will start at{" "}
                                    <span className="font-mono text-foreground/70">{formatTime(localDatetimeToDate(scheduleStart))}</span>.
                                </p>
                                <div className="flex items-center gap-1.5 mt-4 text-xs text-muted-foreground/50">
                                    <ChevronRight size={12} /> Select videos from the left panel
                                </div>
                            </div>
                        )}

                        {/* Program list */}
                        {items.length > 0 && (
                            <DndContext
                                sensors={sensors}
                                collisionDetection={closestCenter}
                                onDragEnd={handleDragEnd}
                            >
                                <SortableContext
                                    items={items.map((i) => i.tempId)}
                                    strategy={verticalListSortingStrategy}
                                >
                                    <div className="space-y-1.5">
                                        {items.map((item, idx) => (
                                            <ScheduleRow
                                                key={item.tempId}
                                                item={item}
                                                startTime={startTimes[idx]}
                                                index={idx}
                                                removing={removingIds.has(item.tempId)}
                                                onRemove={removeItem}
                                            />
                                        ))}
                                    </div>
                                </SortableContext>
                            </DndContext>
                        )}

                        {/* End time footer */}
                        {scheduleEnd && (
                            <div className="mt-3 px-3 py-2.5 rounded-lg border border-dashed border-border text-xs text-muted-foreground flex items-center gap-2">
                                <Clock size={12} />
                                Schedule ends at <span className="font-mono font-medium text-foreground">{formatTime(scheduleEnd)}</span>
                                {playoutMode === "loop" && (
                                    <span className="ml-1 flex items-center gap-1 text-primary">
                                        <Repeat size={11} /> then loops
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Confirm clear modal ── */}
            {confirmClear && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setConfirmClear(false)}>
                    <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                            <h2 className="font-semibold text-foreground flex items-center gap-2">
                                <Trash2 size={16} className="text-red-400" /> Clear Schedule
                            </h2>
                            <button onClick={() => setConfirmClear(false)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
                        </div>
                        <div className="p-5 space-y-4">
                            <p className="text-sm text-muted-foreground">
                                This will <span className="text-foreground font-medium">permanently delete all programs</span> scheduled on <span className="font-medium text-foreground">{scheduleStart.slice(0, 10)}</span> for this channel.
                            </p>
                            <p className="text-xs text-muted-foreground/70">This action cannot be undone.</p>
                            <div className="flex gap-2">
                                <button onClick={() => setConfirmClear(false)} className="flex-1 h-9 rounded-lg bg-secondary text-sm font-medium hover:bg-accent transition-colors">Cancel</button>
                                <button
                                    onClick={handleClearSchedule}
                                    disabled={saving}
                                    className="flex-1 h-9 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
                                >
                                    {saving ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                                    Delete All Programs
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modals ── */}
            {showImport && (
                <XMLTVImportModal
                    channelId={channelId}
                    onImported={() => loadExistingSchedule(false)}
                    onClose={() => setShowImport(false)}
                />
            )}

            {/* ── Toast ── */}
            {toast && (
                <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium ${toast.ok ? "bg-emerald-500 text-white" : "bg-red-500 text-white"}`}>
                    {toast.ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
                    {toast.text}
                </div>
            )}
        </div>
    );
}
