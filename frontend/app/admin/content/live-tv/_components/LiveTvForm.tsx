"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { ChevronDown, Globe, Loader2, AlertTriangle, CheckCircle2, Upload, X, Tv2 } from "lucide-react";
import { LabeledSwitch } from "@/components/ui/labeled-switch";
import {
    createLiveTvChannel, updateLiveTvChannel,
    type LiveTvChannelCreate,
    LIVE_TV_SOURCES,
    listCategories, type CategoryOut,
    listClientPlans, type ClientPricingPlanOut,
    VIDEO_LANGUAGES,
} from "@/lib/api";
import { slugify } from "../../videos/_components/utils";
import { ENDPOINTS } from "@/lib/api/endpoints";
import apiClient from "@/lib/api/client";
import { resolveMediaUrl } from "@/lib/media";
import ImageCropModal, { type CropAspect } from "../../videos/_components/ImageCropModal";
import MediaLibraryModal from "../../videos/_components/MediaLibraryModal";
import { AiWriteButton } from "@/components/AiWriteButton";

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

// ─── Schema ───────────────────────────────────────────────────────────────────

const schema = z.object({
    title: z.string().min(1, "Title is required"),
    slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Only lowercase, numbers, hyphens"),
    description: z.string().optional(),
    categories: z.array(z.string()),  // category slugs
    language: z.array(z.string()).optional(),
    source: z.enum(["rtmp", "srt", "external"], { required_error: "Source is required" }),
    stream_url: z.string().optional(),
    is_active: z.boolean(),
    is_featured: z.boolean(),
    is_live: z.boolean(),
    banner: z.string().optional(),
    portrait: z.string().optional(),
    wide: z.string().optional(),
    geo_fencing: z.object({ blocked_countries: z.array(z.string()) }),
    access_type: z.enum(["free", "subscription", "pay_per_view"]),
    subscription_plan_ids: z.array(z.string()),
}).refine((data) => data.source !== "external" || (!!data.stream_url && data.stream_url.trim().length > 0), {
    message: "Stream URL is required for External Live Feed",
    path: ["stream_url"],
});

type FormValues = z.infer<typeof schema>;

// ─── Shared UI helpers ────────────────────────────────────────────────────────

function inputCls(hasError = false) {
    return `w-full h-9 rounded-lg bg-secondary border ${hasError ? "border-red-500/60" : "border-border"} px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors`;
}

function selectCls(hasError = false) {
    return `w-full h-9 rounded-lg bg-secondary border ${hasError ? "border-red-500/60" : "border-border"} px-3 pr-8 text-sm text-foreground appearance-none focus:outline-none focus:ring-1 focus:ring-primary transition-colors`;
}

function textareaCls() {
    return `w-full rounded-lg bg-secondary border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none`;
}

function FieldError({ msg }: { msg?: string }) {
    if (!msg) return null;
    return <p className="text-[11px] text-red-400 mt-0.5">{msg}</p>;
}

function SectionHeading({ children }: { children: React.ReactNode }) {
    return <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">{children}</h3>;
}

// ─── S3 Image upload field ────────────────────────────────────────────────────

interface PendingCropState { file: File; src: string; }

interface S3ImageFieldProps {
    label: string;
    hint: string;
    aspect: CropAspect;
    value: string;
    onChange: (url: string) => void;
}

