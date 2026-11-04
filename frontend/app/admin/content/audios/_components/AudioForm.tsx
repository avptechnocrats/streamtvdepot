"use client";

import S3ImageField from "@/components/content/ContentImageField";
import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, AlertTriangle, Music, Upload } from "lucide-react";
import { LabeledSwitch } from "@/components/ui/labeled-switch";
import { createAudio, updateAudio, type AudioOut, type AudioCreate, listCategories, listClientPlans, type CategoryOut, type ClientPricingPlanOut } from "@/lib/api";

import MediaLibraryModal from "../../videos/_components/MediaLibraryModal";
import { AiWriteButton } from "@/components/AiWriteButton";
import { CategoryPicker } from "@/components/CategoryPicker";
import { uploadAssetToS3, type UploadProgress } from "@/lib/upload/s3-upload";
import { resolveMediaUrl } from "@/lib/media";
import { getApiErrorMessage } from "@/lib/api/error-utils";

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
    const [audioPickerOpen, setAudioPickerOpen] = useState(false);
    const [audioUploading, setAudioUploading] = useState(false);
    const [audioProgress, setAudioProgress] = useState<UploadProgress | null>(null);
    const [audioDisplayUrl, setAudioDisplayUrl] = useState("");
    const [pricingPlans, setPricingPlans] = useState<ClientPricingPlanOut[]>([]);

    const {
        register,
        handleSubmit,
        control,
        watch,
        setValue,
        setError,
        clearErrors,
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

    const handleAudioUpload = async (file: File) => {
        if (audioUploading) return;
        if (!file.type.startsWith("audio/")) {
            setError("file_url", { message: "Please select an audio file" });
            return;
        }
        clearErrors("file_url");
        setAudioUploading(true);
        setAudioProgress(null);
        try {
            const confirmed = await uploadAssetToS3(file, { onProgress: setAudioProgress });
            setAudioDisplayUrl(resolveMediaUrl(confirmed) ?? confirmed.url);
            setValue("file_url", confirmed.url, { shouldDirty: true, shouldValidate: true });
        } catch (error) {
            setError("file_url", { message: getApiErrorMessage(error, "Unable to upload audio. Please try again.") });
        } finally {
            setAudioUploading(false);
            setAudioProgress(null);
        }
    };

    const submitForm = async (data: FormValues, targetStatus: "draft" | "published") => {
        if (audioUploading) return;
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
                onUploadFile={file => { void handleAudioUpload(file); }}
                onSelect={(url, _filename, asset) => {
                    setAudioDisplayUrl(url);
                    clearErrors("file_url");
                    setValue("file_url", asset?.url ?? url, { shouldDirty: true, shouldValidate: true });
                }}
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
                                <input {...register("file_url", { onChange: () => setAudioDisplayUrl("") })} disabled={audioUploading} placeholder="Upload, choose from library, or paste a direct URL" className={`${inputCls(!!errors.file_url)} min-w-0 flex-1`} />
                                <button type="button" disabled={audioUploading} onClick={() => setAudioPickerOpen(true)} className="shrink-0 inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50">
                                    {audioUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} {audioUploading ? "Uploading..." : "Upload / Library"}
                                </button>
                            </div>
                            {audioUploading && <div role="progressbar" aria-label="Audio upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(audioProgress?.percent ?? 0)} className="space-y-1 py-2">
                                <div className="h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-primary transition-[width]" style={{ width: `${audioProgress?.percent ?? 0}%` }} /></div>
                                <p className="text-xs text-muted-foreground">Uploading audio {Math.round(audioProgress?.percent ?? 0)}%</p>
                            </div>}
                            <FieldError msg={errors.file_url?.message} />
                            <p className="text-[11px] text-muted-foreground">Use a managed MP3, AAC, WAV, FLAC, OGG, or WebM asset. A file is required to publish.</p>
                            {watch("file_url") && (
                                <audio key={audioDisplayUrl || watch("file_url")} controls preload="metadata" className="mt-2 h-9 w-full">
                                    <source src={audioDisplayUrl || watch("file_url")} />
                                </audio>
                            )}
                        </div>
                    </section>

                    {/* Categories */}
                    <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
                        <SectionHeading>Categories</SectionHeading>
                        <CategoryPicker
                            options={availableCategories.map(category => ({ value: category.slug, label: category.name }))}
                            selected={selectedCategories ?? []}
                            onChange={categories => setValue("categories", categories, { shouldDirty: true })}
                            placeholder="Search categories..."
                            searchable
                        />
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
                    disabled={isSubmitting || audioUploading}
                    onClick={() => { void handleSaveDraft(); }}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border bg-card text-foreground text-sm font-semibold hover:bg-secondary transition-colors disabled:opacity-50"
                >
                    {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                    Save Draft
                </button>
                <button
                    type="button"
                    disabled={isSubmitting || audioUploading}
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
