"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, AlertTriangle, Upload, X, Images, Music, Library } from "lucide-react";
import { LabeledSwitch } from "@/components/ui/labeled-switch";
import {
    createAudio, updateAudio,
    type AudioOut, type AudioCreate,
    listCategories, listClientPlans, type CategoryOut, type ClientPricingPlanOut,
} from "@/lib/api";
import { ENDPOINTS } from "@/lib/api/endpoints";
import apiClient from "@/lib/api/client";
import { resolveMediaUrl } from "@/lib/media";
import ImageCropModal, { type CropAspect } from "../../videos/_components/ImageCropModal";
import MediaLibraryModal from "../../videos/_components/MediaLibraryModal";
import { AiWriteButton } from "@/components/AiWriteButton";

// ─── Schema ───────────────────────────────────────────────────────────────────

const schema = z.object({
    title: z.string().min(1, "Title is required"),
    description: z.string().optional(),
    artist: z.string().optional(),
    album: z.string().optional(),
    genre: z.string().optional(),
    categories: z.array(z.string()),
    duration_seconds: z.string().optional(),
    file_url: z.string().optional(),
    thumbnail_url: z.string().optional(),
    access_type: z.enum(["free", "subscription", "ppv", "rental"]),
    subscription_plan_ids: z.array(z.string()),
    status: z.enum(["draft", "published", "archived"]),
    is_featured: z.boolean(),
}).superRefine((data, context) => {
    if (data.status === "published" && !data.file_url?.trim()) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["file_url"], message: "A published audio item requires an audio file." });
    }
    if (["ppv", "rental"].includes(data.access_type) && data.subscription_plan_ids.length !== 1) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["subscription_plan_ids"], message: "Select one active plan for paid audio." });
    }
});

type FormValues = z.infer<typeof schema>;

// ─── Shared UI helpers ────────────────────────────────────────────────────────

function inputCls(hasError = false) {
    return `w-full h-9 rounded-lg bg-secondary border ${hasError ? "border-red-500/60" : "border-border"} px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors`;
}

