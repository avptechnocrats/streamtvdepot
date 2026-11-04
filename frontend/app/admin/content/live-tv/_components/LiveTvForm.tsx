"use client";

import S3ImageField from "@/components/content/ContentImageField";
import { useEffect, useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { ChevronDown, Globe, Loader2, AlertTriangle, CheckCircle2, X, Tv2, Image } from "lucide-react";
import { LabeledSwitch } from "@/components/ui/labeled-switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createLiveTvChannel, updateLiveTvChannel, updateLiveTvOptions, getLiveTvPipelines, type LiveTvChannelCreate, type LiveTvPipelinesOut, LIVE_TV_SOURCES, listCategories, type CategoryOut, listClientPlans, type ClientPricingPlanOut, VIDEO_LANGUAGES } from "@/lib/api";
import { slugify } from "../../videos/_components/utils";

import { AiWriteButton } from "@/components/AiWriteButton";
import { CategoryPicker } from "@/components/CategoryPicker";

// ─── Countries ──────────────────────────────────────────────────────────────

const COUNTRIES = [
    { code: "US", name: "United States" }, { code: "GB", name: "United Kingdom" },
    { code: "CA", name: "Canada" }, { code: "AU", name: "Australia" },
    { code: "DE", name: "Germany" }, { code: "FR", name: "France" },
    { code: "IN", name: "India" }, { code: "CN", name: "China" },
    { code: "JP", name: "Japan" }, { code: "KR", name: "South Korea" },
    { code: "BR", name: "Brazil" }, { code: "MX", name: "Mexico" },
    { code: "AE", name: "UAE" }, { code: "SA", name: "Saudi Arabia" },
    { code: "EG", name: "Egypt" }, { code: "ZA", name: "South Africa" },
    { code: "NG", name: "Nigeria" }, { code: "RU", name: "Russia" },
    { code: "IT", name: "Italy" }, { code: "ES", name: "Spain" },
    { code: "NL", name: "Netherlands" }, { code: "SE", name: "Sweden" },
    { code: "NO", name: "Norway" }, { code: "PK", name: "Pakistan" },
    { code: "ID", name: "Indonesia" }, { code: "TR", name: "Turkey" },
    { code: "AR", name: "Argentina" }, { code: "CO", name: "Colombia" },
    { code: "SG", name: "Singapore" }, { code: "MY", name: "Malaysia" },
    { code: "TH", name: "Thailand" }, { code: "PH", name: "Philippines" },
];

const COUNTRY_OPTIONS = COUNTRIES.map((c) => ({ value: c.code, label: c.name }));
const LANGUAGE_OPTIONS = VIDEO_LANGUAGES.map((l) => ({ value: l, label: l }));
const REGIONS = ["Caribbean", "South America", "North America", "Europe", "Asia", "Africa", "Middle East", "Australia"] as const;

// ─── Schema ───────────────────────────────────────────────────────────────────

const schema = z.object({
    title: z.string().min(1, "Title is required"),
    slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Only lowercase, numbers, hyphens"),
    description: z.string().optional(),
    region: z.array(z.enum(REGIONS)),
    categories: z.array(z.string()),  // category slugs
    language: z.array(z.string()).optional(),
    // SRT will implement in future.
    source: z.enum(["rtmp", "external"], { required_error: "Source is required" }),
    stream_url: z.string().optional(),
    is_active: z.boolean(),
    is_featured: z.boolean(),
    is_live: z.boolean(),
    banner: z.string().optional(),
    portrait: z.string().optional(),
    wide: z.string().optional(),
    square: z.string().optional(),
    geo_fencing: z.object({ blocked_countries: z.array(z.string()) }),
    access_type: z.enum(["free", "subscription", "pay_per_view"]),
    subscription_plan_ids: z.array(z.string()),
    // Managed live pipeline options (RTMP channels only)
    pipeline: z.enum(["legacy", "aws"]),
    ads_enabled: z.boolean(),
    record_vod: z.boolean(),
    managed: z.boolean(),
}).refine((data) => data.source !== "external" || (!!data.stream_url && data.stream_url.trim().length > 0), {
    message: "Stream URL is required for External Live Feed",
    path: ["stream_url"],
});

type FormValues = z.infer<typeof schema>;

// ─── Shared UI helpers ────────────────────────────────────────────────────────

function inputCls(hasError = false, lightBackground = false) {
    return `w-full h-9 rounded-lg ${lightBackground ? "bg-background" : "bg-secondary"} border ${hasError ? "border-red-500/60" : "border-border"} px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors`;
}

function selectCls(hasError = false, lightBackground = false) {
    return `w-full h-9 rounded-lg ${lightBackground ? "bg-background" : "bg-secondary"} border ${hasError ? "border-red-500/60" : "border-border"} px-3 pr-8 text-sm text-foreground appearance-none focus:outline-none focus:ring-1 focus:ring-primary transition-colors`;
}

function textareaCls() {
    return `w-full rounded-lg bg-background border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none`;
}

function FieldError({ msg }: { msg?: string }) {
    if (!msg) return null;
    return <p className="text-[11px] text-red-400 mt-0.5">{msg}</p>;
}

function SectionHeading({ children }: { children: React.ReactNode }) {
    return <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">{children}</h3>;
}

// ─── CheckboxDropdown ─────────────────────────────────────────────────────────

function CheckboxDropdown({
    selected,
    onChange,
    placeholder,
    options,
    columns = 2,
    lightBackground = false,
}: {
    selected: string[];
    onChange: (v: string[]) => void;
    placeholder: string;
    options: { value: string; label: string }[];
    columns?: number;
    lightBackground?: boolean;
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
        <div ref={ref} className="space-y-2">
            {selected.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {selected.map((val) => {
                        const opt = options.find((o) => o.value === val);
                        return (
                            <span
                                key={val}
                                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium border border-primary/20"
                            >
                                {opt?.label ?? val}
                                <button type="button" onClick={() => toggle(val)} className="hover:text-primary/60">
                                    <X size={10} />
                                </button>
                            </span>
                        );
                    })}
                </div>
            )}
            <div className="relative">
                <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    className={`${selectCls(false, lightBackground)} flex items-center justify-between pr-8 text-left ${lightBackground ? "" : "text-muted-foreground"}`}
                >
                    <span className="truncate">{placeholder}</span>
                </button>
                <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                {open && (
                    <div className="absolute z-50 mt-1 w-full min-w-[240px] rounded-xl border border-border bg-card shadow-xl p-3 space-y-2">
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search…"
                            className={`w-full h-8 rounded-lg ${lightBackground ? "bg-background" : "bg-secondary"} border border-border px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary`}
                            autoFocus
                        />
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
        </div>
    );
}

// ─── Props ────────────────────────────────────────────────────────────────────

// ─── Data mapper ─────────────────────────────────────────────────────────────

// ─── Props ────────────────────────────────────────────────────────────────────
// ─── Data mapper ─────────────────────────────────────────────────────────────
import type { LiveTvChannelOut } from "@/lib/api";

export function liveTvChannelToFormValues(c: LiveTvChannelOut): FormValues {
    return {
        title: c.title,
        slug: c.slug,
        description: c.description ?? "",
        region: c.region ?? [],
        categories: c.categories ?? [],
        language: c.language ?? [],
        source: c.source as "rtmp" | "external",
        stream_url: c.stream_url ?? "",
        is_active: c.is_active,
        is_featured: c.is_featured,
        is_live: c.is_live,
        banner: c.thumbnails?.banner ?? "",
        portrait: c.thumbnails?.portrait ?? "",
        wide: c.thumbnails?.wide ?? "",
        square: c.thumbnails?.square ?? "",
        geo_fencing: c.geo_fencing ?? { blocked_countries: [] },
        access_type: (c.access_type as "free" | "subscription" | "pay_per_view") ?? "free",
        subscription_plan_ids: c.subscription_plan_ids ?? [],
        pipeline: c.managed ? "aws" : "legacy",
        ads_enabled: c.managed?.options.ads_enabled ?? false,
        record_vod: c.managed?.options.record_vod ?? true,
        managed: !!c.managed,
    };
}

// ─────────────────────────────────────────────────────────────────────────────

interface LiveTvFormProps {
    mode: "create" | "edit";
    channelId?: string;
    defaultValues?: FormValues;
}

const DEFAULT_VALUES: FormValues = {
    title: "",
    slug: "",
    description: "",
    region: [],
    categories: [],
    language: [],
    source: "rtmp",
    stream_url: "",
    is_active: true,
    is_featured: false,
    is_live: false,
    banner: "",
    portrait: "",
    wide: "",
    square: "",
    pipeline: "legacy",
    ads_enabled: false,
    record_vod: true,
    managed: false,
    geo_fencing: { blocked_countries: [] },
    access_type: "free",
    subscription_plan_ids: [],
};

// ─── Component ────────────────────────────────────────────────────────────────

export function LiveTvForm({ mode, channelId, defaultValues }: LiveTvFormProps) {
    const router = useRouter();
    const [categories, setCategories] = useState<CategoryOut[]>([]);

    const {
        register,
        handleSubmit,
        control,
        watch,
        setValue,
        setError,
        formState: { errors, isSubmitting },
    } = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: defaultValues ?? DEFAULT_VALUES,
    });

    const titleValue = watch("title");
    const source = watch("source");
    const blockedCountries = watch("geo_fencing.blocked_countries");
    const accessType = watch("access_type");
    const pipeline = watch("pipeline");
    const slugSetByUser = useRef(false);
    const [plans, setPlans] = useState<ClientPricingPlanOut[]>([]);
    const [pipelines, setPipelines] = useState<LiveTvPipelinesOut | null>(null);

    useEffect(() => {
        if (mode !== "create") return;
        getLiveTvPipelines()
            .then((p) => { setPipelines(p); setValue("pipeline", p.default); })
            .catch(() => { /* keep the legacy default */ });
    }, [mode, setValue]);

    useEffect(() => {
        listClientPlans().then(setPlans).catch(() => { /* ignore */ });
    }, []);

    useEffect(() => {
        listCategories({ content_type: "livestream", page_size: 200 })
            .then((res) => setCategories(res.items))
            .catch(() => { /* silently ignore */ });
    }, []);

    // Re-apply categories after options load (edit mode: select has no options at mount time)
    useEffect(() => {
        if (mode === "edit" && defaultValues?.categories && categories.length > 0) {
            setValue("categories", defaultValues.categories);
        }
    }, [categories, mode, defaultValues, setValue]);

    useEffect(() => {
        if (mode === "create" && !slugSetByUser.current && titleValue) {
            setValue("slug", slugify(titleValue), { shouldValidate: false });
        }
    }, [titleValue, mode, setValue]);

    const onSubmit = async (data: FormValues) => {
        const payload: LiveTvChannelCreate = {
            title: data.title,
            slug: data.slug,
            description: data.description || null,
            region: data.region,
            categories: data.categories,
            language: data.language ?? [],
            source: data.source,
            stream_url: data.stream_url || null,
            thumbnails: {
                banner: data.banner || null,
                portrait: data.portrait || null,
                wide: data.wide || null,
                square: data.square || null,
            },
            is_active: data.is_active,
            is_featured: data.is_featured,
            is_live: data.is_live,
            geo_fencing: { blocked_countries: data.geo_fencing.blocked_countries },
            access_type: data.access_type,
            subscription_plan_ids: data.access_type === "subscription" ? [] : data.subscription_plan_ids,
        };
        const liveOptions = { ads_enabled: data.ads_enabled, record_vod: data.record_vod };
        if (mode === "create" && data.source === "rtmp") {
            payload.pipeline = data.pipeline;
            if (data.pipeline === "aws") payload.live_options = liveOptions;
        }
        try {
            if (mode === "edit" && channelId) {
                await updateLiveTvChannel(channelId, payload);
                if (data.managed && data.source === "rtmp") await updateLiveTvOptions(channelId, liveOptions);
            } else {
                await createLiveTvChannel(payload);
            }
            router.push("/admin/content/live-tv");
        } catch (err: unknown) {
            setError("root", { message: err instanceof Error ? err.message : "Failed to save channel" });
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="w-full">
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_450px] gap-6 items-start mb-14">

                {/* ══════════════ LEFT COLUMN ══════════════ */}
                <div className="space-y-6">

                    {/* ── Basic Information ─────────────────────────────────── */}
                    <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
                        <SectionHeading>Basic Information</SectionHeading>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="block text-xs font-semibold text-muted-foreground">Title *</label>
                                <input {...register("title")} autoFocus placeholder="e.g. Sports News 24" className={inputCls(!!errors.title, true)} />
                                <FieldError msg={errors.title?.message} />
                            </div>
                            <div className="space-y-1">
                                <label className="block text-xs font-semibold text-muted-foreground">Slug *</label>
                                <input
                                    {...register("slug", { onChange: () => { slugSetByUser.current = true; } })}
                                    placeholder="sports-news-24"
                                    disabled={mode === "edit"}
                                    className={`${inputCls(!!errors.slug)} disabled:opacity-40`}
                                />
                                <FieldError msg={errors.slug?.message} />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <div className="flex items-center justify-between">
                                <label className="block text-xs font-semibold text-muted-foreground">Description</label>
                                <AiWriteButton
                                    title={titleValue}
                                    category={categories.find(c => c.slug === watch("categories")[0])?.name}
                                    hint="long"
                                    onAccept={(text) => setValue("description", text)}
                                />
                            </div>
                            <textarea
                                {...register("description")}
                                rows={4}
                                placeholder="Describe this live TV channel…"
                                className={textareaCls()}
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="block text-xs font-semibold text-muted-foreground">Categories</label>
                            <Controller
                                name="categories"
                                control={control}
                                render={({ field }) => (
                                    <CategoryPicker
                                        options={categories.map(category => ({ value: category.slug, label: category.name }))}
                                        selected={field.value ?? []}
                                        onChange={field.onChange}
                                    />
                                )}
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="block text-xs font-semibold text-muted-foreground">Region</label>
                            <CheckboxDropdown
                                selected={watch("region")}
                                onChange={(value) => setValue("region", value as FormValues["region"])}
                                placeholder="+ Select regions"
                                lightBackground
                                options={REGIONS.map((region) => ({ value: region, label: region }))}
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="block text-xs font-semibold text-muted-foreground">Language</label>
                            <CheckboxDropdown
                                selected={watch("language") ?? []}
                                onChange={(v) => setValue("language", v)}
                                placeholder="+ Select languages"
                                lightBackground
                                options={LANGUAGE_OPTIONS}
                                columns={2}
                            />
                        </div>
                    </section>

                    {/* ── Stream Source ─────────────────────────────────────── */}
                    <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
                        <SectionHeading>
                            <Tv2 size={14} className="inline mr-1 -mt-0.5" />
                            Stream Source
                        </SectionHeading>
                        <p className="text-xs text-muted-foreground">
                            Choose how this channel receives its live stream.
                        </p>

                        <Controller
                            name="source"
                            control={control}
                            render={({ field }) => (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {LIVE_TV_SOURCES.map((src) => (
                                        <button
                                            key={src.value}
                                            type="button"
                                            onClick={() => field.onChange(src.value)}
                                            className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-colors ${field.value === src.value
                                                ? "border-primary bg-primary/5 text-foreground"
                                                : "border-border hover:border-primary/40 text-muted-foreground hover:text-foreground"
                                                }`}
                                        >
                                            <span className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${field.value === src.value ? "border-primary" : "border-muted-foreground/40"}`}>
                                                {field.value === src.value && <span className="w-2 h-2 rounded-full bg-primary" />}
                                            </span>
                                            <span className="text-sm font-medium leading-snug">{src.label}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        />
                        <FieldError msg={errors.source?.message} />

                        {/* Stream URL — shown for external source */}
                        {source === "external" && (
                            <div className="space-y-1">
                                <label className="block text-xs font-semibold text-muted-foreground">Stream URL (M3U8 / HLS)</label>
                                <input
                                    {...register("stream_url")}
                                    placeholder="https://example.com/stream.m3u8"
                                    className={inputCls(!!errors.stream_url, true)}
                                />
                                <FieldError msg={errors.stream_url?.message} />
                            </div>
                        )}
                        {/* Streaming engine — RTMP channels only; fixed once the channel exists */}
                        {source === "rtmp" && (
                            <div className="space-y-2">
                                <label className="block text-xs font-semibold text-muted-foreground">Streaming engine</label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {([
                                        { value: "legacy", label: "Legacy RTMP server", hint: "Our own RTMP server. Simple, limited audience size.", status: pipelines?.legacy },
                                        { value: "aws", label: "AWS MediaLive", hint: "Managed, scalable to large audiences, with server-side ads and VOD recording.", status: pipelines?.aws },
                                    ] as const).map((opt) => {
                                        const unavailable = mode === "create" && pipelines != null && !opt.status?.available;
                                        const selected = pipeline === opt.value;
                                        const locked = mode === "edit";
                                        return (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                disabled={locked || unavailable}
                                                onClick={() => setValue("pipeline", opt.value, { shouldDirty: true })}
                                                className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-colors disabled:cursor-not-allowed ${selected
                                                    ? "border-primary bg-primary/5 text-foreground"
                                                    : "border-border text-muted-foreground"} ${locked || unavailable ? "opacity-60" : "hover:border-primary/40 hover:text-foreground"}`}
                                            >
                                                <span className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${selected ? "border-primary" : "border-muted-foreground/40"}`}>
                                                    {selected && <span className="w-2 h-2 rounded-full bg-primary" />}
                                                </span>
                                                <span className="space-y-0.5">
                                                    <span className="block text-sm font-medium leading-snug">{opt.label}</span>
                                                    <span className="block text-[11px] font-normal text-muted-foreground">
                                                        {unavailable ? `Not configured on this server (${opt.status?.missing.join(", ")})` : opt.hint}
                                                    </span>
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                                {mode === "edit" && (
                                    <p className="text-[11px] text-muted-foreground">The streaming engine can&apos;t be changed after the channel is created.</p>
                                )}
                            </div>
                        )}

                        {/* AWS options — ads and VOD recording */}
                        {source === "rtmp" && pipeline === "aws" && (mode === "create" || watch("managed")) && (
                            <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                                <Controller name="ads_enabled" control={control} render={({ field }) => (
                                    <LabeledSwitch checked={field.value} onCheckedChange={field.onChange} label="Server-side ads" description="Insert ad breaks into the live stream (seamless, ad-blocker proof)" />
                                )} />
                                <div className="border-t border-border" />
                                <Controller name="record_vod" control={control} render={({ field }) => (
                                    <LabeledSwitch checked={field.value} onCheckedChange={field.onChange} label="Save broadcast as VOD" description="When the channel stops, export the recording as a draft video" />
                                )} />
                            </div>
                        )}
                    </section>

                    {/* ── Geo Fencing ───────────────────────────────────────── */}
                    <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
                        <SectionHeading>
                            <Globe size={14} className="inline mr-1 -mt-0.5" />
                            Geo Fencing
                        </SectionHeading>
                        <div className="space-y-2">
                            <label className="block text-xs font-semibold text-red-400/80">Blocked Countries</label>
                            <CheckboxDropdown
                                selected={blockedCountries}
                                onChange={(v) => setValue("geo_fencing.blocked_countries", v)}
                                placeholder="+ Select countries"
                                lightBackground
                                options={COUNTRY_OPTIONS}
                                columns={2}
                            />
                        </div>
                        <p className="text-[11px] text-muted-foreground">Leave empty for worldwide access.</p>
                    </section>

                    {/* ── Monetization ──────────────────────────────────────── */}
                    <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
                        <SectionHeading>Monetization</SectionHeading>
                        <Controller
                            name="access_type"
                            control={control}
                            render={({ field }) => (
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    {([
                                        { value: "free", label: "Free" },
                                        { value: "subscription", label: "Subscription" },
                                        { value: "pay_per_view", label: "Pay Per View" },
                                    ] as const).map((opt) => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => {
                                                field.onChange(opt.value);
                                                setValue("subscription_plan_ids", []);
                                            }}
                                            className={`flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-colors ${field.value === opt.value
                                                ? "border-primary bg-primary/5 text-foreground"
                                                : "border-border hover:border-primary/40 text-muted-foreground hover:text-foreground"
                                                }`}
                                        >
                                            <span className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${field.value === opt.value ? "border-primary" : "border-muted-foreground/40"}`}>
                                                {field.value === opt.value && <span className="w-2 h-2 rounded-full bg-primary" />}
                                            </span>
                                            <span className="text-sm font-medium leading-snug">{opt.label}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        />

                        {accessType === "subscription" && (
                            <div className="rounded-lg border border-primary/20 bg-primary/5 px-3.5 py-3 text-xs text-muted-foreground">
                                <p className="font-semibold text-foreground mb-0.5">All Subscribers</p>
                                <p>Any user with an active subscription plan will have access to this channel. No further configuration required.</p>
                            </div>
                        )}

                        {accessType === "pay_per_view" && (() => {
                            const ppvPlans = plans.filter(p => p.plan_type === "ppv" && p.is_active);
                            return ppvPlans.length > 0 ? (
                                <div className="space-y-2">
                                    <label className="block text-xs font-semibold text-muted-foreground">PPV Plans</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {ppvPlans.map((plan) => {
                                            const checked = watch("subscription_plan_ids").includes(plan.id);
                                            return (
                                                <label key={plan.id} className="flex items-center gap-2 cursor-pointer group p-3 rounded-xl border border-border hover:border-primary/40 transition-colors">
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={() => {
                                                            const current = watch("subscription_plan_ids");
                                                            setValue(
                                                                "subscription_plan_ids",
                                                                checked ? current.filter((id) => id !== plan.id) : [...current, plan.id],
                                                            );
                                                        }}
                                                        className="h-3.5 w-3.5 shrink-0 rounded border-border accent-primary"
                                                    />
                                                    <div className="min-w-0">
                                                        <p className="text-xs font-medium text-foreground truncate">{plan.name}</p>
                                                        <p className="text-[11px] text-muted-foreground">
                                                            {plan.currency} {plan.price}
                                                        </p>
                                                    </div>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : (
                                <p className="text-xs text-muted-foreground">No active PPV plans found.</p>
                            );
                        })()}
                    </section>

                </div>

                {/* ══════════════ RIGHT COLUMN ══════════════ */}
                <div className="space-y-6 xl:sticky xl:top-8">

                    {/* ── Banner and Thumbnails ──────────────────────────── */}
                    <Tabs defaultValue="banner" className="w-full">
                        <TabsList className="mb-4">
                            <TabsTrigger value="banner" className="flex items-center gap-2">
                                <Image size={14} />
                                Banner
                            </TabsTrigger>
                            <TabsTrigger value="thumbnails" className="flex items-center gap-2">
                                <Image size={14} />
                                Thumbnails
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="banner">
                            <section className="rounded-2xl border border-border bg-card p-6 space-y-5">
                                <SectionHeading>Banner</SectionHeading>
                                <Controller name="banner" control={control} render={({ field }) => (
                                    <S3ImageField
                                        label="Banner"
                                        hint="Wide banner used in hero and detail pages"
                                        aspect="16:9"
                                        value={field.value ?? ""}
                                        onChange={field.onChange}
                                    />
                                )} />
                            </section>
                        </TabsContent>

                        <TabsContent value="thumbnails">
                            <section className="rounded-2xl border border-border bg-card p-6 space-y-5">
                                <SectionHeading>Thumbnails</SectionHeading>
                                <div className="space-y-6">
                                    <Controller name="square" control={control} render={({ field }) => (
                                        <S3ImageField
                                            label="Square Thumbnail"
                                            hint="1:1 square thumbnail (1000 x 1000 px)"
                                            aspect="1:1"
                                            value={field.value ?? ""}
                                            onChange={field.onChange}
                                        />
                                    )} />
                                    <Controller name="portrait" control={control} render={({ field }) => (
                                        <S3ImageField
                                            label="Portrait Thumbnail"
                                            hint="Vertical card thumbnail"
                                            aspect="2:3"
                                            value={field.value ?? ""}
                                            onChange={field.onChange}
                                        />
                                    )} />

                                    <Controller name="wide" control={control} render={({ field }) => (
                                        <S3ImageField
                                            label="Wide Thumbnail"
                                            hint="Horizontal card thumbnail"
                                            aspect="3:2"
                                            value={field.value ?? ""}
                                            onChange={field.onChange}
                                        />
                                    )} />
                                </div>
                            </section>
                        </TabsContent>
                    </Tabs>

                    {/* ── Status Settings ───────────────────────────────────── */}
                    <section className="rounded-2xl border border-border bg-card p-6 space-y-2">
                        <SectionHeading>Status Settings</SectionHeading>
                        <Controller name="is_active" control={control} render={({ field }) => (
                            <LabeledSwitch checked={field.value} onCheckedChange={field.onChange} label="Active" description="Inactive channels are hidden from viewers" />
                        )} />
                        <div className="border-t border-border" />
                        <Controller name="is_featured" control={control} render={({ field }) => (
                            <LabeledSwitch checked={field.value} onCheckedChange={field.onChange} label="Featured" description="Show in featured / hero sections" />
                        )} />
                        <div className="border-t border-border" />
                        <Controller name="is_live" control={control} render={({ field }) => (
                            <LabeledSwitch checked={field.value} onCheckedChange={field.onChange} label="Live Now" description="Mark this channel as currently live" />
                        )} />
                    </section>
                </div>
            </div>

            {/* ── Sticky footer action bar ──────────────────────────── */}
            {errors.root && (
                <div className="flex items-center gap-2 rounded-lg px-4 py-3 mt-4 text-sm text-red-300 border border-red-500/20 bg-red-500/8">
                    <AlertTriangle size={14} /> {errors.root.message}
                </div>
            )}

            <div className="fixed flex justify-end w-full z-30 items-center bottom-0 left-0 gap-2 px-6 p-2.5 border-t border-border/50 bg-card">
                <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition-all disabled:opacity-50"
                >
                    {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                    {mode === "edit" ? "Save Changes" : "Add Channel"}
                </button>
                <button
                    type="button"
                    onClick={() => router.push("/admin/content/live-tv")}
                    className="px-4 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                >
                    Cancel
                </button>
            </div>
        </form>
    );
}
