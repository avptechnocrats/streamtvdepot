"use client";

import S3ImageField from "@/components/content/ContentImageField";
import { useEffect, useRef, useState } from "react";
import { useForm, Controller, useFieldArray, type SubmitErrorHandler } from "react-hook-form";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, AlertTriangle, X, Clapperboard, Plus, Trash2, Image, Play, Globe, Eye, ShieldCheck, Settings2, SlidersHorizontal } from "lucide-react";
import { LabeledSwitch } from "@/components/ui/labeled-switch";
import { saveSeriesEditor, listSeriesEpisodes, type SeriesOut, type SeriesCreate, listCategories, listClientPlans, VIDEO_LANGUAGES, AGE_RATINGS } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api/error-utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { S3VideoField, COUNTRY_OPTIONS } from "../../videos/_components/VideoForm";

import { AiWriteButton } from "@/components/AiWriteButton";
import { CategoryPicker } from "@/components/CategoryPicker";
import ContentTagPicker from "@/components/content/ContentTagPicker";
import EpisodeVideoField, { assetRenditionQueryOptions, episodeSourceMatches } from "@/components/content/EpisodeVideoField";
import { useToast } from "@/hooks/use-toast";

// ─── Schema ───────────────────────────────────────────────────────────────────

const schema = z.object({
    title: z.string().trim().min(1, "Title is required").max(500),
    description: z.string().optional(),
    genre: z.string().optional(),
    categories: z.array(z.string()),
    tags: z.array(z.string()),
    language: z.array(z.string()).optional(),
    content_classification: z.string(),
    age_rating: z.string(),
    rating: z.number().min(0, "Rating must be between 0 and 10").max(10, "Rating must be between 0 and 10").nullable(),
    thumbnails: z.object({ video_banner: z.string(), video_h_thumbnail: z.string(), video_w_thumbnail: z.string() }),
    trailer_type: z.enum(["upload", "url"]).nullable(),
    geo_fencing: z.object({ blocked_countries: z.array(z.string()), allowed_countries: z.array(z.string()) }),
    publish_option: z.enum(["now", "later"]),
    publish_at: z.string(),
    is_active: z.boolean(),
    is_slider: z.boolean(),
    is_series_slider: z.boolean(),
    is_category_only: z.boolean(),
    is_thumbnail: z.boolean(),
    thumbnail_url: z.string().optional(),
    trailer_url: z.string().optional(),
    access_type: z.enum(["free", "subscription", "ppv", "rental"]),
    subscription_plan_ids: z.array(z.string()),
    status: z.enum(["draft", "published", "archived"]),
    is_featured: z.boolean(),
    total_seasons: z.coerce.number().int().min(1, "At least 1 season").max(1000),
    episodes: z.array(z.object({
        id: z.string().uuid().optional(),
        title: z.string().trim().min(1, "Episode title is required").max(500),
        description: z.string(),
        season_number: z.coerce.number().int().min(1),
        episode_number: z.coerce.number().int().min(1, "Episode number must be positive"),
        duration_seconds: z.number().int().min(1).nullable(),
        video_url: z.string(),
        thumbnail_url: z.string(),
        status: z.enum(["draft", "published", "archived"]),
    })),
    deleted_episode_ids: z.array(z.string().uuid()),
}).superRefine((data, context) => {
    if (["ppv", "rental"].includes(data.access_type) && data.subscription_plan_ids.length !== 1) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["subscription_plan_ids"], message: "Select one active plan for paid series." });
    }
    if (data.publish_option === "later" && (!data.publish_at || Number.isNaN(new Date(data.publish_at).getTime()))) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["publish_at"], message: "Select a valid publication date and time." });
    }
    const numbers = new Set<string>();
    data.episodes.forEach((episode, index) => {
        const number = `${episode.season_number}:${episode.episode_number}`;
        if (numbers.has(number)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["episodes", index, "episode_number"], message: "This episode number is already used in this season." });
        numbers.add(number);
        if (episode.season_number > data.total_seasons) context.addIssue({ code: z.ZodIssueCode.custom, path: ["total_seasons"], message: "Remove or move episodes before reducing the season count." });
        if (episode.status === "published" && !episode.video_url) context.addIssue({ code: z.ZodIssueCode.custom, path: ["episodes", index, "video_url"], message: "Select a video before publishing this episode." });
    });
    if (data.trailer_type && data.trailer_url && !/^https?:\/\//i.test(data.trailer_url)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["trailer_url"], message: "Enter an HTTP or HTTPS trailer URL." });
    }
});

type FormValues = z.infer<typeof schema>;

// ─── Shared UI helpers ────────────────────────────────────────────────────────

function inputCls(hasError = false) {
    return `w-full h-9 rounded-lg bg-background border ${hasError ? "border-red-500/60" : "border-input"} px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors`;
}

function selectCls(hasError = false) {
    return `w-full h-9 rounded-lg bg-background border ${hasError ? "border-red-500/60" : "border-input"} px-3 pr-8 text-sm text-foreground appearance-auto focus:outline-none focus:ring-1 focus:ring-primary transition-colors`;
}

function textareaCls() {
    return `w-full rounded-lg bg-background border border-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none`;
}

function FieldError({ msg }: { msg?: string }) {
    if (!msg) return null;
    return <p className="text-[11px] text-red-400 mt-0.5">{msg}</p>;
}

function SectionHeading({ children }: { children: React.ReactNode }) {
    return <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">{children}</h3>;
}

// ─── Checkbox Dropdown Component ──────────────────────────────────────────────