function selectCls() {
    return `w-full h-9 rounded-lg bg-secondary border border-border px-3 pr-8 text-sm text-foreground appearance-none focus:outline-none focus:ring-1 focus:ring-primary transition-colors`;
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

// ─── S3 Image field ───────────────────────────────────────────────────────────

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
            if (!putRes.ok) throw new Error("Upload failed. Please try again.");
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

    const previewAspect = aspect === "1:1" ? "aspect-square" : aspect === "2:3" ? "aspect-[2/3]" : "aspect-video";
    const containerW = aspect === "1:1" ? "w-40 mx-auto" : "w-full";

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

// ─── Converter helper (used by edit page) ─────────────────────────────────────

export function audioToFormValues(audio: AudioOut): FormValues {
    return {
        title: audio.title,
        description: audio.description ?? "",
        artist: audio.artist ?? "",
        album: audio.album ?? "",
        genre: audio.genre ?? "",
        categories: audio.categories ?? [],
        duration_seconds: audio.duration_seconds != null ? String(audio.duration_seconds) : "",
        file_url: audio.file_url ?? "",
        thumbnail_url: audio.thumbnail_url ?? "",
        access_type: audio.access_type,
        subscription_plan_ids: audio.subscription_plan_ids ?? [],
        status: audio.status,
        is_featured: audio.is_featured,
    };
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface AudioFormProps {
    mode: "create" | "edit";
    audioId?: string;
    defaultValues?: FormValues;
}

const DEFAULT_VALUES: FormValues = {
    title: "",
    description: "",
    artist: "",
    album: "",
    genre: "",
    categories: [],
    duration_seconds: "",
    file_url: "",
    thumbnail_url: "",
    access_type: "free",
    subscription_plan_ids: [],
    status: "draft",
    is_featured: false,
};

// ─── Component ────────────────────────────────────────────────────────────────

export function AudioForm({ mode, audioId, defaultValues }: AudioFormProps) {
    const router = useRouter();
    const [availableCategories, setAvailableCategories] = useState<CategoryOut[]>([]);
    const [categorySearch, setCategorySearch] = useState("");
    const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
    const [audioPickerOpen, setAudioPickerOpen] = useState(false);
    const [pricingPlans, setPricingPlans] = useState<ClientPricingPlanOut[]>([]);

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
    const selectedCategories = watch("categories");
    const accessType = watch("access_type");
    const selectedPlanIds = watch("subscription_plan_ids");

    useEffect(() => {
        listCategories({ content_type: "audio", page_size: 200 })
            .then((res) => setAvailableCategories(res.items))
            .catch(() => { /* silently ignore */ });
        listClientPlans({ is_active: true })
            .then(setPricingPlans)
            .catch(() => { /* silently ignore */ });
    }, []);

    const paidPlans = pricingPlans.filter((plan) =>
        accessType === "ppv" ? plan.plan_type === "ppv" : plan.plan_type === "rent"
    );

    const toggleCategory = (slug: string) => {
        const current = selectedCategories ?? [];
        setValue(
            "categories",
            current.includes(slug) ? current.filter((c) => c !== slug) : [...current, slug],
        );
    };

    const filteredCategories = availableCategories.filter((c) =>
        c.name.toLowerCase().includes(categorySearch.toLowerCase())
    );

    const submitForm = async (data: FormValues, targetStatus: "draft" | "published") => {
        const payload: AudioCreate = {
            title: data.title,
            description: data.description || null,
            artist: data.artist || null,
            album: data.album || null,
            genre: data.genre || null,
            categories: data.categories,
            duration_seconds: data.duration_seconds ? Number(data.duration_seconds) : null,
            file_url: data.file_url || null,
            thumbnail_url: data.thumbnail_url || null,
            access_type: data.access_type,
            subscription_plan_ids: data.subscription_plan_ids,
            status: targetStatus,
            is_featured: data.is_featured,
        };
        try {
            if (mode === "edit" && audioId) {
                await updateAudio(audioId, payload);
            } else {
                await createAudio(payload);
            }
            router.push("/admin/content/audios");
        } catch (err: unknown) {
            setError("root", { message: err instanceof Error ? err.message : "Failed to save audio" });
        }
    };

    const onSubmit = async (data: FormValues) => {
        await submitForm(data, data.status === "published" ? "published" : "draft");
    };

    const handleSaveDraft = async () => {
        await handleSubmit((data) => submitForm(data, "draft"))();
    };

    const handlePublish = async () => {
        await handleSubmit((data) => submitForm(data, "published"))();
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="w-full pb-24">
            <MediaLibraryModal
                open={audioPickerOpen}
                onClose={() => setAudioPickerOpen(false)}
                filterType="audio"
                onSelect={(url) => setValue("file_url", url, { shouldDirty: true, shouldValidate: true })}
                usedUrls={watch("file_url") ? [watch("file_url")] : []}
            />
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6 items-start">

                {/* ══ LEFT ══ */}
                <div className="space-y-6">

                    {/* Basic Info */}
                    <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
                        <SectionHeading>Basic Information</SectionHeading>

                        <div className="space-y-1">
                            <label className="block text-xs font-semibold text-muted-foreground">Title *</label>
                            <input {...register("title")} autoFocus placeholder="e.g. Track Name" className={inputCls(!!errors.title)} />
                            <FieldError msg={errors.title?.message} />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="block text-xs font-semibold text-muted-foreground">Artist</label>
                                <input {...register("artist")} placeholder="e.g. Artist Name" className={inputCls()} />
                            </div>
                            <div className="space-y-1">
                                <label className="block text-xs font-semibold text-muted-foreground">Album</label>
                                <input {...register("album")} placeholder="e.g. Album Name" className={inputCls()} />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="block text-xs font-semibold text-muted-foreground">Genre</label>
                                <input {...register("genre")} placeholder="e.g. Pop, Rock, Jazz" className={inputCls()} />
                            </div>
                            <div className="space-y-1">
                                <label className="block text-xs font-semibold text-muted-foreground">Duration (seconds)</label>
                                <input
                                    {...register("duration_seconds")}
                                    type="number"
                                    min={0}
                                    placeholder="e.g. 240"
                                    className={inputCls()}
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <div className="flex items-center justify-between">
                                <label className="block text-xs font-semibold text-muted-foreground">Description</label>
                                <AiWriteButton
                                    title={titleValue}
                                    hint="short"
                                    onAccept={(text) => setValue("description", text)}
                                />
                            </div>
                            <textarea
                                {...register("description")}
                                rows={3}
                                placeholder="Optional description…"
                                className={textareaCls()}
                            />
                        </div>
                    </section>

                    {/* Audio File */}
                    <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
                        <div className="flex items-center gap-2">
                            <Music size={14} className="text-muted-foreground" />
                            <SectionHeading>Audio File</SectionHeading>
                        </div>
                        <div className="space-y-1">
                            <label className="block text-xs font-semibold text-muted-foreground">File URL</label>
                            <div className="flex gap-2">
                                <input {...register("file_url")} placeholder="Select from Media Library or paste a direct URL" className={inputCls(!!errors.file_url)} />
                                <button type="button" onClick={() => setAudioPickerOpen(true)} className="shrink-0 inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground">
                                    <Library size={14} /> Library
                                </button>
                            </div>
                            <FieldError msg={errors.file_url?.message} />
                            <p className="text-[11px] text-muted-foreground">Use a managed MP3, AAC, WAV, FLAC, OGG, or WebM asset. A file is required to publish.</p>
                            {watch("file_url") && (
                                <audio controls preload="metadata" className="mt-2 h-9 w-full">
                                    <source src={watch("file_url")} />
                                </audio>
                            )}
                        </div>
                    </section>

                    {/* Categories */}
                    <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
                        <SectionHeading>Categories</SectionHeading>
                        <div className="relative">
                            <input
                                type="text"
                                value={categorySearch}
                                onChange={(e) => { setCategorySearch(e.target.value); setCategoryDropdownOpen(true); }}
                                onFocus={() => setCategoryDropdownOpen(true)}
                                onBlur={() => setTimeout(() => setCategoryDropdownOpen(false), 150)}
                                placeholder="Search categories…"
                                className={inputCls()}
                            />
                            {categoryDropdownOpen && filteredCategories.length > 0 && (
                                <div className="absolute z-20 mt-1 w-full rounded-xl border border-border bg-card shadow-xl max-h-48 overflow-y-auto">
                                    {filteredCategories.map((c) => (
                                        <button
                                            key={c.id}
                                            type="button"
                                            onMouseDown={() => toggleCategory(c.slug)}
                                            className={`w-full text-left px-3 py-2 text-sm transition-colors ${(selectedCategories ?? []).includes(c.slug) ? "bg-primary/10 text-primary" : "hover:bg-secondary text-foreground"}`}
                                        >
                                            {c.name}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        {(selectedCategories ?? []).length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                                {(selectedCategories ?? []).map((slug) => {
                                    const cat = availableCategories.find((c) => c.slug === slug);
                                    return (
                                        <span key={slug} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium border border-primary/20">
                                            {cat?.name ?? slug}
                                            <button type="button" onClick={() => toggleCategory(slug)} className="hover:text-red-400 transition-colors">
                                                <X size={10} />
                                            </button>
                                        </span>
                                    );
                                })}
                            </div>
                        )}
                    </section>
                </div>

                {/* ══ RIGHT ══ */}
                <div className="space-y-6 xl:sticky xl:top-8">

                    {/* Status & Access */}
                    <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
                        <SectionHeading>Status & Access</SectionHeading>

                        <div className="space-y-1">
                            <label className="block text-xs font-semibold text-muted-foreground">Status</label>
                            <div className="relative">
                                <select {...register("status")} className={selectCls()}>
                                    <option value="draft">Draft</option>
                                    <option value="published">Published</option>
                                    <option value="archived">Archived</option>
                                </select>
                                <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="block text-xs font-semibold text-muted-foreground">Access Type</label>
                            <div className="relative">
                                <select {...register("access_type", { onChange: () => setValue("subscription_plan_ids", [], { shouldDirty: true, shouldValidate: true }) })} className={selectCls()}>
                                    <option value="free">Free</option>
                                    <option value="subscription">Subscription</option>
                                    <option value="ppv">Paid - one-time purchase</option>
                                    <option value="rental">Paid - time-limited rental</option>
                                </select>
                                <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                            </div>
                        </div>

                        {accessType === "subscription" && (
                            <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-xs text-muted-foreground">
                                Active subscription plans that include this audio or its categories grant playback access.
                            </div>
                        )}

                        {(accessType === "ppv" || accessType === "rental") && (
                            <div className="space-y-2">
                                <label className="block text-xs font-semibold text-muted-foreground">{accessType === "ppv" ? "One-time purchase plan" : "Rental plan"}</label>
                                {paidPlans.length ? paidPlans.map((plan) => (
                                    <label key={plan.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-2.5 transition-colors hover:border-primary/40">
                                        <input type="radio" name="audio_purchase_plan" checked={selectedPlanIds.includes(plan.id)} onChange={() => setValue("subscription_plan_ids", [plan.id], { shouldDirty: true, shouldValidate: true })} className="h-3.5 w-3.5 accent-primary" />
                                        <span className="min-w-0">
                                            <span className="block truncate text-xs font-medium text-foreground">{plan.name}</span>
                                            <span className="text-[11px] text-muted-foreground">{plan.currency} {plan.price}{accessType === "rental" ? ` · ${plan.billing_cycle}` : ""}</span>
                                        </span>
                                    </label>
                                )) : <p className="text-xs text-muted-foreground">Create and activate a matching {accessType === "ppv" ? "PPV" : "Rent"} pricing plan before publishing this audio.</p>}
                                <FieldError msg={errors.subscription_plan_ids?.message} />
                            </div>
                        )}

                        <Controller
                            name="is_featured"
                            control={control}
                            render={({ field }) => (
                                <LabeledSwitch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    label="Featured"
                                    description="Show this track in featured sections"
                                />
                            )}
                        />
                    </section>

                    {/* Thumbnail */}
                    <section className="rounded-2xl border border-border bg-card p-6 space-y-6">
                        <SectionHeading>Thumbnail</SectionHeading>
                        <Controller name="thumbnail_url" control={control} render={({ field }) => (
                            <S3ImageField
                                label="Cover Art"
                                hint="Square album / track cover"
                                aspect="1:1"
                                value={field.value ?? ""}
                                onChange={field.onChange}
                            />
                        )} />
                    </section>
                </div>
            </div>

            {errors.root && (
                <div className="flex items-center gap-2 rounded-lg px-4 py-3 mt-4 text-sm text-red-300 border border-red-500/20 bg-red-500/8">
                    <AlertTriangle size={14} /> {errors.root.message}
                </div>
            )}

            <div className="fixed flex justify-end w-full z-30 items-center bottom-0 left-0 gap-2 px-6 p-2.5 border-t border-border/50 bg-background">
                <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => { void handleSaveDraft(); }}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border bg-card text-foreground text-sm font-semibold hover:bg-secondary transition-colors disabled:opacity-50"
                >
                    {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                    Save Draft
                </button>
                <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => { void handlePublish(); }}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition-all disabled:opacity-50"
                >
                    {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                    {mode === "edit" ? "Save Changes" : "Publish Audio"}
                </button>
                <button
                    type="button"
                    onClick={() => router.push("/admin/content/audios")}
                    className="px-4 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                >
                    Cancel
                </button>
            </div>
        </form>
    );
}
