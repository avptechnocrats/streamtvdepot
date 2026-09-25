"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
    listAdvertisements,
    deleteAdvertisement,
    listAdPlacements,
    createAdPlacement,
    deleteAdPlacement,
    getAdvertisementReport,
    listVideos,
    listSeries,
    listAudios,
    listLiveTvChannels,
    listPpvEvents,
    getVideo,
    getSeries,
    getAudio,
    getLiveTvChannel,
    getPpvEvent,
    type AdvertisementOut,
    type AdPlacementOut,
    type AdvertisementReportOut,
} from "@/lib/api";
import {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
    getPaginationItems,
} from "@/components/ui/pagination";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Megaphone, AlertTriangle, Search, RefreshCw, Clock3, CirclePlay, PauseCircle, XCircle, PanelRightOpen, BarChart3, Info, X } from "lucide-react";
import { AD_TYPE_META, PLACEMENT_TYPE_META, ALL_PLACEMENT_TYPES, type PlacementType } from "@/lib/ad-format";
import { useToast } from "@/hooks/use-toast";

// Resolve a placement's content_id to a human-readable title; falls back to the raw id if the content was removed.
async function fetchContentTitle(contentType: string, contentId: string): Promise<string> {
    try {
        switch (contentType) {
            case "video":
                return (await getVideo(contentId)).title;
            case "series":
                return (await getSeries(contentId)).title;
            case "audio":
                return (await getAudio(contentId)).title;
            case "live_stream":
                return (await getLiveTvChannel(contentId)).title;
            case "ppv_event":
                return (await getPpvEvent(contentId)).title;
            default:
                return contentId;
        }
    } catch {
        return contentId;
    }
}

const PLACEMENT_TYPE_OPTIONS: { value: PlacementType; label: string }[] = ALL_PLACEMENT_TYPES.map((value) => ({
    value,
    label: PLACEMENT_TYPE_META[value].label,
}));

const CONTENT_SEARCH_PAGE_SIZE = 20;

const DISPLAY_PAGE_SIZE = 10;
type AdTab = "all" | "draft" | "active" | "paused" | "expired";

const AD_TABS: { key: AdTab; label: string; icon: React.ElementType }[] = [
    { key: "all", label: "All", icon: Megaphone },
    { key: "draft", label: "Drafts", icon: Clock3 },
    { key: "active", label: "Active", icon: CirclePlay },
    { key: "paused", label: "Paused", icon: PauseCircle },
    { key: "expired", label: "Expired", icon: XCircle },
];

function inputCls() {
    return "w-full h-9 rounded-lg bg-secondary border border-border px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary";
}

function selectCls() {
    return "w-full h-9 rounded-lg bg-secondary border border-border px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary";
}