function S3ImageField({ label, hint, aspect, value, onChange }: S3ImageFieldProps) {
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [pendingCrop, setPendingCrop] = useState<PendingCropState | null>(null);
    const [pickerOpen, setPickerOpen] = useState(false);

    const openCrop = useCallback((file: File) => {
        if (!file.type.startsWith("image/")) { setUploadError("Please select an image file"); return; }
        setUploadError(null);
        const src = URL.createObjectURL(file);
        setPendingCrop({ file, src });
    }, []);

    const handleCropCancel = useCallback(() => {
        if (!pendingCrop) return;
        URL.revokeObjectURL(pendingCrop.src);
        setPendingCrop(null);
    }, [pendingCrop]);

    const handleCropConfirm = useCallback(async (blob: Blob, originalName: string) => {
        if (!pendingCrop) return;
        URL.revokeObjectURL(pendingCrop.src);
        setPendingCrop(null);
        setUploading(true);
        setUploadError(null);
        const filename = originalName.replace(/\.[^.]+$/, ".jpg");
        try {
            const { data: { upload_url, s3_key, storage_class } } =
                await apiClient.post<{ upload_url: string; s3_key: string; storage_class?: string | null }>(
                    ENDPOINTS.admin.upload.presign,
                    { filename, content_type: "image/jpeg", file_size: blob.size },
                );
            const putHeaders: Record<string, string> = { "Content-Type": "image/jpeg" };
            if (storage_class) putHeaders["x-amz-storage-class"] = storage_class;
            const putRes = await fetch(upload_url, { method: "PUT", body: blob, headers: putHeaders });
            if (!putRes.ok) throw new Error(putRes.status === 403 ? "Upload not allowed. Check storage permissions." : "Upload failed. Please try again.");
            const dims = await new Promise<{ width: number; height: number }>((resolve) => {
                const img = new window.Image();
                const ouri = URL.createObjectURL(blob);
                img.onload = () => { URL.revokeObjectURL(ouri); resolve({ width: img.naturalWidth, height: img.naturalHeight }); };
                img.onerror = () => { URL.revokeObjectURL(ouri); resolve({ width: 0, height: 0 }); };
                img.src = ouri;
            });
            const { data: confirmed } = await apiClient.post<{ id: string; url: string; display_url: string | null }>(
                ENDPOINTS.admin.upload.confirm,
                { s3_key, original_filename: filename, content_type: "image/jpeg", file_size: blob.size, width: dims.width || null, height: dims.height || null },
            );
            onChange(resolveMediaUrl(confirmed) ?? confirmed.url);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "";
            setUploadError(msg && !msg.includes("<") ? msg : "Upload failed. Please try again.");
        } finally {
            setUploading(false);
        }
    }, [onChange, pendingCrop]);

    const previewAspect = aspect === "1:1" ? "aspect-square" : aspect === "2:3" ? "aspect-[2/3]" : aspect === "3:2" ? "aspect-[3/2]" : "aspect-video";
    const containerW = aspect === "2:3" ? "w-36 mx-auto" : aspect === "1:1" ? "w-48 mx-auto" : "w-full";

    return (
        <>
            {pendingCrop && (
                <ImageCropModal
                    src={pendingCrop.src}
                    filename={pendingCrop.file.name}
                    aspect={aspect}
                    onConfirm={handleCropConfirm}
                    onCancel={handleCropCancel}
                />
            )}
            <MediaLibraryModal
                open={pickerOpen}
                onClose={() => setPickerOpen(false)}
                filterType="image"
                onUploadFile={(file) => { openCrop(file); }}
                onSelect={(url) => { onChange(url); }}
                usedUrls={value ? [value] : []}
            />
            <div className="space-y-2">
                <div>
                    <label className="block text-xs font-semibold text-muted-foreground">
                        {label} <span className="font-normal opacity-50">({aspect})</span>
                    </label>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>
                </div>
                <div
                    onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) openCrop(f); }}
                    onDragOver={(e) => e.preventDefault()}
                    onClick={() => !value && setPickerOpen(true)}
                    className={`relative rounded-xl border-2 overflow-hidden transition-colors ${containerW} ${value ? "border-border cursor-default" : "border-dashed border-border hover:border-primary/50 cursor-pointer group"}`}
                >
                    {value ? (
                        <div className={`relative ${previewAspect}`}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={value} alt={label} className="w-full h-full object-cover" />
                            {uploading ? (
                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                    <Loader2 size={20} className="animate-spin text-white" />
                                </div>
                            ) : (
                                <div className="absolute inset-0 bg-black/0 hover:bg-black/50 transition-colors flex items-center justify-center gap-2 group">
                                    <button type="button" onClick={(e) => { e.stopPropagation(); setPickerOpen(true); }}
                                        className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/70 text-white text-xs font-medium transition-opacity">
                                        <Upload size={12} /> Replace
                                    </button>
                                    <button type="button" onClick={(e) => { e.stopPropagation(); onChange(""); }}
                                        className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2 py-1.5 rounded-lg bg-red-500/80 text-white text-xs font-medium transition-opacity">
                                        <X size={12} />
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className={`${previewAspect} flex flex-col items-center justify-center gap-2 text-muted-foreground group-hover:text-foreground transition-colors`}>
                            {uploading ? <Loader2 size={18} className="animate-spin" /> : (
                                <>
                                    <Upload size={18} />
                                    <p className="text-xs font-medium">Click or drag image here</p>
                                    <p className="text-[11px] opacity-60">JPG, PNG, WebP</p>
                                </>
                            )}
                        </div>
                    )}
                </div>
                {uploadError && <p className="text-[11px] text-red-400">{uploadError}</p>}
            </div>
        </>
    );
}

// ─── CheckboxDropdown ─────────────────────────────────────────────────────────

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
                    className={`${selectCls()} flex items-center justify-between pr-8 text-left text-muted-foreground`}
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
                            className="w-full h-8 rounded-lg bg-secondary border border-border px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
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

import type { LiveTvChannelOut } from "@/lib/api";

