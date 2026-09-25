"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { ChevronDown, Globe, Loader2, AlertTriangle, CheckCircle2, Upload, X, Images, Radio, Users } from "lucide-react";
import { LabeledSwitch } from "@/components/ui/labeled-switch";
import {
    createPpvEvent, updatePpvEvent,
    type PpvEventOut, type PpvEventCreate,
    PPV_EVENT_SOURCES,
    listCategories, listClientPlans, type CategoryOut, type ClientPricingPlanOut,
} from "@/lib/api";
import { slugify } from "../../videos/_components/utils";
import { ENDPOINTS } from "@/lib/api/endpoints";
import apiClient from "@/lib/api/client";
import { resolveMediaUrl } from "@/lib/media";
import ImageCropModal, { type CropAspect } from "../../videos/_components/ImageCropModal";
import MediaLibraryModal from "../../videos/_components/MediaLibraryModal";
import { AiWriteButton } from "@/components/AiWriteButton";

// ─── Schema ───────────────────────────────────────────────────────────────────

const schema = z.object({
    title: z.string().min(1, "Title is required"),
    slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Only lowercase, numbers, hyphens"),
    description: z.string().optional(),
    category: z.string().optional(),
    source: z.enum(["rtmp", "external"], { required_error: "Source is required" }),
    stream_url: z.string().optional(),
    banner: z.string().optional(),
    portrait: z.string().optional(),
    wide: z.string().optional(),
    geo_fencing: z.object({ blocked_countries: z.array(z.string()) }),
    pricing_plan_id: z.string().nullable(),
    is_active: z.boolean(),
}).refine((data) => data.source !== "external" || /^https:\/\/.+\.m3u8(?:[?#].*)?$/i.test(data.stream_url?.trim() ?? ""), {
    message: "Enter a secure HTTPS HLS (.m3u8) URL",
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

const COUNTRIES = [
    ["US", "United States"], ["GB", "United Kingdom"], ["CA", "Canada"], ["AU", "Australia"], ["DE", "Germany"], ["FR", "France"], ["IN", "India"], ["CN", "China"],
    ["JP", "Japan"], ["KR", "South Korea"], ["BR", "Brazil"], ["MX", "Mexico"], ["AE", "UAE"], ["SA", "Saudi Arabia"], ["EG", "Egypt"], ["ZA", "South Africa"],
    ["NG", "Nigeria"], ["RU", "Russia"], ["IT", "Italy"], ["ES", "Spain"], ["NL", "Netherlands"], ["SE", "Sweden"], ["NO", "Norway"], ["PK", "Pakistan"],
    ["ID", "Indonesia"], ["TR", "Turkey"], ["AR", "Argentina"], ["CO", "Colombia"], ["SG", "Singapore"], ["MY", "Malaysia"], ["TH", "Thailand"], ["PH", "Philippines"],
] as const;

function CountryPicker({ selected, onChange }: { selected: string[]; onChange: (countries: string[]) => void }) {
    const toggleCountry = (country: string) => onChange(
        selected.includes(country) ? selected.filter((value) => value !== country) : [...selected, country],
    );

    return (
        <details className="group rounded-lg border border-border bg-secondary/40">
            <summary className="flex h-9 cursor-pointer items-center justify-between px-3 text-xs text-muted-foreground">
                {selected.length ? `${selected.length} countr${selected.length === 1 ? "y" : "ies"} blocked` : "+ Select countries"}
                <ChevronDown size={13} className="transition-transform group-open:rotate-180" />
            </summary>
            <div className="grid max-h-48 grid-cols-2 gap-1 overflow-y-auto border-t border-border p-2">
                {COUNTRIES.map(([code, name]) => (
                    <label key={code} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs text-foreground hover:bg-secondary">
                        <input type="checkbox" checked={selected.includes(code)} onChange={() => toggleCountry(code)} className="h-3.5 w-3.5 accent-primary" />
                        {name}
                    </label>
                ))}
            </div>
        </details>
    );
}

// ─── S3 Image upload field (reused from VideoForm pattern) ────────────────────

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
                <button type="button" disabled={uploading} onClick={() => setPickerOpen(true)}
                    className="w-full flex items-center justify-center gap-1.5 h-8 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50">
                    <Images size={12} /> {uploading ? "Uploading…" : "Add Image"}
                </button>
            </div>
        </>
    );
}

// ─── Converter (used by edit page) ───────────────────────────────────────────

export function ppvEventToFormValues(event: PpvEventOut): FormValues {
    return {
        title: event.title,
        slug: event.slug,
        description: event.description ?? "",
        category: event.category ?? "",
        source: event.source,
        stream_url: event.stream_url ?? "",
        banner: event.thumbnails.banner ?? "",
        portrait: event.thumbnails.portrait ?? "",
        wide: event.thumbnails.wide ?? "",
        geo_fencing: event.geo_fencing ?? { blocked_countries: [] },
        pricing_plan_id: event.pricing_plan_id,
        is_active: event.is_active,
    };
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface PpvEventFormProps {
    mode: "create" | "edit";
    eventId?: string;
    defaultValues?: FormValues;
}

const DEFAULT_VALUES: FormValues = {
    title: "",
    slug: "",
    description: "",
    category: "",
    source: "rtmp",
    stream_url: "",
    banner: "",
    portrait: "",
    wide: "",
    geo_fencing: { blocked_countries: [] },
    pricing_plan_id: null,
    is_active: true,
};

// ─── Component ────────────────────────────────────────────────────────────────

export function PpvEventForm({ mode, eventId, defaultValues }: PpvEventFormProps) {
    const router = useRouter();
    const [videoCategories, setVideoCategories] = useState<CategoryOut[]>([]);
    const [plans, setPlans] = useState<ClientPricingPlanOut[]>([]);

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
    const blockedCountries = watch("geo_fencing.blocked_countries");
    const selectedPlanId = watch("pricing_plan_id");
    const source = watch("source");
    const slugSetByUser = useRef(false);

    // Load categories (reuse categories API filtered by livestream type)
    useEffect(() => {
        listCategories({ content_type: "livestream", page_size: 200 })
            .then((res) => setVideoCategories(res.items))
            .catch(() => { /* silently ignore */ });
        listClientPlans({ plan_type: "ppv", is_active: true })
            .then(setPlans)
            .catch(() => { /* silently ignore */ });
    }, []);

    // Auto-slug from title in create mode
    useEffect(() => {
        if (mode === "create" && !slugSetByUser.current && titleValue) {
            setValue("slug", slugify(titleValue), { shouldValidate: false });
        }
    }, [titleValue, mode, setValue]);

    const onSubmit = async (data: FormValues) => {
        const payload: PpvEventCreate = {
            title: data.title,
            slug: data.slug,
            description: data.description || null,
            category: data.category || null,
            source: data.source,
            stream_url: data.source === "external" ? data.stream_url?.trim() || null : null,
            thumbnails: {
                banner: data.banner || null,
                portrait: data.portrait || null,
                wide: data.wide || null,
            },
            geo_fencing: { blocked_countries: data.geo_fencing?.blocked_countries ?? [] },
            pricing_plan_id: data.pricing_plan_id,
            is_active: data.is_active,
        };
        try {
            if (mode === "edit" && eventId) {
                await updatePpvEvent(eventId, payload);
            } else {
                await createPpvEvent(payload);
            }
            router.push("/admin/content/ppv-events");
        } catch (err: unknown) {
            setError("root", { message: err instanceof Error ? err.message : "Failed to save PPV event" });
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
                                <input {...register("title")} autoFocus placeholder="e.g. Championship Final 2026" className={inputCls(!!errors.title)} />
                                <FieldError msg={errors.title?.message} />
                            </div>
                            <div className="space-y-1">
                                <label className="block text-xs font-semibold text-muted-foreground">Slug *</label>
                                <input
                                    {...register("slug", { onChange: () => { slugSetByUser.current = true; } })}
                                    placeholder="championship-final-2026"
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
                                    category={watch("category")}
                                    hint="long"
                                    onAccept={(text) => setValue("description", text)}
                                />
                            </div>
                            <textarea
                                {...register("description")}
                                rows={4}
                                placeholder="Describe this pay-per-view event…"
                                className={textareaCls()}
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="block text-xs font-semibold text-muted-foreground">Category</label>
                            <div className="relative">
                                <select {...register("category")} className={selectCls()}>
                                    <option value="">— Select —</option>
                                    {videoCategories.map((c) => (
                                        <option key={c.id} value={c.slug}>{c.name}</option>
                                    ))}
                                </select>
                                <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                            </div>
                        </div>
                    </section>

                    {/* ── Stream Source ─────────────────────────────────────── */}
                    <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
                        <SectionHeading>
                            <Radio size={14} className="inline mr-1 -mt-0.5" />
                            Stream Source
                        </SectionHeading>
                        <p className="text-xs text-muted-foreground">
                            Choose how your live stream will be broadcast into this event.
                        </p>

                        <Controller
                            name="source"
                            control={control}
                            render={({ field }) => (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {PPV_EVENT_SOURCES.map((src) => (
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

                        {source === "external" && (
                            <div className="space-y-1">
                                <label className="block text-xs font-semibold text-muted-foreground">Stream URL (M3U8 / HLS)</label>
                                <input {...register("stream_url")} placeholder="https://example.com/live/master.m3u8" className={inputCls(!!errors.stream_url)} />
                                <FieldError msg={errors.stream_url?.message} />
                            </div>
                        )}
                    </section>

                    <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
                        <SectionHeading><Globe size={14} className="inline mr-1 -mt-0.5" />Geo Fencing</SectionHeading>
                        <div className="space-y-2">
                            <label className="block text-xs font-semibold text-red-400/80">Blocked Countries</label>
                            <CountryPicker selected={blockedCountries} onChange={(countries) => setValue("geo_fencing.blocked_countries", countries)} />
                        </div>
                        <p className="text-[11px] text-muted-foreground">Leave empty for worldwide access.</p>
                    </section>

                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 items-start">
                        <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
                            <SectionHeading><Users size={14} className="inline mr-1 -mt-0.5" />User Access</SectionHeading>
                            {plans.length ? (
                                <div className="space-y-1.5">
                                    <label className="block text-xs font-semibold text-muted-foreground">PPV Plan</label>
                                    {plans.map((plan) => (
                                        <label key={plan.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-2.5 transition-colors hover:border-primary/40">
                                            <input type="radio" name="pricing_plan_id" checked={selectedPlanId === plan.id} onChange={() => setValue("pricing_plan_id", plan.id)} className="h-3.5 w-3.5 accent-primary" />
                                            <span className="min-w-0"><span className="block truncate text-xs font-medium text-foreground">{plan.name}</span><span className="text-[11px] text-muted-foreground">{plan.currency} {plan.price}</span></span>
                                        </label>
                                    ))}
                                    <button type="button" onClick={() => setValue("pricing_plan_id", null)} className="text-[11px] text-muted-foreground hover:text-foreground">Clear selection</button>
                                </div>
                            ) : <p className="text-xs text-muted-foreground">No active PPV pricing plans are available.</p>}
                        </section>

                        <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
                            <SectionHeading>Visibility</SectionHeading>
                            <Controller name="is_active" control={control} render={({ field }) => <LabeledSwitch checked={field.value} onCheckedChange={field.onChange} label="Visible to viewers" description="Turn off to hide this event from your storefront." />} />
                        </section>
                    </div>

                </div>

                {/* ══════════════ RIGHT COLUMN ══════════════ */}
                <div className="space-y-6 xl:sticky xl:top-8">

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

            <div className="fixed bottom-0 left-0 z-30 flex w-full items-center justify-end gap-2 border-t border-border/50 bg-background p-2.5 px-6">
                <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition-all disabled:opacity-50"
                >
                    {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                    {mode === "edit" ? "Save Changes" : "Create PPV Event"}
                </button>
                <button
                    type="button"
                    onClick={() => router.push("/admin/content/ppv-events")}
                    className="px-4 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                >
                    Cancel
                </button>
            </div>
        </form>
    );
}