export default function AdvertisementsPage() {
    const [ads, setAds] = useState<AdvertisementOut[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { toast } = useToast();
    const [tab, setTab] = useState<AdTab>("all");
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [counts, setCounts] = useState<Record<AdTab, number>>({ all: 0, draft: 0, active: 0, paused: 0, expired: 0 });
    const [total, setTotal] = useState(0);

    const [selectedAdId, setSelectedAdId] = useState<string | null>(null);
    const [placementsDrawerOpen, setPlacementsDrawerOpen] = useState(false);
    // Cache of all placements per ad id — powers both the "Assigned" count column and the assigned-content popup.
    const [placementsByAd, setPlacementsByAd] = useState<Record<string, AdPlacementOut[]>>({});
    const [placementBusy, setPlacementBusy] = useState(false);
    const [reportAd, setReportAd] = useState<AdvertisementOut | null>(null);
    const [report, setReport] = useState<AdvertisementReportOut | null>(null);
    const [reportLoading, setReportLoading] = useState(false);
    const [assignedAd, setAssignedAd] = useState<AdvertisementOut | null>(null);
    const [assignedNamesLoading, setAssignedNamesLoading] = useState(false);
    const [placementForm, setPlacementForm] = useState({
        placement_types: ["pre_roll"] as PlacementType[],
        content_type: "video" as "video" | "audio" | "series" | "live_stream" | "ppv_event" | "all",
        priority: "0",
    });
    const [contentSearchInput, setContentSearchInput] = useState("");
    const [contentSearchQuery, setContentSearchQuery] = useState("");
    const [contentOptions, setContentOptions] = useState<{ id: string; label: string }[]>([]);
    // Shared cache of content_id → title, populated by both the search autocomplete and the assigned-content resolver.
    const [contentNameMap, setContentNameMap] = useState<Record<string, string>>({});
    const contentNameMapRef = useRef<Record<string, string>>({});
    const [contentSearchOpen, setContentSearchOpen] = useState(false);
    const [contentSearchLoading, setContentSearchLoading] = useState(false);
    const [selectedContentIds, setSelectedContentIds] = useState<string[]>([]);

    useEffect(() => {
        contentNameMapRef.current = contentNameMap;
    }, [contentNameMap]);

    const selectedAd = useMemo(
        () => ads.find((a) => a.id === selectedAdId) ?? null,
        [ads, selectedAdId],
    );

    // Restrict placement-type choices to what this ad's own ad_type can actually resolve at playback.
    const compatiblePlacementOptions = useMemo(() => {
        if (!selectedAd) return PLACEMENT_TYPE_OPTIONS;
        const allowed = AD_TYPE_META[selectedAd.ad_type].placements;
        return PLACEMENT_TYPE_OPTIONS.filter((opt) => allowed.includes(opt.value));
    }, [selectedAd]);

    const pushToast = (text: string, ok = true, description?: string) => {
        toast({ title: text, description, variant: ok ? "success" : "destructive" });
    };

    const loadAds = useCallback(async (manualRefresh = false) => {
        if (manualRefresh) setRefreshing(true);
        else setLoading(true);
        setError(null);
        try {
            const response = await listAdvertisements({
                page,
                page_size: DISPLAY_PAGE_SIZE,
                ...(search.trim() ? { search: search.trim() } : {}),
                ...(tab !== "all" ? { status: tab } : {}),
            });

            const paginated = Array.isArray(response)
                ? { items: response, total: response.length, page, page_size: DISPLAY_PAGE_SIZE, counts: { all: response.length, draft: 0, active: 0, paused: 0, expired: 0 } }
                : response;

            setAds(paginated.items);
            setCounts({
                all: paginated.counts.all ?? 0,
                draft: paginated.counts.draft ?? 0,
                active: paginated.counts.active ?? 0,
                paused: paginated.counts.paused ?? 0,
                expired: paginated.counts.expired ?? 0,
            });
            setTotal(paginated.total);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load advertisements");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [page, search, tab]);

    const loadPlacements = useCallback(async (adId: string) => {
        try {
            const items = await listAdPlacements(adId);
            setPlacementsByAd((prev) => ({ ...prev, [adId]: items }));
        } catch {
            setPlacementsByAd((prev) => ({ ...prev, [adId]: [] }));
        }
    }, []);

    // Resolve content_id -> title for any placements whose name isn't cached yet.
    const resolveContentNames = useCallback(async (items: AdPlacementOut[]) => {
        const pending = new Map<string, string>();
        for (const p of items) {
            if (!p.content_id || !p.content_type || p.content_type === "all") continue;
            if (contentNameMapRef.current[p.content_id]) continue;
            pending.set(p.content_id, p.content_type);
        }
        if (pending.size === 0) return;
        setAssignedNamesLoading(true);
        try {
            const results = await Promise.all(
                Array.from(pending.entries()).map(async ([id, type]) => [id, await fetchContentTitle(type, id)] as const),
            );
            setContentNameMap((prev) => {
                const next = { ...prev };
                for (const [id, title] of results) next[id] = title;
                return next;
            });
        } finally {
            setAssignedNamesLoading(false);
        }
    }, []);

    useEffect(() => {
        setPage(1);
    }, [search, tab]);

    useEffect(() => {
        loadAds();
    }, [loadAds]);

    // Prefetch placement counts for every ad on the current page, powering the "Assigned" column.
    useEffect(() => {
        if (ads.length === 0) return;
        let cancelled = false;
        (async () => {
            const results = await Promise.allSettled(ads.map((ad) => listAdPlacements(ad.id)));
            if (cancelled) return;
            setPlacementsByAd((prev) => {
                const next = { ...prev };
                ads.forEach((ad, i) => {
                    const result = results[i];
                    if (result.status === "fulfilled") next[ad.id] = result.value;
                });
                return next;
            });
        })();
        return () => {
            cancelled = true;
        };
    }, [ads]);

    useEffect(() => {
        if (selectedAdId) {
            loadPlacements(selectedAdId);
        }
    }, [selectedAdId, loadPlacements]);

    // Resolve content names for whichever ad's assigned-content popup is open.
    useEffect(() => {
        if (!assignedAd) return;
        void resolveContentNames(placementsByAd[assignedAd.id] ?? []);
    }, [assignedAd, placementsByAd, resolveContentNames]);

    useEffect(() => {
        if (!reportAd) {
            setReport(null);
            return;
        }
        setReportLoading(true);
        getAdvertisementReport(reportAd.id)
            .then(setReport)
            .catch(() => setReport(null))
            .finally(() => setReportLoading(false));
    }, [reportAd]);


    // Reset the content picker whenever the drawer opens for a different ad or the content type changes.
    useEffect(() => {
        setSelectedContentIds([]);
        setContentSearchInput("");
        setContentSearchQuery("");
        setContentOptions([]);
        setContentSearchOpen(false);
    }, [selectedAdId, placementForm.content_type]);

    // Default the placement-type selection to whatever is actually compatible with this ad's ad_type.
    useEffect(() => {
        if (!selectedAd) return;
        const allowed = AD_TYPE_META[selectedAd.ad_type].placements;
        setPlacementForm((f) => {
            const validTypes = f.placement_types.filter((t) => allowed.includes(t));
            if (validTypes.length > 0) return { ...f, placement_types: validTypes };
            return { ...f, placement_types: [allowed[0]] };
        });
    }, [selectedAd]);

    useEffect(() => {
        const timer = setTimeout(() => setContentSearchQuery(contentSearchInput.trim()), 300);
        return () => clearTimeout(timer);
    }, [contentSearchInput]);

    useEffect(() => {
        if (placementForm.content_type === "all" || !contentSearchQuery) {
            setContentOptions([]);
            return;
        }
        let cancelled = false;
        const runSearch = async () => {
            setContentSearchLoading(true);
            try {
                const params = { page: 1, page_size: CONTENT_SEARCH_PAGE_SIZE, search: contentSearchQuery };
                let items: { id: string; title: string }[] = [];
                switch (placementForm.content_type) {
                    case "video":
                        items = await listVideos(params);
                        break;
                    case "series":
                        items = await listSeries(params);
                        break;
                    case "audio":
                        items = await listAudios(params);
                        break;
                    case "live_stream":
                        items = await listLiveTvChannels(params);
                        break;
                    case "ppv_event":
                        items = await listPpvEvents(params);
                        break;
                }
                if (cancelled) return;
                const options = items.map((item) => ({ id: item.id, label: item.title }));
                setContentOptions(options);
                setContentNameMap((prev) => {
                    const next = { ...prev };
                    for (const option of options) next[option.id] = option.label;
                    return next;
                });
            } catch {
                if (!cancelled) setContentOptions([]);
            } finally {
                if (!cancelled) setContentSearchLoading(false);
            }
        };
        void runSearch();
        return () => {
            cancelled = true;
        };
    }, [placementForm.content_type, contentSearchQuery]);

    const onDelete = async (adId: string) => {
        const ok = window.confirm("Delete this advertisement?");
        if (!ok) return;
        try {
            await deleteAdvertisement(adId);
            if (selectedAdId === adId) {
                setPlacementsDrawerOpen(false);
                setSelectedAdId(null);
            }
            if (assignedAd?.id === adId) setAssignedAd(null);
            setPlacementsByAd((prev) => {
                const next = { ...prev };
                delete next[adId];
                return next;
            });
            await loadAds(true);
            pushToast("Advertisement deleted");
        } catch (err) {
            pushToast(err instanceof Error ? err.message : "Delete failed", false);
        }
    };

    const onCreatePlacement = async () => {
        if (!selectedAdId) return;
        if (placementForm.placement_types.length === 0) {
            pushToast("Select at least one placement", false);
            return;
        }
        setPlacementBusy(true);
        try {
            const priority = Number(placementForm.priority || "0");
            // No specific content selected → one broad placement per type (content_id = null).
            const contentIds: (string | null)[] = selectedContentIds.length > 0 ? selectedContentIds : [null];
            for (const placement_type of placementForm.placement_types) {
                for (const content_id of contentIds) {
                    await createAdPlacement(selectedAdId, {
                        placement_type,
                        content_type: placementForm.content_type || null,
                        content_id,
                        priority,
                    });
                }
            }
            await loadPlacements(selectedAdId);
            setPlacementForm({
                placement_types: [selectedAd ? AD_TYPE_META[selectedAd.ad_type].placements[0] : "pre_roll"],
                content_type: "video",
                priority: "0",
            });
            setSelectedContentIds([]);
            setContentSearchInput("");
            setContentSearchQuery("");
            pushToast("Placement Added", true, "Advertisement placement added successfully.");
            setPlacementsDrawerOpen(false);
        } catch (err) {
            pushToast(err instanceof Error ? err.message : "Failed to add placement", false);
        } finally {
            setPlacementBusy(false);
        }
    };

    const onDeletePlacement = async (adId: string, placementId: string) => {
        if (!window.confirm("Remove this placement?")) return;
        try {
            await deleteAdPlacement(adId, placementId);
            await loadPlacements(adId);
            pushToast("Placement removed");
        } catch (err) {
            pushToast(err instanceof Error ? err.message : "Delete failed", false);
        }
    };

    const totalPages = Math.max(1, Math.ceil(total / DISPLAY_PAGE_SIZE));
    const pageItems = getPaginationItems(page, totalPages);
    const startIndex = total === 0 ? 0 : (page - 1) * DISPLAY_PAGE_SIZE + 1;
    const endIndex = Math.min(page * DISPLAY_PAGE_SIZE, total);

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold text-foreground">Advertisements</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Manage ad creatives, duration, and placement routing for pre/mid/post monetization.
                    </p>
                </div>
                <Link
                    href="/admin/advertisements/new"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110"
                >
                    <Plus size={15} /> New Ad
                </Link>
            </div>

            {/* Tabs + Search */}
            <div className="flex items-center justify-between gap-3">
                <div className="flex gap-1 p-1 rounded-xl bg-surface-hover/50 border border-border w-fit flex-wrap">
                    {AD_TABS.map(({ key, label, icon: Icon }) => (
                        <button
                            key={key}
                            onClick={() => setTab(key)}
                            className={`flex items-center gap-2 px-3 py-0.5 rounded-lg text-sm font-medium transition-colors ${
                                tab === key
                                    ? "bg-card text-foreground shadow-sm border border-border/50"
                                    : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            <Icon size={14} />
                            {label}
                            <span className="text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                                {counts[key]}
                            </span>
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-2">
                    <div className="relative w-72 md:w-80">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search ads…"
                            className="w-full h-9 rounded-xl bg-secondary border border-border pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                        />
                    </div>

                    <button
                        type="button"
                        onClick={() => loadAds(true)}
                        disabled={loading || refreshing}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-secondary text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-50"
                    >
                        <RefreshCw size={13} className={refreshing || loading ? "animate-spin" : ""} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm text-red-300 border border-red-500/20 bg-red-500/8">
                    <AlertTriangle size={14} /> {error}
                </div>
            )}

            {/* List */}
            <section className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="flex items-center gap-4 px-4 py-2.5 border-b border-border bg-muted/30">
                    <p className="flex-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Title</p>
                    <p className="w-48 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Type</p>
                    <p className="w-24 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground text-center">Status</p>
                    <p className="w-20 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground text-center">CTR</p>
                    <p className="w-20 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground text-center">Assigned</p>
                    <p className="w-48 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground text-center">Action</p>
                </div>

                {loading ? (
                    <div className="space-y-2 p-4">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-4 px-2 py-3 animate-pulse">
                                <div className="flex-1 h-4 bg-muted rounded" />
                                <div className="w-48 h-4 bg-muted rounded" />
                                <div className="w-24 h-5 bg-muted rounded mx-auto" />
                                <div className="w-20 h-4 bg-muted rounded mx-auto" />
                                <div className="w-20 h-4 bg-muted rounded mx-auto" />
                                <div className="w-48 h-5 bg-muted rounded mx-auto" />
                            </div>
                        ))}
                    </div>
                ) : ads.length === 0 ? (
                    <div className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
                        <Megaphone size={36} className="opacity-20" />
                        <p className="text-sm">No ads found</p>
                    </div>
                ) : (
                    ads.map((ad) => {
                        const ctr = ad.total_impressions > 0
                            ? ((ad.total_clicks / ad.total_impressions) * 100).toFixed(2)
                            : "0.00";

                        return (
                            <div key={ad.id} className="flex items-center gap-4 px-4 py-3 border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                                <div className="flex-1 min-w-0">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedAdId(ad.id);
                                            setPlacementsDrawerOpen(true);
                                        }}
                                        className={`text-left text-sm font-medium truncate ${selectedAdId === ad.id ? "text-primary" : "text-foreground"}`}
                                    >
                                        {ad.title}
                                    </button>
                                </div>
                                <p className="w-48 text-sm text-muted-foreground truncate" title={AD_TYPE_META[ad.ad_type].description}>
                                    {AD_TYPE_META[ad.ad_type].label}
                                </p>
                                <div className="w-24 flex justify-center">
                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-muted text-muted-foreground border-border capitalize">
                                        {ad.status}
                                    </span>
                                </div>
                                <p className="w-20 text-sm text-muted-foreground text-center">{ctr}%</p>
                                <div className="w-20 flex items-center justify-center gap-1">
                                    <span className="text-sm text-muted-foreground">{placementsByAd[ad.id]?.length ?? "…"}</span>
                                    <button
                                        type="button"
                                        onClick={() => setAssignedAd(ad)}
                                        className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                                        title="View assigned content"
                                        aria-label={`View assigned content for ${ad.title}`}
                                    >
                                        <Info size={14} />
                                    </button>
                                </div>
                                <div className="w-48 flex justify-center gap-1">
                                    <button
                                        type="button"
                                        onClick={() => setReportAd(ad)}
                                        className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                                        title="View report"
                                        aria-label={`View report for ${ad.title}`}
                                    >
                                        <BarChart3 size={15} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedAdId(ad.id);
                                            setPlacementsDrawerOpen(true);
                                        }}
                                        className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                                        title="Manage placements"
                                        aria-label={`Manage placements for ${ad.title}`}
                                    >
                                        <PanelRightOpen size={15} />
                                    </button>
                                    <Link
                                        href={`/admin/advertisements/${ad.id}/edit`}
                                        className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                                        title="Edit"
                                    >
                                        <Pencil size={15} color="#2a83e9" />
                                    </Link>
                                    <button
                                        type="button"
                                        onClick={() => onDelete(ad.id)}
                                        className="rounded-md p-2 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
                                        title="Delete"
                                    >
                                        <Trash2 size={15} color="#fa4b4b" />
                                    </button>
                                </div>
                            </div>
                        );
                    })
                )}
            </section>

            {/* Numbered pagination */}
            {!loading && total > 0 && (
                <div className="flex items-center justify-between gap-3">
                    <p className="w-full text-xs text-muted-foreground">
                        Showing {startIndex}–{endIndex} of {total}
                    </p>
                    {totalPages > 1 && (
                        <Pagination>
                            <PaginationContent>
                                <PaginationItem>
                                    <PaginationPrevious
                                        href="#"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            setPage((current) => Math.max(1, current - 1));
                                        }}
                                        className={page === 1 ? "pointer-events-none opacity-50" : ""}
                                    />
                                </PaginationItem>

                                {pageItems.map((value, index) => (
                                    <PaginationItem key={value === "ellipsis" ? `ellipsis-${index}` : value}>
                                        {value === "ellipsis" ? (
                                            <PaginationEllipsis />
                                        ) : (
                                            <PaginationLink
                                                href="#"
                                                isActive={page === value}
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    setPage(value);
                                                }}
                                            >
                                                {value}
                                            </PaginationLink>
                                        )}
                                    </PaginationItem>
                                ))}

                                <PaginationItem>
                                    <PaginationNext
                                        href="#"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            setPage((current) => Math.min(totalPages, current + 1));
                                        }}
                                        className={page === totalPages ? "pointer-events-none opacity-50" : ""}
                                    />
                                </PaginationItem>
                            </PaginationContent>
                        </Pagination>
                    )}
                </div>
            )}

            <Sheet open={placementsDrawerOpen} onOpenChange={setPlacementsDrawerOpen}>
                {selectedAd && (
                    <SheetContent side="right" className="flex h-dvh w-full max-w-md flex-col gap-0 rounded-none border-border bg-card !p-0 shadow-2xl">
                        <SheetHeader className="border-b border-border px-5 py-4 pr-14">
                            <div className="flex items-center gap-2">
                                <Megaphone size={14} className="text-primary" />
                                <SheetTitle className="text-sm uppercase tracking-wide">
                                    Placements
                                </SheetTitle>
                            </div>
                            <p className="pl-[22px] text-xs text-muted-foreground truncate" title={selectedAd.title}>
                                {selectedAd.title}
                            </p>
                            <SheetDescription className="sr-only">Configure advertisement placements.</SheetDescription>
                        </SheetHeader>
                        <div className="flex-1 space-y-5 overflow-y-auto p-5">

                    <div className="space-y-3">
                        <p className="text-xs font-medium text-muted-foreground">
                            Advertisement Type:{" "}
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border border-primary/20 bg-primary/10 text-primary">
                                {AD_TYPE_META[selectedAd.ad_type].label}
                            </span>
                        </p>
                        <div className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                            Placement
                            <div className="flex flex-wrap gap-2">
                                {compatiblePlacementOptions.map((opt) => {
                                    const checked = placementForm.placement_types.includes(opt.value);
                                    return (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => setPlacementForm((f) => ({
                                                ...f,
                                                placement_types: checked
                                                    ? f.placement_types.filter((v) => v !== opt.value)
                                                    : [...f.placement_types, opt.value],
                                            }))}
                                            className={`h-8 rounded-lg border px-2.5 text-xs font-medium transition-colors ${checked
                                                ? "border-primary bg-primary/10 text-primary"
                                                : "border-border text-muted-foreground hover:text-foreground"
                                                }`}
                                        >
                                            {opt.label}
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="text-[11px] font-normal normal-case text-muted-foreground/70">
                                {selectedAd ? AD_TYPE_META[selectedAd.ad_type].description : ""}
                            </p>
                        </div>
                        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                            Content type
                            <select
                                className={selectCls()}
                                value={placementForm.content_type}
                                onChange={(e) => setPlacementForm((f) => ({ ...f, content_type: e.target.value as "video" | "audio" | "series" | "live_stream" | "ppv_event" | "all" }))}
                            >
                                <option value="video">Video</option>
                                <option value="audio">Audio</option>
                                <option value="series">Series</option>
                                <option value="live_stream">Live TV</option>
                                <option value="ppv_event">PPV event</option>
                                <option value="all">All content</option>
                            </select>
                        </label>
                        {placementForm.content_type === "all" ? (
                            <p className="text-xs text-muted-foreground">Applies to all content — no specific items to select.</p>
                        ) : (
                            <div className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                                Contents
                                <div className="relative">
                                    <input
                                        className={inputCls()}
                                        placeholder="Search by title… (leave empty to apply to all)"
                                        value={contentSearchInput}
                                        onFocus={() => setContentSearchOpen(true)}
                                        onBlur={() => setTimeout(() => setContentSearchOpen(false), 120)}
                                        onChange={(e) => {
                                            setContentSearchInput(e.target.value);
                                            setContentSearchOpen(true);
                                        }}
                                    />
                                    {contentSearchOpen && !!contentSearchQuery && (
                                        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
                                            {contentSearchLoading ? (
                                                <p className="px-3 py-2 text-xs text-muted-foreground">Searching…</p>
                                            ) : contentOptions.length === 0 ? (
                                                <p className="px-3 py-2 text-xs text-muted-foreground">No matches.</p>
                                            ) : (
                                                contentOptions.map((opt) => (
                                                    <button
                                                        key={opt.id}
                                                        type="button"
                                                        onMouseDown={(e) => {
                                                            e.preventDefault();
                                                            setSelectedContentIds((prev) => (prev.includes(opt.id) ? prev : [...prev, opt.id]));
                                                            setContentSearchInput("");
                                                            setContentSearchQuery("");
                                                            setContentSearchOpen(false);
                                                        }}
                                                        className="block w-full px-3 py-2 text-left text-xs text-foreground hover:bg-secondary"
                                                    >
                                                        {opt.label}
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                    )}
                                </div>
                                {selectedContentIds.length > 0 && (
                                    <div className="flex flex-wrap gap-2 pt-1">
                                        {selectedContentIds.map((id) => (
                                            <span key={id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-xs text-foreground">
                                                {contentNameMap[id] ?? id}
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedContentIds((prev) => prev.filter((itemId) => itemId !== id))}
                                                    className="text-muted-foreground hover:text-red-400"
                                                    aria-label="Remove content"
                                                >
                                                    <X size={12} />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                            Priority
                            <input
                                type="number"
                                min={0}
                                className={inputCls()}
                                placeholder="0"
                                value={placementForm.priority}
                                onChange={(e) => setPlacementForm((f) => ({ ...f, priority: e.target.value }))}
                            />
                        </label>
                    </div>
                        </div>
                        <div className="flex items-center justify-end gap-3 border-t border-border px-5 py-4">
                            <button
                                type="button"
                                onClick={() => setPlacementsDrawerOpen(false)}
                                className="h-9 rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={placementBusy}
                                onClick={onCreatePlacement}
                                className="h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:brightness-110 disabled:opacity-60"
                            >
                                {placementBusy ? "Adding..." : "Add placement"}
                            </button>
                        </div>
                    </SheetContent>
                )}
            </Sheet>

            <Dialog open={!!reportAd} onOpenChange={(open) => { if (!open) setReportAd(null); }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <div className="flex items-center gap-2">
                            <BarChart3 size={14} className="text-primary" />
                            <DialogTitle className="text-sm uppercase tracking-wide">
                                Report for {reportAd?.title}
                            </DialogTitle>
                        </div>
                    </DialogHeader>
                    {reportLoading ? (
                        <div className="grid grid-cols-2 gap-3">
                            {Array.from({ length: 4 }).map((_, i) => (
                                <div key={i} className="rounded-lg border border-border bg-secondary/30 px-3 py-2 animate-pulse">
                                    <div className="h-3 w-16 rounded bg-muted" />
                                    <div className="h-5 w-20 rounded bg-muted mt-2" />
                                </div>
                            ))}
                        </div>
                    ) : report ? (
                        <div className="grid grid-cols-2 gap-3">
                            {[
                                ["Impressions", report.impressions.toLocaleString()],
                                ["Clicks", report.clicks.toLocaleString()],
                                ["Completions", report.completions.toLocaleString()],
                                ["Billable Revenue", report.billable_revenue.toFixed(4)],
                            ].map(([label, value]) => (
                                <div key={label} className="rounded-lg border border-border bg-secondary/30 px-3 py-2">
                                    <p className="text-[11px] text-muted-foreground">{label}</p>
                                    <p className="text-lg font-semibold text-foreground">{value}</p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">No report data available.</p>
                    )}
                </DialogContent>
            </Dialog>

            <Dialog open={!!assignedAd} onOpenChange={(open) => { if (!open) setAssignedAd(null); }}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <div className="flex items-center gap-2">
                            <Info size={14} className="text-primary" />
                            <DialogTitle className="text-sm uppercase tracking-wide">
                                Assigned content — {assignedAd?.title}
                            </DialogTitle>
                        </div>
                    </DialogHeader>
                    {(() => {
                        const items = assignedAd ? (placementsByAd[assignedAd.id] ?? []) : [];
                        if (items.length === 0) {
                            return <p className="text-sm text-muted-foreground">No placements configured for this ad.</p>;
                        }
                        return (
                            <div className="max-h-96 overflow-y-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left border-b border-border text-muted-foreground">
                                            <th className="py-2 pr-3">Content</th>
                                            <th className="py-2 pr-3">Type</th>
                                            <th className="py-2 pr-3">Placement</th>
                                            <th className="py-2 pr-3">Priority</th>
                                            <th className="py-2 pr-3"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.map((p) => {
                                            // Playback resolution currently only consults placements with content_type video|all.
                                            const isLive = !p.content_type || p.content_type === "video" || p.content_type === "all";
                                            return (
                                                <tr key={p.id} className="border-b border-border/60">
                                                    <td className="py-2 pr-3">
                                                        {!p.content_id ? (
                                                            <span className="text-muted-foreground capitalize">All {p.content_type ?? "content"}</span>
                                                        ) : contentNameMap[p.content_id] ? (
                                                            contentNameMap[p.content_id]
                                                        ) : assignedNamesLoading ? (
                                                            <span className="inline-block h-3 w-24 rounded bg-muted animate-pulse align-middle" />
                                                        ) : (
                                                            p.content_id
                                                        )}
                                                    </td>
                                                    <td className="py-2 pr-3">
                                                        <span
                                                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border capitalize ${isLive
                                                                ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                                                : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                                                }`}
                                                            title={isLive ? "Resolved during playback" : "Not resolved during playback yet — only video/all placements are wired up"}
                                                        >
                                                            {p.content_type ?? "video"}
                                                        </span>
                                                    </td>
                                                    <td className="py-2 pr-3 capitalize">{p.placement_type.replace("_", "-")}</td>
                                                    <td className="py-2 pr-3">{p.priority}</td>
                                                    <td className="py-2 pr-3">
                                                        <button
                                                            type="button"
                                                            onClick={() => onDeletePlacement(assignedAd!.id, p.id)}
                                                            className="p-1 rounded hover:bg-red-500/10 hover:text-red-400 text-muted-foreground transition-colors"
                                                            title="Remove placement"
                                                        >
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        );
                    })()}
                </DialogContent>
            </Dialog>
        </div>
    );
}