function CheckboxDropdown({
    selected,
    onChange,
    placeholder,
    options,
    columns = 2,
}: {
    selected: string[];
    onChange: (v: string[]) => void;
    placeholder: string;
    options: { value: string; label: string }[];
    columns?: number;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
                setSearch("");
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const toggle = (val: string) => {
        if (selected.includes(val)) {
            onChange(selected.filter((v) => v !== val));
        } else {
            onChange([...selected, val]);
        }
    };

    const filtered = search.trim()
        ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
        : options;

    return (
        <div ref={ref} className="min-w-0 space-y-2">
            {/* Trigger button */}
            <div className="relative">
                <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpen((v) => !v)}
                    className={`${selectCls()} flex items-center justify-between pr-8 text-left text-muted-foreground`}
                >
                    <span className="truncate">{placeholder}</span>
                </button>
                <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                {open && (
                    <div className="absolute z-50 mt-1 w-full min-w-[240px] rounded-xl border border-border bg-card shadow-xl p-3 space-y-2">
                        {/* Search */}
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search…"
                            className="w-full h-8 rounded-lg bg-background border border-input px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                            autoFocus
                        />
                        {/* Checkbox list */}
                        <div
                            className="overflow-y-auto max-h-48"
                            style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: "2px 12px" }}
                        >
                            {filtered.length === 0 && (
                                <p className="col-span-2 text-xs text-muted-foreground py-2 text-center">No results</p>
                            )}
                            {filtered.map((opt) => (
                                <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer group py-1">
                                    <input
                                        type="checkbox"
                                        checked={selected.includes(opt.value)}
                                        onChange={() => toggle(opt.value)}
                                        className="h-3.5 w-3.5 shrink-0 rounded border-border accent-primary"
                                    />
                                    <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors truncate">{opt.label}</span>
                                </label>
                            ))}
                        </div>
                        {selected.length > 0 && (
                            <button
                                type="button"
                                onClick={() => onChange([])}
                                className="w-full text-[11px] text-muted-foreground hover:text-foreground text-center pt-1 border-t border-border"
                            >
                                Clear all
                            </button>
                        )}
                    </div>
                )}
            </div>
            {selected.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {selected.map((val) => {
                        const opt = options.find((o) => o.value === val);
                        return (
                            <span
                                key={val}
                                className="flex max-w-full items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium border border-primary/20"
                            >
                                <span className="min-w-0 break-words">{opt?.label ?? val}</span>
                                <button type="button" aria-label={`Remove ${opt?.label ?? val}`} onClick={() => toggle(val)} className="shrink-0 hover:text-primary/60">
                                    <X size={10} />
                                </button>
                            </span>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ─── S3 Thumbnail field ───────────────────────────────────────────────────────

// ─── Converter helper (used by edit page) ─────────────────────────────────────

export function seriesToFormValues(series: SeriesOut): FormValues {
    const publishDate = series.publish_at ? new Date(series.publish_at) : null;
    const localPublishDate = publishDate && !Number.isNaN(publishDate.getTime())
        ? new Date(publishDate.getTime() - publishDate.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
        : "";
    return {
        title: series.title,
        description: series.description ?? "",
        genre: series.genre ?? "",
        categories: series.categories ?? [],
        tags: series.tags ?? [],
        language: series.languages?.length ? series.languages : series.language ? [series.language] : [],
        content_classification: SERIES_CLASSIFICATIONS.includes(series.content_classification as typeof SERIES_CLASSIFICATIONS[number])
            ? series.content_classification!
            : "Series",
        age_rating: series.age_rating ?? "",
        rating: series.rating ?? null,
        thumbnails: {
            video_banner: series.thumbnails?.video_banner ?? "",
            video_h_thumbnail: series.thumbnails?.video_h_thumbnail ?? series.thumbnail_url ?? "",
            video_w_thumbnail: series.thumbnails?.video_w_thumbnail ?? "",
        },
        trailer_type: series.trailer_type ?? (series.trailer_url ? "url" : null),
        geo_fencing: series.geo_fencing ?? { blocked_countries: [], allowed_countries: [] },
        publish_option: series.publish_option ?? "now",
        publish_at: localPublishDate,
        is_active: series.is_active ?? true,
        is_slider: series.is_slider ?? false,
        is_series_slider: series.is_series_slider ?? false,
        is_category_only: series.is_category_only ?? false,
        is_thumbnail: series.is_thumbnail ?? false,
        thumbnail_url: series.thumbnail_url ?? "",
        trailer_url: series.trailer_url ?? "",
        access_type: series.access_type,
        subscription_plan_ids: series.subscription_plan_ids ?? [],
        status: series.status,
        is_featured: series.is_featured,
        total_seasons: series.total_seasons,
        episodes: [],
        deleted_episode_ids: [],
    };
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface SeriesFormProps {
    mode: "create" | "edit";
    seriesId?: string;
    defaultValues?: FormValues;
}

const DEFAULT_VALUES: FormValues = {
    title: "",
    description: "",
    genre: "",
    categories: [],
    tags: [],
    language: [],
    content_classification: "",
    age_rating: "",
    rating: null,
    thumbnails: { video_banner: "", video_h_thumbnail: "", video_w_thumbnail: "" },
    trailer_type: null,
    geo_fencing: { blocked_countries: [], allowed_countries: [] },
    publish_option: "now",
    publish_at: "",
    is_active: true,
    is_slider: false,
    is_series_slider: false,
    is_category_only: false,
    is_thumbnail: false,
    thumbnail_url: "",
    trailer_url: "",
    access_type: "free",
    subscription_plan_ids: [],
    status: "draft",
    is_featured: false,
    total_seasons: 1,
    episodes: [],
    deleted_episode_ids: [],
};

// ─── Component ────────────────────────────────────────────────────────────────

const LANGUAGE_OPTIONS = VIDEO_LANGUAGES.map((l) => ({ value: l, label: l }));
const SERIES_CLASSIFICATIONS = ["Series", "TV Shows"] as const;

export function SeriesForm({ mode, seriesId, defaultValues }: SeriesFormProps) {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const [savingAction, setSavingAction] = useState<"draft" | "publish" | null>(null);
    const [mediaTab, setMediaTab] = useState("banner");
    const [accessTab, setAccessTab] = useState("access");
    const [uploads, setUploads] = useState<Record<string, boolean>>({});
    const [episodeToRemove, setEpisodeToRemove] = useState<number | null>(null);
    const [activeSeason, setActiveSeason] = useState(1);
    const episodesInitialized = useRef(false);
    const persistedSeriesId = useRef(seriesId);
    const saveInFlight = useRef(false);
    const lastAutoDraftAttempt = useRef("");
    const pendingEpisodeLinks = useRef<{ formId: string; season: number; number: number }[]>([]);
    const { data: availableCategories = [] } = useQuery({ queryKey: ["series-editor-categories"], queryFn: async () => (await listCategories({ content_type: "series", page_size: 200 })).items });
    const { data: pricingPlans = [] } = useQuery({ queryKey: ["series-editor-plans"], queryFn: () => listClientPlans({ is_active: true }) });
    const { data: savedEpisodes, isLoading: episodesLoading, isError: episodesError, isFetchedAfterMount: episodesFetchedAfterMount, refetch: refetchEpisodes } = useQuery({
        queryKey: ["series-episodes", seriesId], queryFn: () => listSeriesEpisodes(seriesId!), enabled: mode === "edit" && !!seriesId,
        refetchOnMount: "always",
        refetchInterval: query => query.state.data?.some(episode => episode.transcode_status === "pending" || episode.transcode_status === "processing") ? 5000 : false,
    });

    const {
        register,
        handleSubmit,
        control,
        watch,
        setValue,
        setError,
        getValues,
        formState: { errors, isSubmitting },
    } = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: defaultValues ?? DEFAULT_VALUES,
    });
    const { fields: episodeFields, append: appendEpisode, remove: removeEpisode, replace: replaceEpisodes } = useFieldArray({ control, name: "episodes", keyName: "formId" });

    useEffect(() => {
        if (!savedEpisodes || !episodesFetchedAfterMount || episodesError || episodesInitialized.current) return;
        replaceEpisodes(savedEpisodes.map(episode => ({
            id: episode.id, title: episode.title, description: episode.description ?? "", season_number: episode.season_number,
            episode_number: episode.episode_number, duration_seconds: episode.duration_seconds, video_url: episode.video_url ?? "",
            thumbnail_url: episode.thumbnail_url ?? "", status: episode.status,
        })));
        setValue("total_seasons", Math.max(getValues("total_seasons"), ...savedEpisodes.map(episode => episode.season_number)));
        episodesInitialized.current = true;
    }, [savedEpisodes, episodesFetchedAfterMount, episodesError, replaceEpisodes, setValue, getValues]);

    const titleValue = watch("title");
    const languages = watch("language") ?? [];
    const accessType = watch("access_type");
    const selectedPlanIds = watch("subscription_plan_ids");

    const episodes = watch("episodes");
    const savedById = new Map((savedEpisodes ?? []).map(episode => [episode.id, episode]));
    const assetSources = [...new Set(episodes.filter(episode =>
        episode.video_url && !(savedById.get(episode.id)?.media_asset_rendition_id && episodeSourceMatches(savedById.get(episode.id), episode.video_url))
    ).map(episode => episode.video_url))];
    const assetRenditions = useQueries({ queries: assetSources.map(assetRenditionQueryOptions) });
    const assetsBySource = new Map(assetSources.map((source, index) => [source, assetRenditions[index]]));
    const episodeMedia = (episode: FormValues["episodes"][number]) => savedById.get(episode.id)?.media_asset_rendition_id && episodeSourceMatches(savedById.get(episode.id), episode.video_url)
        ? savedById.get(episode.id) : assetsBySource.get(episode.video_url)?.data;
    const episodeReady = (episode: FormValues["episodes"][number]) => !!episodeMedia(episode)?.stream_ready;
    const publishedEpisodes = episodes.filter(episode => episode.status === "published");
    const publicationReady = publishedEpisodes.length > 0 && publishedEpisodes.every(episodeReady);
    const episodeProcessingLabel = (index: number) => {
        const episode = episodes[index];
        if (!episode.video_url) return null;
        const media = episodeMedia(episode);
        if (media?.stream_ready) return "Transcoded";
        return media?.transcode_status === "pending" ? "Queued" : media?.transcode_status === "processing" ? `Transcoding ${media.transcode_progress ?? 0}%` : media?.transcode_status === "failed" ? "Failed" : assetsBySource.get(episode.video_url)?.isFetching ? "Checking media" : "Not transcoded";
    };
    const seasonCount = Math.min(1000, Math.max(1, Number(watch("total_seasons")) || 1));
    const trailerType = watch("trailer_type");
    const publishOption = watch("publish_option");
    const hasUploads = Object.values(uploads).some(Boolean);
    const busy = isSubmitting || savingAction !== null || hasUploads || (mode === "edit" && (episodesLoading || !episodesFetchedAfterMount || episodesError));
    const uploadState = (name: string, uploading: boolean) => setUploads(previous => ({ ...previous, [name]: uploading }));
    const onInvalid: SubmitErrorHandler<FormValues> = (invalid) => {
        const episodeIndex = Object.keys(invalid.episodes ?? {}).find(index => /^\d+$/.test(index));
        if (episodeIndex !== undefined) setActiveSeason(getValues("episodes")[Number(episodeIndex)].season_number);
        if (invalid.publish_at) setAccessTab("visibility");
        else if (invalid.subscription_plan_ids) setAccessTab("access");
        if (invalid.trailer_url) setMediaTab("trailer");
        setError("root", { message: "Review the highlighted fields before saving." });
    };

    const paidPlans = pricingPlans.filter((plan) =>
        accessType === "ppv" ? plan.plan_type === "ppv" : plan.plan_type === "rent"
    );

    const submitForm = async (data: FormValues, targetStatus: "draft" | "published" | "archived", automatic = false) => {
        if (busy || saveInFlight.current) return;
        saveInFlight.current = true;
        setSavingAction(targetStatus === "draft" ? "draft" : "publish");
        if (automatic) pendingEpisodeLinks.current = episodeFields.map((episode, index) => ({
            formId: episode.formId, season: data.episodes[index].season_number, number: data.episodes[index].episode_number,
        }));
        const payload: SeriesCreate = {
            title: data.title,
            description: data.description || null,
            genre: data.genre || null,
            categories: data.categories,
            tags: data.tags,
            language: (data.language && data.language.length > 0) ? data.language[0] : null,
            languages: data.language ?? [],
            content_classification: data.content_classification || null,
            age_rating: data.age_rating || null,
            rating: data.rating,
            thumbnails: data.thumbnails,
            thumbnail_url: data.thumbnails.video_h_thumbnail || null,
            trailer_type: data.trailer_type,
            trailer_url: data.trailer_type ? data.trailer_url || null : null,
            geo_fencing: { blocked_countries: data.geo_fencing.blocked_countries ?? [], allowed_countries: data.geo_fencing.allowed_countries ?? [] },
            publish_option: data.publish_option,
            publish_at: data.publish_option === "later" ? new Date(data.publish_at).toISOString() : null,
            is_active: data.is_active,
            is_slider: data.is_slider,
            is_series_slider: data.is_series_slider,
            is_category_only: data.is_category_only,
            is_thumbnail: data.is_thumbnail,
            access_type: data.access_type,
            subscription_plan_ids: data.subscription_plan_ids,
            status: targetStatus,
            is_featured: data.is_featured,
            total_seasons: data.total_seasons,
            episodes: data.episodes.map(episode => ({ ...episode, status: automatic ? "draft" : episode.status, title: episode.title, season_number: episode.season_number, episode_number: episode.episode_number, description: episode.description || null, video_url: episode.video_url || null, thumbnail_url: episode.thumbnail_url || null })),
            deleted_episode_ids: data.deleted_episode_ids,
        };
        try {
            if (mode === "create" && persistedSeriesId.current && pendingEpisodeLinks.current.length) {
                const existing = await listSeriesEpisodes(persistedSeriesId.current);
                payload.episodes = payload.episodes?.map((episode, index) => {
                    const original = pendingEpisodeLinks.current.find(item => item.formId === episodeFields[index]?.formId);
                    return { ...episode, id: episode.id ?? (original ? existing.find(item => item.season_number === original.season && item.episode_number === original.number)?.id : undefined) };
                });
                payload.deleted_episode_ids = [...new Set([
                    ...data.deleted_episode_ids,
                    ...existing.filter(episode => !payload.episodes?.some(item => item.id === episode.id)).map(episode => episode.id),
                ])];
            }
            const saved = await saveSeriesEditor(payload, persistedSeriesId.current);
            persistedSeriesId.current = saved.id;
            await queryClient.invalidateQueries({ queryKey: ["series-episodes", saved.id], refetchType: "none" });
            if (automatic) {
                setValue("status", "draft");
                const fresh = await listSeriesEpisodes(saved.id);
                data.episodes.forEach((episode, index) => {
                    const match = fresh.find(item => item.season_number === episode.season_number && item.episode_number === episode.episode_number);
                    if (match) setValue(`episodes.${index}.id`, match.id);
                });
                pendingEpisodeLinks.current = [];
                queryClient.setQueryData(["series-episodes", saved.id], fresh);
                toast({ title: "Draft saved" });
                return;
            }
            if (targetStatus === "draft") {
                if (mode === "create") {
                    router.replace(`/admin/content/series/${saved.id}/edit`);
                } else {
                    try {
                        const fresh = await listSeriesEpisodes(saved.id);
                        getValues("episodes").forEach((episode, index) => {
                            const match = fresh.find(item => item.season_number === episode.season_number && item.episode_number === episode.episode_number);
                            if (match) setValue(`episodes.${index}.id`, match.id);
                        });
                        setValue("deleted_episode_ids", []);
                        setValue("status", "draft");
                        queryClient.setQueryData(["series-episodes", saved.id], fresh);
                        toast({ title: "Draft saved" });
                    } catch {
                        router.push("/admin/content/series");
                    }
                }
                return;
            }
            router.push("/admin/content/series");
        } catch (err: unknown) {
            const response = (err as { response?: { status?: number; data?: { detail?: unknown } } })?.response;
            setError("root", { message: response?.status === 404 && response.data?.detail === "Not Found"
                ? "The series editor API is not deployed yet. Deploy the backend and run database migrations before saving."
                : getApiErrorMessage(err, "Failed to save series") });
        } finally {
            saveInFlight.current = false;
            setSavingAction(null);
        }
    };

    const { mutate: createInitialDraft } = useMutation({
        mutationFn: (data: FormValues) => submitForm(data, "draft", true),
    });
    const autoDraftSnapshot = JSON.stringify(watch());
    useEffect(() => {
        if (mode !== "create" || persistedSeriesId.current || busy || saveInFlight.current || lastAutoDraftAttempt.current === autoDraftSnapshot) return;
        const timer = setTimeout(() => {
            const values = getValues();
            const hasMedia = !!values.thumbnails.video_banner || values.episodes.some(episode => !!episode.video_url);
            if (!hasMedia || persistedSeriesId.current || saveInFlight.current) return;
            const result = schema.safeParse(values);
            if (!result.success) return;
            lastAutoDraftAttempt.current = autoDraftSnapshot;
            createInitialDraft(result.data);
        }, 800);
        return () => clearTimeout(timer);
    }, [autoDraftSnapshot, busy, createInitialDraft, getValues, mode]);

    const onSubmit = async (data: FormValues) => {
        await submitForm(data, data.status);
    };

    const handleSaveDraft = async () => {
        await handleSubmit((data) => submitForm(data, "draft"), onInvalid)();
    };

    const handlePublish = async () => {
        await handleSubmit((data) => submitForm(data, data.status === "archived" ? "archived" : "published"), onInvalid)();
    };

    return (
        <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="w-full pb-28">
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">

                {/* ══ LEFT ══ */}
                <div className="min-w-0 space-y-6 xl:col-span-2">

                    {/* Basic Info */}
                    <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
                        <SectionHeading>Basic Information</SectionHeading>

                        <div className="space-y-1">
                            <label className="block text-xs font-semibold text-muted-foreground">Title *</label>
                            <input {...register("title")} autoFocus placeholder="e.g. Breaking Bad" className={inputCls(!!errors.title)} />
                            <FieldError msg={errors.title?.message} />
                        </div>

                        <div className="space-y-1">
                            <div className="flex items-center justify-between">
                                <label className="block text-xs font-semibold text-muted-foreground">Description</label>
                                <AiWriteButton
                                    title={titleValue}
                                    hint="long"
                                    onAccept={(text) => setValue("description", text)}
                                />
                            </div>
                            <textarea
                                {...register("description")}
                                rows={4}
                                placeholder="Describe this series…"
                                className={textareaCls()}
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="block text-xs font-semibold text-muted-foreground">Categories</label>
                                <Controller
                                    name="categories"
                                    control={control}
                                    render={({ field }) => (
                                        <CategoryPicker
                                            options={availableCategories.map(category => ({ value: category.slug, label: category.name }))}
                                            selected={field.value ?? []}
                                            onChange={field.onChange}
                                        />
                                    )}
                                />
                            </div>
                            <div className="space-y-1">
                                <label htmlFor="series-classification" className="block text-xs font-semibold text-muted-foreground">Content Classification</label>
                                <select id="series-classification" {...register("content_classification")} className={selectCls()}>
                                    <option value="">Select classification</option>
                                    {SERIES_CLASSIFICATIONS.map(value => <option key={value} value={value}>{value}</option>)}
                                </select>
                            </div>
                            <div className="min-w-0 sm:col-span-2">
                                <Controller name="tags" control={control} render={({ field }) => (
                                    <ContentTagPicker selected={field.value ?? []} onChange={field.onChange} />
                                )} />
                            </div>
                            <div className="space-y-1">
                                <label htmlFor="series-age-rating" className="block text-xs font-semibold text-muted-foreground">Age Rating</label>
                                <select id="series-age-rating" {...register("age_rating")} className={selectCls()}>
                                    <option value="">Select age rating</option>
                                    {AGE_RATINGS.map(value => <option key={value} value={value}>{value}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="block text-xs font-semibold text-muted-foreground">Language</label>
                                <CheckboxDropdown
                                    selected={languages}
                                    onChange={(v) => setValue("language", v)}
                                    placeholder="+ Select languages"
                                    options={LANGUAGE_OPTIONS}
                                    columns={2}
                                />
                            </div>
                            <div className="space-y-1">
                                <label htmlFor="series-rating" className="block text-xs font-semibold text-muted-foreground">Rating (0-10)</label>
                                <Controller name="rating" control={control} render={({ field }) => <input id="series-rating" type="number" min={0} max={10} step={0.1} value={field.value ?? ""} onChange={event => field.onChange(event.target.value === "" ? null : Number(event.target.value))} placeholder="8.4" className={inputCls(!!errors.rating)} />} />
                                <FieldError msg={errors.rating?.message} />
                            </div>
                            <div className="space-y-1">
                                <label htmlFor="series-genre" className="block text-xs font-semibold text-muted-foreground">Genre</label>
                                <input id="series-genre" {...register("genre")} placeholder="e.g. Drama, Documentary" className={inputCls()} />
                            </div>
                        </div>
                    </section>

                    <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <SectionHeading>Seasons & Episodes</SectionHeading>
                            <button type="button" disabled={busy || seasonCount >= 1000} onClick={() => { setValue("total_seasons", seasonCount + 1, { shouldDirty: true }); setActiveSeason(seasonCount + 1); }} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary disabled:opacity-50"><Plus size={15} />Add Season</button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label htmlFor="series-seasons" className="block text-xs font-semibold text-muted-foreground">Total Seasons *</label>
                                <input id="series-seasons" {...register("total_seasons")} disabled={hasUploads} type="number" min={1} max={1000} className={inputCls(!!errors.total_seasons)} />
                                <FieldError msg={errors.total_seasons?.message} />
                            </div>
                            <div className="space-y-1">
                                <label htmlFor="series-season" className="block text-xs font-semibold text-muted-foreground">Season</label>
                                <select id="series-season" disabled={hasUploads} value={Math.min(activeSeason, seasonCount)} onChange={event => setActiveSeason(Number(event.target.value))} className={selectCls()}>
                                    {Array.from({ length: seasonCount }, (_, index) => <option key={index + 1} value={index + 1}>Season {index + 1}</option>)}
                                </select>
                            </div>
                        </div>
                        {(episodesLoading || !episodesFetchedAfterMount) && !episodesError && mode === "edit" && <p role="status" className="text-sm text-muted-foreground">Loading episodes...</p>}
                        {episodesError && <div role="alert" className="text-sm text-red-400">Episodes could not be loaded. <button type="button" onClick={() => void refetchEpisodes()} className="underline">Retry</button></div>}
                        {episodeFields.map((episode, index) => episodes[index]?.season_number === Math.min(activeSeason, seasonCount) && <details key={episode.formId} className="group/episode border-b border-border pb-4 last:border-b-0">
                            <summary className="flex cursor-pointer list-none items-center gap-2 py-2 text-sm font-semibold">
                                <ChevronDown size={16} className="shrink-0 -rotate-90 text-muted-foreground transition-transform group-open/episode:rotate-0" />
                                <span className="min-w-0 flex-1 break-words">Episode {episodes[index]?.episode_number}: {episodes[index]?.title || "Untitled episode"}{errors.episodes?.[index] && <span className="ml-2 text-xs font-normal text-red-400">Review episode</span>}</span>
                                {episodeProcessingLabel(index) && <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${episodeReady(episodes[index]) ? "bg-emerald-500/10 text-emerald-600" : "bg-secondary text-muted-foreground"}`}>{episodeProcessingLabel(index)}</span>}
                                <button type="button" disabled={busy} title="Remove episode" aria-label={`Remove episode ${episodes[index]?.episode_number}`} onClick={event => { event.preventDefault(); event.stopPropagation(); setEpisodeToRemove(index); }} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-red-500 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"><Trash2 size={16} /></button>
                            </summary>
                            <div className="space-y-4 pt-3">
                                <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_120px] gap-3">
                                    <div className="space-y-1"><label htmlFor={`episode-title-${episode.formId}`} className="block text-xs font-semibold text-muted-foreground">Episode Title *</label><input id={`episode-title-${episode.formId}`} {...register(`episodes.${index}.title`)} className={inputCls(!!errors.episodes?.[index]?.title)} /><FieldError msg={errors.episodes?.[index]?.title?.message} /></div>
                                    <div className="space-y-1"><label htmlFor={`episode-number-${episode.formId}`} className="block text-xs font-semibold text-muted-foreground">Episode Number *</label><input id={`episode-number-${episode.formId}`} type="number" min={1} {...register(`episodes.${index}.episode_number`)} className={inputCls(!!errors.episodes?.[index]?.episode_number)} /><FieldError msg={errors.episodes?.[index]?.episode_number?.message} /></div>
                                </div>
                                <div className="space-y-1"><label htmlFor={`episode-description-${episode.formId}`} className="block text-xs font-semibold text-muted-foreground">Description</label><textarea id={`episode-description-${episode.formId}`} {...register(`episodes.${index}.description`)} rows={2} className={textareaCls()} /></div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div className="space-y-1"><label htmlFor={`episode-season-${episode.formId}`} className="block text-xs font-semibold text-muted-foreground">Episode Season</label><select id={`episode-season-${episode.formId}`} disabled={hasUploads} {...register(`episodes.${index}.season_number`, { valueAsNumber: true, onChange: event => setActiveSeason(Number(event.target.value)) })} className={selectCls()}>{Array.from({ length: seasonCount }, (_, season) => <option key={season + 1} value={season + 1}>Season {season + 1}</option>)}</select></div>
                                    <div className="space-y-1"><label htmlFor={`episode-duration-${episode.formId}`} className="block text-xs font-semibold text-muted-foreground">Duration (seconds)</label><Controller name={`episodes.${index}.duration_seconds`} control={control} render={({ field }) => <input id={`episode-duration-${episode.formId}`} type="number" min={1} step={1} value={field.value ?? ""} onChange={event => field.onChange(event.target.value === "" ? null : Number(event.target.value))} className={inputCls(!!errors.episodes?.[index]?.duration_seconds)} />} /><FieldError msg={errors.episodes?.[index]?.duration_seconds?.message} /></div>
                                    <div className="space-y-1"><label htmlFor={`episode-status-${episode.formId}`} className="block text-xs font-semibold text-muted-foreground">Episode Status</label><select id={`episode-status-${episode.formId}`} {...register(`episodes.${index}.status`)} className={selectCls()}><option value="draft">Draft</option><option value="published" disabled={!episodeReady(episodes[index])}>Published</option><option value="archived">Archived</option></select></div>
                                </div>
                                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" data-episode-media>
                                    <div className="min-w-0">
                                        <Controller name={`episodes.${index}.video_url`} control={control} render={({ field }) => <EpisodeVideoField episode={savedById.get(episodes[index]?.id)} seriesId={seriesId} value={field.value} onChange={field.onChange} onUploadStateChange={uploading => uploadState(episode.formId, uploading)} onDurationDetected={seconds => setValue(`episodes.${index}.duration_seconds`, Math.max(1, Math.round(seconds)), { shouldDirty: true })} />} />
                                        <FieldError msg={errors.episodes?.[index]?.video_url?.message} />
                                    </div>
                                    <div className="min-w-0">
                                        <Controller name={`episodes.${index}.thumbnail_url`} control={control} render={({ field }) => <S3ImageField label="Episode Thumbnail (optional)" hint="16:9 episode artwork" aspect="16:9" value={field.value} onChange={field.onChange} />} />
                                    </div>
                                </div>
                            </div>
                        </details>)}
                        {!episodes.some(episode => episode.season_number === Math.min(activeSeason, seasonCount)) && !episodesLoading && <p className="text-sm text-muted-foreground">No episodes in this season.</p>}
                        <button type="button" disabled={busy} onClick={() => {
                            const season = Math.min(activeSeason, seasonCount);
                            const lastNumber = Math.max(0, ...episodes.filter(episode => episode.season_number === season).map(episode => Number(episode.episode_number) || 0));
                            appendEpisode({ title: "", description: "", season_number: season, episode_number: lastNumber + 1, duration_seconds: null, video_url: "", thumbnail_url: "", status: "draft" });
                        }} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary disabled:opacity-50"><Plus size={15} />Add Episode</button>
                    </section>

                    <Tabs value={accessTab} onValueChange={setAccessTab} className="w-full">
                        <TabsList className="mb-4 grid w-full grid-cols-3">
                            <TabsTrigger value="access" className="gap-1.5 px-2 text-xs sm:text-sm"><ShieldCheck size={14} className="hidden sm:block" />User Access</TabsTrigger>
                            <TabsTrigger value="geo" className="gap-1.5 px-2 text-xs sm:text-sm"><Globe size={14} className="hidden sm:block" />Geo Fencing</TabsTrigger>
                            <TabsTrigger value="visibility" className="gap-1.5 px-2 text-xs sm:text-sm"><Eye size={14} className="hidden sm:block" />Visibility</TabsTrigger>
                        </TabsList>
                        <TabsContent value="access">
                            <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
                                <SectionHeading>User Access</SectionHeading>
                                <label htmlFor="series-access" className="block text-xs font-semibold text-muted-foreground">Access Type</label>
                                <select id="series-access" {...register("access_type", { onChange: () => setValue("subscription_plan_ids", [], { shouldDirty: true, shouldValidate: true }) })} className={selectCls()}><option value="free">Free</option><option value="subscription">Subscription</option><option value="ppv">Paid - one-time purchase</option><option value="rental">Paid - time-limited rental</option></select>
                                {accessType === "subscription" && <p className="text-xs text-muted-foreground">Active subscription plans that include this series or its categories grant access to every episode.</p>}
                                {(accessType === "ppv" || accessType === "rental") && <div className="space-y-2">
                                    <label className="block text-xs font-semibold text-muted-foreground">{accessType === "ppv" ? "One-time purchase plan" : "Rental plan"}</label>
                                    {paidPlans.length ? paidPlans.map(plan => <label key={plan.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-2.5"><input type="radio" name="series_purchase_plan" checked={selectedPlanIds.includes(plan.id)} onChange={() => setValue("subscription_plan_ids", [plan.id], { shouldDirty: true, shouldValidate: true })} className="h-3.5 w-3.5 accent-primary" /><span className="min-w-0 text-xs"><span className="block truncate font-medium">{plan.name}</span><span className="text-muted-foreground">{plan.currency} {plan.price}</span></span></label>) : <p className="text-xs text-muted-foreground">No active matching pricing plans are available.</p>}
                                    <FieldError msg={errors.subscription_plan_ids?.message} />
                                </div>}
                            </section>
                        </TabsContent>
                        <TabsContent value="geo"><section className="rounded-2xl border border-border bg-card p-6 space-y-4"><SectionHeading>Geo Fencing</SectionHeading><label className="block text-xs font-semibold text-muted-foreground">Blocked Countries</label><CheckboxDropdown selected={watch("geo_fencing.blocked_countries")} onChange={values => setValue("geo_fencing.blocked_countries", values, { shouldDirty: true })} placeholder="+ Select countries" options={COUNTRY_OPTIONS} /><p className="text-xs text-muted-foreground">Leave empty for worldwide access.</p></section></TabsContent>
                        <TabsContent value="visibility"><section className="rounded-2xl border border-border bg-card p-6 space-y-4"><SectionHeading>Visibility</SectionHeading>
                            <Controller name="publish_option" control={control} render={({ field }) => <div className="flex flex-wrap gap-4">{(["now", "later"] as const).map(value => <label key={value} className="flex items-center gap-2 text-sm"><input type="radio" name={field.name} value={value} checked={field.value === value} onChange={() => field.onChange(value)} className="accent-primary" />{value === "now" ? "Publish Now" : "Schedule"}</label>)}</div>} />
                            {publishOption === "later" && <div className="space-y-1"><label htmlFor="series-publish-at" className="block text-xs font-semibold text-muted-foreground">Publish At</label><input id="series-publish-at" type="datetime-local" {...register("publish_at")} className={inputCls(!!errors.publish_at)} /><FieldError msg={errors.publish_at?.message} /></div>}
                        </section></TabsContent>
                    </Tabs>

                </div>

                {/* ══ RIGHT ══ */}
                <div className="min-w-0 space-y-6 xl:sticky xl:top-8">

                    <Tabs value={mediaTab} onValueChange={setMediaTab} className="w-full">
                        <TabsList className="mb-4 grid w-full grid-cols-3">
                            <TabsTrigger disabled={hasUploads} value="banner" className="gap-1.5 px-2"><Image size={14} />Banner</TabsTrigger>
                            <TabsTrigger disabled={hasUploads} value="thumbnail" className="gap-1.5 px-2"><Image size={14} />Thumbnail</TabsTrigger>
                            <TabsTrigger disabled={hasUploads} value="trailer" className="gap-1.5 px-2"><Play size={14} />Trailer</TabsTrigger>
                        </TabsList>
                        <TabsContent value="banner"><section className="rounded-2xl border border-border bg-card p-6 space-y-4"><SectionHeading>Banner</SectionHeading><Controller name="thumbnails.video_banner" control={control} render={({ field }) => <S3ImageField label="Series Banner (1920 x 1080 px)" hint="16:9 artwork for hero and detail pages" aspect="16:9" value={field.value} onChange={field.onChange} />} /></section></TabsContent>
                        <TabsContent value="thumbnail"><section className="rounded-2xl border border-border bg-card p-6 space-y-6"><SectionHeading>Thumbnails</SectionHeading><Controller name="thumbnails.video_h_thumbnail" control={control} render={({ field }) => <S3ImageField label="Portrait Thumbnail (600 x 900 px)" hint="2:3 series poster" aspect="2:3" value={field.value} onChange={field.onChange} />} /><Controller name="thumbnails.video_w_thumbnail" control={control} render={({ field }) => <S3ImageField label="Wide Thumbnail (1200 x 800 px)" hint="3:2 wide card" aspect="3:2" value={field.value} onChange={field.onChange} />} /></section></TabsContent>
                        <TabsContent value="trailer"><section className="rounded-2xl border border-border bg-card p-6 space-y-4"><SectionHeading>Trailer</SectionHeading><Controller name="trailer_type" control={control} render={({ field }) => <select aria-label="Trailer source" disabled={hasUploads} value={field.value ?? "none"} onChange={event => field.onChange(event.target.value === "none" ? null : event.target.value)} className={selectCls()}><option value="none">None</option><option value="upload">Upload / Media Library</option><option value="url">URL</option></select>} />{trailerType === "url" && <input aria-label="Trailer URL" {...register("trailer_url")} placeholder="https://youtube.com/watch?v=..." className={inputCls(!!errors.trailer_url)} />}{trailerType === "upload" && <Controller name="trailer_url" control={control} render={({ field }) => <S3VideoField label="Trailer File" hint="Upload a trailer or select one from Media Library" accept="video/*" value={field.value ?? ""} previewSourceOnly onChange={field.onChange} onUploadStateChange={uploading => uploadState("trailer", uploading)} />} />}<FieldError msg={errors.trailer_url?.message} /></section></TabsContent>
                    </Tabs>
                    <Tabs defaultValue="series-settings" className="w-full">
                        <TabsList className="mb-4 grid w-full grid-cols-2">
                            <TabsTrigger value="series-settings" className="gap-1.5 px-2"><Settings2 size={14} />Series Settings</TabsTrigger>
                            <TabsTrigger value="slider-settings" className="gap-1.5 px-2"><SlidersHorizontal size={14} />Slider Settings</TabsTrigger>
                        </TabsList>
                        <TabsContent value="series-settings">
                            <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
                                <label htmlFor="series-status" className="block text-xs font-semibold text-muted-foreground">Status</label>
                                <select id="series-status" {...register("status")} className={selectCls()}>
                                    <option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option>
                                </select>
                                <div className="space-y-2">
                                    {([
                                        ["is_active", "Active", "Inactive series are hidden from users"],
                                        ["is_featured", "Featured", "Show in featured / hero sections"],
                                        ["is_category_only", "Category Only View", "List only in category row"],
                                        ["is_thumbnail", "Thumbnail View", "Prefer thumbnail-first layout"],
                                    ] as const).map(([name, label, description], index) => (
                                        <div key={name}>
                                            {index > 0 && <div className="border-t border-border" />}
                                            <Controller name={name} control={control} render={({ field }) => (
                                                <LabeledSwitch checked={field.value} onCheckedChange={field.onChange} label={label} description={description} />
                                            )} />
                                        </div>
                                    ))}
                                </div>
                            </section>
                        </TabsContent>
                        <TabsContent value="slider-settings">
                            <section className="rounded-2xl border border-border bg-card p-6 space-y-2">
                                <Controller name="is_slider" control={control} render={({ field }) => (
                                    <LabeledSwitch checked={field.value} onCheckedChange={field.onChange} label="Homepage Slider" description="Include in homepage slider" />
                                )} />
                                <div className="border-t border-border" />
                                <Controller name="is_series_slider" control={control} render={({ field }) => (
                                    <LabeledSwitch checked={field.value} onCheckedChange={field.onChange} label="Series Slider" description="Include in Series page slider" />
                                )} />
                            </section>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>

            <AlertDialog open={episodeToRemove !== null} onOpenChange={open => { if (!open) setEpisodeToRemove(null); }}>
                <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove episode?</AlertDialogTitle><AlertDialogDescription>The episode will be removed when you save the series. Its media file will remain in Media Library.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => {
                    if (episodeToRemove === null) return;
                    const episode = getValues(`episodes.${episodeToRemove}`);
                    if (episode.id) setValue("deleted_episode_ids", [...getValues("deleted_episode_ids"), episode.id], { shouldDirty: true });
                    removeEpisode(episodeToRemove);
                    setEpisodeToRemove(null);
                }}>Remove Episode</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
            </AlertDialog>

            {errors.root && (
                <div className="flex items-center gap-2 rounded-lg px-4 py-3 mt-4 text-sm text-red-300 border border-red-500/20 bg-red-500/8">
                    <AlertTriangle size={14} /> {errors.root.message}
                </div>
            )}

            <div className="fixed flex justify-end w-full z-30 items-center bottom-0 left-0 gap-2 px-6 p-2.5 border-t border-border/50 bg-background">
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => { void handleSaveDraft(); }}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border bg-card text-foreground text-sm font-semibold hover:bg-secondary transition-colors disabled:opacity-50"
                >
                    {isSubmitting && savingAction === "draft" && <Loader2 size={14} className="animate-spin" />}
                    Save Draft
                </button>
                <button
                    type="button"
                    disabled={busy || (watch("status") !== "archived" && !publicationReady)}
                    title={publicationReady ? undefined : publishedEpisodes.length === 0 ? "Mark at least one transcoded episode as Published" : "Wait for all published episodes to finish transcoding"}
                    onClick={() => { void handlePublish(); }}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition-all disabled:opacity-50"
                >
                    {isSubmitting && savingAction === "publish" && <Loader2 size={14} className="animate-spin" />}
                    {watch("status") === "published" || watch("status") === "archived" ? "Save Changes" : "Publish Series"}
                </button>
                <button
                    type="button"
                    disabled={isSubmitting || hasUploads}
                    onClick={() => router.push("/admin/content/series")}
                    className="px-4 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                >
                    Cancel
                </button>
            </div>
        </form>
    );
}