export function liveTvChannelToFormValues(c: LiveTvChannelOut): FormValues {
    return {
        title: c.title,
        slug: c.slug,
        description: c.description ?? "",
        categories: c.categories ?? [],
        language: c.language ?? [],
        source: c.source as "rtmp" | "srt" | "external",
        stream_url: c.stream_url ?? "",
        is_active: c.is_active,
        is_featured: c.is_featured,
        is_live: c.is_live,
        banner: c.thumbnails?.banner ?? "",
        portrait: c.thumbnails?.portrait ?? "",
        wide: c.thumbnails?.wide ?? "",
        geo_fencing: c.geo_fencing ?? { blocked_countries: [] },
        access_type: (c.access_type as "free" | "subscription" | "pay_per_view") ?? "free",
        subscription_plan_ids: c.subscription_plan_ids ?? [],
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
    const slugSetByUser = useRef(false);
    const [plans, setPlans] = useState<ClientPricingPlanOut[]>([]);

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
            categories: data.categories,
            language: data.language ?? [],
            source: data.source,
            stream_url: data.stream_url || null,
            thumbnails: {
                banner: data.banner || null,
                portrait: data.portrait || null,
                wide: data.wide || null,
            },
            is_active: data.is_active,
            is_featured: data.is_featured,
            is_live: data.is_live,
            geo_fencing: { blocked_countries: data.geo_fencing.blocked_countries },
            access_type: data.access_type,
            subscription_plan_ids: data.access_type === "subscription" ? [] : data.subscription_plan_ids,
        };
        try {
            if (mode === "edit" && channelId) {
                await updateLiveTvChannel(channelId, payload);
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
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6 items-start">

                {/* ══════════════ LEFT COLUMN ══════════════ */}
                <div className="space-y-6">

                    {/* ── Basic Information ─────────────────────────────────── */}
                    <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
                        <SectionHeading>Basic Information</SectionHeading>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="block text-xs font-semibold text-muted-foreground">Title *</label>
                                <input {...register("title")} autoFocus placeholder="e.g. Sports News 24" className={inputCls(!!errors.title)} />
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
                                render={({ field }) => {
                                    const selected: string[] = field.value ?? [];
                                    const toggle = (slug: string) => {
                                        const next = selected.includes(slug)
                                            ? selected.filter((s) => s !== slug)
                                            : [...selected, slug];
                                        field.onChange(next);
                                    };
                                    return (
                                        <div className="space-y-1.5">
                                            {selected.length > 0 && (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {selected.map((slug) => {
                                                        const cat = categories.find((c) => c.slug === slug);
                                                        return (
                                                            <span
                                                                key={slug}
                                                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/15 text-primary text-xs font-medium"
                                                            >
                                                                {cat?.name ?? slug}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggle(slug)}
                                                                    className="hover:text-red-400 transition-colors"
                                                                    aria-label={`Remove ${cat?.name ?? slug}`}
                                                                >
                                                                    <X size={11} />
                                                                </button>
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                            <div className="relative">
                                                <select
                                                    value=""
                                                    onChange={(e) => { if (e.target.value) toggle(e.target.value); }}
                                                    className={selectCls()}
                                                >
                                                    <option value="">+ Add category…</option>
                                                    {categories
                                                        .filter((c) => !selected.includes(c.slug))
                                                        .map((c) => (
                                                            <option key={c.id} value={c.slug}>{c.name}</option>
                                                        ))}
                                                </select>
                                                <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                                            </div>
                                        </div>
                                    );
                                }}
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="block text-xs font-semibold text-muted-foreground">Language</label>
                            <CheckboxDropdown
                                selected={watch("language") ?? []}
                                onChange={(v) => setValue("language", v)}
                                placeholder="+ Select languages"
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
                                    className={inputCls(!!errors.stream_url)}
                                />
                                <FieldError msg={errors.stream_url?.message} />
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

                    {/* ── Thumbnails ──────────────────────────────────────── */}
                    <section className="rounded-2xl border border-border bg-card p-6 space-y-6">
                        <SectionHeading>Banner and Thumbnails</SectionHeading>

                        <Controller name="banner" control={control} render={({ field }) => (
                            <S3ImageField
                                label="Banner"
                                hint="Wide banner used in hero and detail pages"
                                aspect="16:9"
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
                    </section>
                </div>
            </div>

            {/* ── Sticky footer action bar ──────────────────────────── */}
            {errors.root && (
                <div className="flex items-center gap-2 rounded-lg px-4 py-3 mt-4 text-sm text-red-300 border border-red-500/20 bg-red-500/8">
                    <AlertTriangle size={14} /> {errors.root.message}
                </div>
            )}

            <div className="fixed bottom-6 right-6 z-30 flex items-center gap-2">
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
                    className="px-4 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                    Cancel
                </button>
            </div>
        </form>
    );
}
