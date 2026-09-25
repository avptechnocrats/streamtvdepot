"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import {
    ChevronDown, Plus, Trash2, Loader2, AlertTriangle, CheckCircle2,
    Upload, X, Globe, Clock, Film, Users, Play, Search, FileText, Eye, Image, Zap, RotateCcw,
} from "lucide-react";
import { LabeledSwitch } from "@/components/ui/labeled-switch";
import { useToast } from "@/hooks/use-toast";
import {
    createVideo, createVideoDraft, updateVideo, getVideo, listVideos,
    type VideoOut, type VideoCreate,
    AGE_RATINGS, CONTENT_CLASSIFICATIONS,
    VIDEO_LANGUAGES, CREW_ROLES,
    listCategories, listClientPlans, type CategoryOut, type ClientPricingPlanOut,
    listAdvertisements, type AdvertisementOut,
} from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { slugify, stripQuery } from "./utils";
import { ENDPOINTS } from "@/lib/api/endpoints";
import apiClient from "@/lib/api/client";
import { resolveMediaUrl } from "@/lib/media";
import ImageCropModal, { type CropAspect } from "./ImageCropModal";
import MediaLibraryModal from "./MediaLibraryModal";
import { AiWriteButton } from "@/components/AiWriteButton";
import VideoPlayer from "@/components/VideoPlayer";
import { getDrmKeyToken, getTranscodeStatus, triggerTranscode } from "@/lib/api/transcoding";
import { uploadAssetToS3 } from "@/lib/upload/s3-upload";
import { getApiErrorMessage } from "@/lib/api/error-utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
    AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
    AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";

// ─── Video categories (loaded from API) ─────────────────────────────────────

// Populated in the component via useEffect

// ─── Country list (ISO 3166-1 alpha-2) ───────────────────────────────────────

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

// ─── Zod schema ────────────────────────────────────────────────────────────────

const nullableNum = z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
    z.number().nullable(),
);

const nullablePositiveNum = z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
    z.number().min(0).nullable(),
);

const adBreakSchema = z.object({
    position: z.enum(["pre", "mid", "post"]),
    at_seconds: nullablePositiveNum,
    max_ads: nullablePositiveNum,
    total_duration_seconds: nullablePositiveNum,
});

const cuePointSchema = z.object({
    advertisement_id: z.string().min(1, "Select an ad"),
    at_seconds: z.preprocess(
        (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
        z.number({ invalid_type_error: "Enter a timestamp" }).min(0, "Must be 0 or greater"),
    ),
});

export const videoFormSchema = z.object({
    // Basic
    title: z.string().min(1, "Title is required"),
    slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Only lowercase, numbers, hyphens"),
    short_description: z.string().optional(),
    long_description: z.string().optional(),
    categories: z.array(z.string()),   // category slugs stored in DB
    age_rating: z.string().optional(),
    content_classification: z.string().optional(),
    language: z.array(z.string()).optional(),
    rating: nullableNum,
    duration: nullablePositiveNum,

    // Cast & Crew
    cast_crew: z.array(z.object({
        name: z.string().min(1, "Name required"),
        role: z.string().min(1, "Role required"),
        character: z.string().optional(),
    })),

    // Related videos
    related_video_ids: z.array(z.string()),

    // Geo fencing
    geo_fencing: z.object({
        blocked_countries: z.array(z.string()),
        allowed_countries: z.array(z.string()),
    }),

    // Intro / Skip times
    intro_times: z.object({
        skip_start_time: nullablePositiveNum,
        skip_end_time: nullablePositiveNum,
        recap_start_time: nullablePositiveNum,
        recap_end_time: nullablePositiveNum,
        skip_start_session: nullableNum,
        skip_end_session: nullableNum,
    }),

    // Status flags
    is_featured: z.boolean(),
    is_active: z.boolean(),
    status: z.enum(["draft", "published", "archived", "scheduled"]),
    is_slider: z.boolean(),
    is_thumbnail: z.boolean(),

    // Advertisement
    advertisement: z.object({
        pre_ad_id: z.string().optional(),
        post_ad_id: z.string().optional(),
        mid_category_ad_id: z.string().optional(),
        mid_ad_sequence_time: nullablePositiveNum,
        ad_mode: z.enum(["hybrid", "csai", "ssai", "none"]),
        vmap_tag_url: z.string().optional(),
        vast_tag_url: z.string().optional(),
        ssai_enabled: z.boolean(),
        ad_breaks: z.array(adBreakSchema),
        cue_points: z.array(cuePointSchema),
    }),

    // Video URL
    video_url: z.string().optional(),

    // Thumbnails
    thumbnails: z.object({
        video_banner: z.string().optional(),
        video_h_thumbnail: z.string().optional(),
        video_w_thumbnail: z.string().optional(),
    }),

    // Trailer
    trailer_type: z.enum(["upload", "url"]).nullable(),
    trailer_url: z.string().optional(),

    // Access
    access_type: z.enum(["free", "subscription", "rental"]),
    rental_plan_id: z.string().nullable(),

    // Visibility
    publish_option: z.enum(["now", "later"]),
    publish_at: z.string().optional(),

    // SEO
    seo: z.object({
        meta_title: z.string().optional(),
        meta_description: z.string().optional(),
        meta_keywords: z.string().optional(),
        og_image_url: z.string().optional(),
    }),
}).superRefine((data, ctx) => {
    const breaks = data.advertisement.ad_breaks ?? [];
    if (breaks.length > 12) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["advertisement", "ad_breaks"],
            message: "Maximum 12 ad breaks per title is allowed.",
        });
    }

    const preCount = breaks.filter((b) => b.position === "pre").length;
    const postCount = breaks.filter((b) => b.position === "post").length;
    if (preCount > 1 || postCount > 1) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["advertisement", "ad_breaks"],
            message: "Only one pre-roll and one post-roll break are allowed.",
        });
    }

    const mids = breaks
        .map((b, i) => ({ i, ...b }))
        .filter((b) => b.position === "mid")
        .map((b) => ({ i: b.i, at: b.at_seconds }));

    mids.forEach(({ i, at }) => {
        if (at === null || at === undefined) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["advertisement", "ad_breaks", i, "at_seconds"],
                message: "Mid-roll breaks require a timestamp (seconds).",
            });
            return;
        }
        if (data.duration && at >= data.duration) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["advertisement", "ad_breaks", i, "at_seconds"],
                message: "Mid-roll timestamp must be less than video duration.",
            });
        }
    });

    const midTimes = mids
        .map((m) => m.at)
        .filter((v): v is number => typeof v === "number")
        .sort((a, b) => a - b);

    for (let i = 1; i < midTimes.length; i++) {
        if (midTimes[i] - midTimes[i - 1] < 30) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["advertisement", "ad_breaks"],
                message: "Keep at least 30 seconds between mid-roll breaks.",
            });
            break;
        }
    }

    if (
        data.advertisement.ad_mode === "csai" &&
        !data.advertisement.vmap_tag_url?.trim() &&
        !data.advertisement.vast_tag_url?.trim()
    ) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["advertisement", "vmap_tag_url"],
            message: "Provide VMAP or VAST tag URL when ad mode is CSAI.",
        });
    }

    const cuePoints = data.advertisement.cue_points ?? [];
    if (cuePoints.length > 20) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["advertisement", "cue_points"],
            message: "Maximum 20 cue-point ads per title is allowed.",
        });
    }
    cuePoints.forEach((cue, i) => {
        if (data.duration && cue.at_seconds >= data.duration) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["advertisement", "cue_points", i, "at_seconds"],
                message: "Cue-point time must be before the video duration.",
            });
        }
    });
});

export type VideoFormValues = z.infer<typeof videoFormSchema>;

// ─── Map API data → form values ────────────────────────────────────────────────

export function videoToFormValues(v: VideoOut): VideoFormValues {
    return {
        title: v.title,
        slug: v.slug,
        short_description: v.short_description ?? "",
        long_description: v.long_description ?? "",
        categories: v.categories ?? [],
        age_rating: v.age_rating ?? "",
        content_classification: v.content_classification ?? "",
        language: v.language ?? [],
        rating: v.rating,
        duration: v.duration,
        cast_crew: v.cast_crew,
        related_video_ids: v.related_video_ids,
        geo_fencing: v.geo_fencing,
        intro_times: v.intro_times,
        is_featured: v.is_featured,
        is_active: v.is_active,
        status: v.status ?? "published",
        is_slider: v.is_slider,
        is_thumbnail: v.is_thumbnail,
        advertisement: {
            pre_ad_id: v.advertisement.pre_ad_id ?? "",
            post_ad_id: v.advertisement.post_ad_id ?? "",
            mid_category_ad_id: v.advertisement.mid_category_ad_id ?? "",
            mid_ad_sequence_time: v.advertisement.mid_ad_sequence_time,
            ad_mode: v.advertisement.ad_mode ?? "hybrid",
            vmap_tag_url: v.advertisement.vmap_tag_url ?? v.advertisement.csai_vmap_tag_url ?? "",
            vast_tag_url: v.advertisement.vast_tag_url ?? v.advertisement.csai_vast_tag_url ?? "",
            ssai_enabled: v.advertisement.ssai_enabled ?? true,
            ad_breaks: (v.advertisement.ad_breaks ?? []).map((b) => ({
                position: b.position,
                at_seconds: b.at_seconds ?? null,
                max_ads: b.max_ads ?? null,
                total_duration_seconds: b.total_duration_seconds ?? null,
            })),
            cue_points: (v.advertisement.cue_points ?? []).map((c) => ({
                advertisement_id: c.advertisement_id,
                at_seconds: c.at_seconds,
            })),
        },
        video_url: v.video_url ?? "",
        thumbnails: {
            video_banner: v.thumbnails.video_banner ?? "",
            video_h_thumbnail: v.thumbnails.video_h_thumbnail ?? "",
            video_w_thumbnail: v.thumbnails.video_w_thumbnail ?? "",
        },
        trailer_type: v.trailer_type,
        trailer_url: v.trailer_url ?? "",
        access_type: v.access_type,
        rental_plan_id: v.access_type === "rental" ? v.subscription_plan_ids[0] ?? null : null,
        publish_option: v.publish_option,
        publish_at: v.publish_at ?? "",
        seo: {
            meta_title: v.seo.meta_title ?? "",
            meta_description: v.seo.meta_description ?? "",
            meta_keywords: v.seo.meta_keywords ?? "",
            og_image_url: v.seo.og_image_url ?? "",
        },
    };
}

// ─── Shared UI helpers ─────────────────────────────────────────────────────────

function inputCls(hasError = false) {
    return `w-full h-9 rounded-lg bg-secondary border ${hasError ? "border-red-500/60" : "border-border"
        } px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors`;
}

function selectCls(hasError = false) {
    return `w-full h-9 rounded-lg bg-secondary border ${hasError ? "border-red-500/60" : "border-border"
        } px-3 pr-8 text-sm text-foreground appearance-none focus:outline-none focus:ring-1 focus:ring-primary transition-colors`;
}

function textareaCls(rows = 3) {
    return `w-full rounded-lg bg-secondary border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none`;
}

function FieldError({ msg }: { msg?: string }) {
    if (!msg) return null;
    return <p className="text-[11px] text-red-400 mt-0.5">{msg}</p>;
}

// Maps a top-level VideoFormValues key to the tab group/value that renders it, so an
// invalid submit can jump the user straight to the offending (possibly hidden) tab.
const FIELD_TAB_MAP: Record<string, { group: "basic" | "access" | "media"; tab: string }> = {
    title: { group: "basic", tab: "basic" },
    slug: { group: "basic", tab: "basic" },
    short_description: { group: "basic", tab: "basic" },
    long_description: { group: "basic", tab: "basic" },
    categories: { group: "basic", tab: "basic" },
    age_rating: { group: "basic", tab: "basic" },
    content_classification: { group: "basic", tab: "basic" },
    language: { group: "basic", tab: "basic" },
    rating: { group: "basic", tab: "basic" },
    duration: { group: "basic", tab: "basic" },
    cast_crew: { group: "basic", tab: "cast" },
    intro_times: { group: "basic", tab: "intro" },
    advertisement: { group: "basic", tab: "ad" },
    seo: { group: "basic", tab: "seo" },
    access_type: { group: "access", tab: "access" },
    rental_plan_id: { group: "access", tab: "access" },
    geo_fencing: { group: "access", tab: "geo" },
    publish_option: { group: "access", tab: "visibility" },
    publish_at: { group: "access", tab: "visibility" },
    video_url: { group: "media", tab: "video" },
    thumbnails: { group: "media", tab: "thumbnails" },
    trailer_type: { group: "media", tab: "trailer" },
    trailer_url: { group: "media", tab: "trailer" },
};

// Recursively walks a react-hook-form FieldErrors tree and returns the first leaf error found.
function findFirstFieldError(node: unknown, path: string[] = []): { path: string[]; message: string } | null {
    if (!node || typeof node !== "object") return null;
    const obj = node as Record<string, unknown> & { message?: unknown };
    if (typeof obj.message === "string" && obj.message) {
        return { path, message: obj.message };
    }
    for (const key of Object.keys(obj)) {
        if (key === "type" || key === "message" || key === "ref" || key === "types") continue;
        const found = findFirstFieldError(obj[key], [...path, key]);
        if (found) return found;
    }
    return null;
}

function SectionHeading({ children }: { children: React.ReactNode }) {
    return <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">{children}</h3>;
}

// ─── Media asset type ────────────────────────────────────────────────────────

// ─── S3 Image upload field (presign → PUT → confirm) ─────────────────────────

interface PendingCropState { file: File; src: string; }

interface S3ImageFieldProps {
    label: string;
    hint: string;
    aspect: CropAspect;
    value: string;
    onChange: (url: string) => void;
    onBeforeUpload?: () => Promise<boolean>;
}

function S3ImageField({ label, hint, aspect, value, onChange, onBeforeUpload }: S3ImageFieldProps) {
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [pendingCrop, setPendingCrop] = useState<PendingCropState | null>(null);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [displayUrl, setDisplayUrl] = useState<string>("");
    const lastValueRef = useRef<string>(value);

    // If the parent changes the stored value externally (e.g. loading an existing record),
    // drop any cached display URL so we fall back to the freshly-signed value from the API.
    useEffect(() => {
        if (value !== lastValueRef.current) {
            lastValueRef.current = value;
            setDisplayUrl("");
        }
    }, [value]);

    // Called with raw file from input/drop — opens crop modal instead of uploading immediately
    const openCrop = useCallback(async (file: File) => {
        if (onBeforeUpload && !(await onBeforeUpload())) return;
        if (!file.type.startsWith("image/")) { setUploadError("Please select an image file"); return; }
        setUploadError(null);
        const src = URL.createObjectURL(file);
        setPendingCrop({ file, src });
    }, [onBeforeUpload]);

    const openPicker = useCallback(async () => {
        if (onBeforeUpload && !(await onBeforeUpload())) return;
        setPickerOpen(true);
    }, [onBeforeUpload]);

    const handleCropCancel = useCallback(() => {
        if (!pendingCrop) return;
        URL.revokeObjectURL(pendingCrop.src);
        setPendingCrop(null);
    }, [pendingCrop]);

    // Called after crop is confirmed — uploads the cropped blob
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
            if (!putRes.ok) {
                await putRes.text().catch(() => "");
                throw new Error(putRes.status === 403 ? "Upload not allowed. Check storage permissions." : "Upload failed. Please try again.");
            }
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
            const renderUrl = resolveMediaUrl(confirmed) ?? confirmed.url;
            lastValueRef.current = confirmed.url;
            setDisplayUrl(renderUrl);
            onChange(confirmed.url);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "";
            setUploadError(msg && !msg.includes("<") ? msg : "Upload failed. Please try again.");
        } finally {
            setUploading(false);
        }
    }, [onChange, pendingCrop]);

    const previewAspect = aspect === "1:1" ? "aspect-square" : aspect === "2:3" ? "aspect-[2/3]" : aspect === "3:2" ? "aspect-[3/2]" : "aspect-video";
    const containerW = aspect === "2:3" ? "w-36 mx-auto" : aspect === "1:1" ? "w-48 mx-auto" : "w-full";

    const previewUrl = displayUrl || value;

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
                onSelect={(url) => {
                        lastValueRef.current = stripQuery(url);
                    setDisplayUrl(url);
                        onChange(stripQuery(url));
                }}
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
                    onClick={() => { if (!value) void openPicker(); }}
                    className={`relative rounded-xl border-2 overflow-hidden transition-colors ${containerW} ${value ? "border-border cursor-default" : "border-dashed border-border hover:border-primary/50 cursor-pointer group"}`}
                >
                    {previewUrl ? (
                        <div className={`relative ${previewAspect}`}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={previewUrl} alt={label} className="w-full h-full object-cover" />
                            {uploading ? (
                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                    <Loader2 size={20} className="animate-spin text-white" />
                                </div>
                            ) : (
                                <div className="absolute inset-0 bg-black/0 hover:bg-black/50 transition-colors flex items-center justify-center gap-2 group">
                                    <button type="button" onClick={(e) => { e.stopPropagation(); void openPicker(); }}
                                        className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/70 text-white text-xs font-medium transition-opacity">
                                        <Upload size={12} /> Replace
                                    </button>
                                    <button type="button" onClick={(e) => { e.stopPropagation(); lastValueRef.current = ""; setDisplayUrl(""); onChange(""); }}
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
                                    <p className="text-xs font-medium text-center">Click or drag image here</p>
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

// ─── S3 Video/File upload field ───────────────────────────────────────────────

interface S3VideoFieldProps {
    label: string;
    hint: string;
    accept: string;
    value: string;
    thumbnailUrl?: string;
    streamPreviewUrl?: string | null;
    streamVideoId?: string;
    streamDrmKeyToken?: string;
    transcodeStatus?: "pending" | "processing" | "complete" | "failed" | null;
    transcodeProgress?: number | null;
    onRetryTranscode?: () => void | Promise<void>;
    onChange: (url: string) => void;
    onBeforeUpload?: () => Promise<boolean>;
    onDurationDetected?: (seconds: number) => void;
}

// Reads the file's own metadata client-side (no upload/transcode wait) via a throwaway <video> element
function detectVideoDuration(file: File): Promise<number | null> {
    return new Promise((resolve) => {
        const objectUrl = URL.createObjectURL(file);
        const probe = document.createElement("video");
        probe.preload = "metadata";
        probe.onloadedmetadata = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(Number.isFinite(probe.duration) && probe.duration > 0 ? probe.duration : null);
        };
        probe.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(null);
        };
        probe.src = objectUrl;
    });
}

function S3VideoField({ label, hint, accept, value, thumbnailUrl, streamPreviewUrl, streamVideoId, streamDrmKeyToken, transcodeStatus, transcodeProgress, onRetryTranscode, onChange, onBeforeUpload, onDurationDetected }: S3VideoFieldProps) {
    const [uploading, setUploading] = useState(false);
    const [progressPct, setProgressPct] = useState(0);
    const [uploadedBytes, setUploadedBytes] = useState(0);
    const [totalBytes, setTotalBytes] = useState(0);
    const [speedBps, setSpeedBps] = useState(0);
    const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
    const [progressLabel, setProgressLabel] = useState("Preparing");
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [failedUploadedBytes, setFailedUploadedBytes] = useState(0);
    const [failedRemainingBytes, setFailedRemainingBytes] = useState(0);
    const [failedFile, setFailedFile] = useState<File | null>(null);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [displayUrl, setDisplayUrl] = useState<string>("");
    const lastValueRef = useRef<string>(value);

    // If the parent changes the stored value externally (e.g. loading an existing record),
    // drop any cached display URL so we fall back to the freshly-signed value from the API.
    useEffect(() => {
        if (value !== lastValueRef.current) {
            lastValueRef.current = value;
            setDisplayUrl("");
            setPreviewError(null);
        }
    }, [value]);

    const formatBytes = (bytes: number) => {
        if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
        const units = ["B", "KB", "MB", "GB", "TB"];
        const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
        const size = bytes / Math.pow(1024, idx);
        return `${size.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
    };

    const formatEta = (seconds: number | null) => {
        if (seconds == null || !Number.isFinite(seconds)) return "--";
        const rounded = Math.max(Math.round(seconds), 0);
        const mins = Math.floor(rounded / 60);
        const secs = rounded % 60;
        return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    };

    const handleFile = useCallback(async (file: File) => {
        if (onBeforeUpload && !(await onBeforeUpload())) return;
        if (onDurationDetected) {
            void detectVideoDuration(file).then((seconds) => { if (seconds) onDurationDetected(seconds); });
        }
        setUploading(true);
        setUploadError(null);
        setFailedFile(file);
        setProgressPct(0);
        setUploadedBytes(0);
        setTotalBytes(file.size);
        setSpeedBps(0);
        setEtaSeconds(null);
        setProgressLabel(`Preparing ${file.name}`);
        try {
            const stageToLabel: Record<string, string> = {
                preparing: "Preparing upload",
                uploading: "Uploading video",
                completing: "Completing multipart upload",
                registering: "Registering asset",
            };

            const confirmed = await uploadAssetToS3(file, {
                onProgress: (p) => {
                    setProgressPct(p.percent);
                    setUploadedBytes(p.uploadedBytes);
                    setTotalBytes(p.totalBytes);
                    setSpeedBps(p.bytesPerSecond);
                    setEtaSeconds(p.etaSeconds);
                    setFailedUploadedBytes(p.uploadedBytes);
                    setFailedRemainingBytes(p.remainingBytes);
                    setProgressLabel(stageToLabel[p.stage] ?? "Uploading");
                },
            });
            // Store the permanent base S3 URL (not the 7-day presigned URL).
            // The backend regenerates a fresh presigned URL on every API response.
            lastValueRef.current = confirmed.url;
            setDisplayUrl(confirmed.display_url || "");
            onChange(confirmed.url);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "";
            setUploadError(msg && !msg.includes("<") ? msg : "Upload failed. Please try again.");
        } finally {
            setUploading(false);
            setProgressPct(0);
            setUploadedBytes(0);
            setTotalBytes(0);
            setSpeedBps(0);
            setEtaSeconds(null);
            setProgressLabel("Preparing");
        }
    }, [onBeforeUpload, onChange, onDurationDetected]);

    const openPicker = useCallback(async () => {
        if (onBeforeUpload && !(await onBeforeUpload())) return;
        setPickerOpen(true);
    }, [onBeforeUpload]);

    const handleRetry = useCallback(async () => {
        if (!failedFile) return;
        await handleFile(failedFile);
    }, [failedFile, handleFile]);

    const previewUrl = displayUrl || value;
    const streamReady = Boolean(streamPreviewUrl && streamVideoId);
    const isProcessing = transcodeStatus === "pending" || transcodeStatus === "processing";
    const isFailed = transcodeStatus === "failed";

    return (
        <div className="space-y-2">
            <label className="block text-xs font-semibold text-muted-foreground">{label}</label>
            <p className="text-[11px] text-muted-foreground">{hint}</p>
            {previewUrl ? (
                <div className="space-y-2">
                    {/* Preview lifecycle: complete → inline HLS player, processing → status, failed → retry */}
                    <div className="relative rounded-xl overflow-hidden border border-border bg-black">
                        {streamReady ? (
                            <VideoPlayer
                                src={streamPreviewUrl!}
                                videoId={streamVideoId}
                                drmKeyToken={streamDrmKeyToken}
                                poster={thumbnailUrl ?? undefined}
                                autoPlay={false}
                                onError={(message) => setPreviewError(message || "The HLS preview could not be played.")}
                            />
                        ) : isFailed ? (
                            <div className="aspect-video flex flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
                                <AlertTriangle size={30} className="text-amber-400 opacity-80" />
                                <p className="text-sm font-medium text-foreground">Transcoding failed</p>
                                <p className="text-[11px] opacity-60 max-w-xs">The streaming render could not be generated. Retry to submit a new job.</p>
                                {onRetryTranscode && (
                                    <button type="button" onClick={() => { void onRetryTranscode(); }}
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-medium transition-colors">
                                        <RotateCcw size={13} /> Retry transcoding
                                    </button>
                                )}
                            </div>
                        ) : isProcessing ? (
                            <div className="relative aspect-video">
                                {thumbnailUrl && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={thumbnailUrl} alt="Video thumbnail" className="absolute inset-0 w-full h-full object-cover opacity-40" />
                                )}
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center bg-black/40">
                                    <Loader2 size={26} className="animate-spin text-primary" />
                                    <p className="text-sm font-medium text-foreground">Preparing stream…</p>
                                    <p className="text-[11px] text-muted-foreground max-w-xs">
                                        Transcoding to adaptive HLS. The preview appears here automatically when ready.
                                    </p>
                                    {typeof transcodeProgress === "number" && transcodeProgress > 0 && (
                                        <div className="w-40 mt-1">
                                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                                <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${Math.min(transcodeProgress, 100)}%` }} />
                                            </div>
                                            <p className="text-[10px] text-muted-foreground mt-1">{Math.round(transcodeProgress)}%</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="aspect-video flex flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
                                <Film size={30} className="opacity-30" />
                                <p className="text-sm font-medium text-foreground">Preview available after transcoding</p>
                                <p className="text-[11px] opacity-60 max-w-xs">This video has no streaming render yet.</p>
                                {onRetryTranscode && (
                                    <button type="button" onClick={() => { void onRetryTranscode(); }}
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary text-xs font-medium transition-colors">
                                        <Zap size={13} /> Generate stream
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                    {previewError && <p className="text-xs text-destructive">{previewError}</p>}
                    {/* Filename + remove */}
                    <div className="flex items-center gap-2 rounded-xl border border-border bg-secondary px-3 py-2">
                        <Film size={14} className="text-primary shrink-0" />
                        <span className="text-xs text-foreground flex-1 truncate">{value.split("/").pop()?.split("?")[0] ?? value}</span>
                        <button type="button" onClick={() => { lastValueRef.current = ""; setDisplayUrl(""); onChange(""); }}
                            className="p-1 rounded-lg text-muted-foreground hover:text-red-400 transition-colors shrink-0">
                            <X size={14} />
                        </button>
                    </div>
                    <button type="button" onClick={() => { void openPicker(); }}
                        className="w-full flex items-center justify-center gap-1.5 h-8 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                        <Film size={12} /> Replace
                    </button>
                </div>
            ) : (
                <div
                    onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                    onDragOver={(e) => e.preventDefault()}
                    onClick={() => { if (!uploading) void openPicker(); }}
                    className="border-2 border-dashed border-border rounded-xl p-6 flex flex-col items-center gap-2 text-center hover:border-primary/40 transition-colors cursor-pointer"
                >
                    {uploading ? (
                        <>
                            <Loader2 size={22} className="animate-spin text-primary" />
                            <p className="text-xs font-medium text-foreground">{progressLabel}</p>
                            <p className="text-[11px] text-muted-foreground">{progressPct.toFixed(1)}%</p>
                        </>
                    ) : (
                        <>
                            <Upload size={22} className="text-muted-foreground" />
                            <p className="text-xs font-medium text-foreground">Click to upload or drag file here</p>
                            <p className="text-[11px] text-muted-foreground">{hint}</p>
                        </>
                    )}
                </div>
            )}

            {uploading && (
                <div className="space-y-2 rounded-lg border border-border bg-secondary/50 p-3">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{progressLabel}</span>
                        <span>{progressPct.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-primary transition-[width] duration-150" style={{ width: `${Math.min(progressPct, 100)}%` }} />
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                        <div>Uploaded: <span className="text-foreground">{formatBytes(uploadedBytes)} / {formatBytes(totalBytes)}</span></div>
                        <div>Remaining: <span className="text-foreground">{formatBytes(Math.max(totalBytes - uploadedBytes, 0))}</span></div>
                        <div>Speed: <span className="text-foreground">{speedBps > 0 ? `${formatBytes(speedBps)}/s` : "--"}</span></div>
                        <div>ETA: <span className="text-foreground">{formatEta(etaSeconds)}</span></div>
                    </div>
                </div>
            )}

            {uploadError && <p className="text-[11px] text-red-400">{uploadError}</p>}
            {uploadError && failedFile && (
                <div className="space-y-2 rounded-lg border border-red-500/20 bg-red-500/8 p-3">
                    <p className="text-[11px] text-red-300">
                        Failed after {formatBytes(failedUploadedBytes)} uploaded. Remaining {formatBytes(failedRemainingBytes)}.
                    </p>
                    <button
                        type="button"
                        onClick={handleRetry}
                        disabled={uploading}
                        className="h-8 px-3 rounded-lg bg-amber-500/20 text-amber-200 text-xs font-semibold hover:bg-amber-500/30 transition-colors disabled:opacity-50"
                    >
                        Retry Upload
                    </button>
                </div>
            )}
            {!value && (
                <div className="space-y-1">
                    <label className="block text-xs text-muted-foreground">Or paste URL directly</label>
                    <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
                        placeholder="https://cdn.example.com/video.mp4" className={inputCls()} />
                </div>
            )}
            <MediaLibraryModal
                open={pickerOpen}
                onClose={() => setPickerOpen(false)}
                filterType="video"
                onUploadFile={(file) => { handleFile(file); }}
                onSelect={(url) => { lastValueRef.current = stripQuery(url); setDisplayUrl(url); onChange(stripQuery(url)); }}
                usedUrls={value ? [value] : []}
            />
        </div>
    );
}

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
            {/* Selected tags */}
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
            {/* Trigger button */}
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
                        {/* Search */}
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search…"
                            className="w-full h-8 rounded-lg bg-secondary border border-border px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
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
        </div>
    );
}

const COUNTRY_OPTIONS = COUNTRIES.map((c) => ({ value: c.code, label: c.name }));
const LANGUAGE_OPTIONS = VIDEO_LANGUAGES.map((l) => ({ value: l, label: l }));

// ─── Related Video Search ─────────────────────────────────────────────────────

interface SelectedVideoItem { id: string; title: string; image: string; }

function RelatedVideoSearch({
    value,
    onChange,
    excludeId,
}: {
    value: string[];
    onChange: (ids: string[]) => void;
    excludeId?: string;
}) {
    const [query, setQuery] = useState("");
    const [debouncedQuery, setDebouncedQuery] = useState("");
    const [open, setOpen] = useState(false);
    const [selectedItems, setSelectedItems] = useState<SelectedVideoItem[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Debounce the search query
    useEffect(() => {
        const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
        return () => clearTimeout(t);
    }, [query]);

    // Fetch search suggestions
    const { data: suggestions, isFetching } = useQuery({
        queryKey: ["video-search-suggest", debouncedQuery],
        queryFn: () => listVideos({ search: debouncedQuery, page_size: 8, is_active: true }),
        enabled: debouncedQuery.length >= 1,
        staleTime: 10_000,
    });

    // Hydrate display items for IDs loaded from API (edit mode)
    useEffect(() => {
        const missingIds = value.filter((id) => !selectedItems.find((s) => s.id === id));
        if (missingIds.length === 0) return;
        Promise.all(missingIds.map((id) => getVideo(id).catch(() => null))).then((videos) => {
            const found = videos.filter(Boolean) as typeof videos extends (infer T | null)[] ? NonNullable<T>[] : never[];
            if (found.length === 0) return;
            setSelectedItems((prev) => [
                ...prev,
                ...found.map((v) => ({
                    id: v.id,
                    title: v.title,
                    image: v.thumbnails.video_h_thumbnail || v.thumbnails.video_w_thumbnail || v.thumbnails.video_banner || "",
                })),
            ]);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Close dropdown on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const alreadySelectedIds = new Set(value);

    const filteredSuggestions = (suggestions ?? []).filter(
        (v) => v.id !== excludeId && !alreadySelectedIds.has(v.id)
    );

    const addVideo = (v: { id: string; title: string; thumbnails: { video_h_thumbnail: string | null; video_w_thumbnail: string | null; video_banner: string | null } }) => {
        const newIds = [...value, v.id];
        onChange(newIds);
        setSelectedItems((prev) => [
            ...prev,
            {
                id: v.id,
                title: v.title,
                image: v.thumbnails.video_h_thumbnail || v.thumbnails.video_w_thumbnail || v.thumbnails.video_banner || "",
            },
        ]);
        setQuery("");
        setDebouncedQuery("");
        setOpen(false);
        inputRef.current?.focus();
    };

    const removeVideo = (id: string) => {
        onChange(value.filter((x) => x !== id));
        setSelectedItems((prev) => prev.filter((s) => s.id !== id));
    };

    return (
        <div ref={containerRef} className="space-y-3">
            {/* Search input */}
            <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
                    onFocus={() => { if (query.length >= 1) setOpen(true); }}
                    placeholder="Search by title to add related videos…"
                    className="w-full h-9 rounded-lg bg-secondary border border-border pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                />
                {isFetching && (
                    <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
                )}

                {/* Suggestions dropdown */}
                {open && debouncedQuery.length >= 1 && (
                    <div className="absolute z-50 top-full mt-1 w-full rounded-xl border border-border bg-card shadow-xl overflow-hidden">
                        {filteredSuggestions.length === 0 ? (
                            <p className="px-4 py-3 text-xs text-muted-foreground">
                                {isFetching ? "Searching…" : "No results found."}
                            </p>
                        ) : (
                            <ul className="max-h-60 overflow-y-auto">
                                {filteredSuggestions.map((v) => {
                                    const thumb = v.thumbnails.video_h_thumbnail || v.thumbnails.video_w_thumbnail || v.thumbnails.video_banner;
                                    return (
                                        <li key={v.id}>
                                            <button
                                                type="button"
                                                onClick={() => addVideo(v)}
                                                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-secondary transition-colors text-left"
                                            >
                                                {thumb ? (
                                                    <img src={thumb} alt={v.title} className="w-10 h-14 rounded object-cover flex-shrink-0 border border-border/40" />
                                                ) : (
                                                    <div className="w-10 h-14 rounded bg-secondary flex-shrink-0 flex items-center justify-center border border-border/40">
                                                        <Film size={14} className="text-muted-foreground" />
                                                    </div>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-foreground truncate">{v.title}</p>
                                                    <p className="text-xs text-muted-foreground mt-0.5">
                                                        {v.categories?.length > 0 && <span>{v.categories[0]} · </span>}
                                                        {v.publish_at
                                                            ? new Date(v.publish_at).getFullYear()
                                                            : new Date(v.created_at).getFullYear()}
                                                    </p>
                                                </div>
                                                <Plus size={14} className="text-primary flex-shrink-0" />
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                )}
            </div>

            {/* Selected chips */}
            {value.length === 0 ? (
                <p className="text-xs text-muted-foreground">No related videos added.</p>
            ) : (
                <div className="space-y-2">
                    {value.map((id) => {
                        const item = selectedItems.find((s) => s.id === id);
                        return (
                            <div key={id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-secondary border border-border/50">
                                {item?.image ? (
                                    <img src={item.image} alt={item.title} className="w-8 h-11 rounded object-cover flex-shrink-0 border border-border/40" />
                                ) : (
                                    <div className="w-8 h-11 rounded bg-muted flex-shrink-0 flex items-center justify-center">
                                        <Film size={12} className="text-muted-foreground" />
                                    </div>
                                )}
                                <span className="text-sm text-foreground flex-1 truncate">
                                    {item?.title ?? id}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => removeVideo(id)}
                                    className="p-1 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0"
                                >
                                    <X size={13} />
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface VideoFormProps {
    mode: "create" | "edit";
    videoId?: string;
    defaultValues?: VideoFormValues;
    previewVideo?: Pick<VideoOut, "hls_url" | "drm_enabled" | "thumbnails" | "transcode_status" | "transcode_progress">;
}

const DEFAULT_FORM_VALUES: VideoFormValues = {
    title: "",
    slug: "",
    short_description: "",
    long_description: "",
    categories: [],
    age_rating: "",
    content_classification: "",
    language: [],
    rating: null,
    duration: null,
    cast_crew: [],
    related_video_ids: [],
    geo_fencing: { blocked_countries: [], allowed_countries: [] },
    intro_times: {
        skip_start_time: null, skip_end_time: null,
        recap_start_time: null, recap_end_time: null,
        skip_start_session: null, skip_end_session: null,
    },
    is_featured: false,
    is_active: true,
    status: "draft",
    is_slider: false,
    is_thumbnail: false,
    advertisement: {
        pre_ad_id: "", post_ad_id: "",
        mid_category_ad_id: "", mid_ad_sequence_time: null,
        ad_mode: "hybrid",
        vmap_tag_url: "",
        vast_tag_url: "",
        ssai_enabled: true,
        ad_breaks: [],
        cue_points: [],
    },
    video_url: "",
    thumbnails: {
        video_banner: "",
        video_h_thumbnail: "",
        video_w_thumbnail: "",
    },
    trailer_type: null,
    trailer_url: "",
    access_type: "free",
    rental_plan_id: null,
    publish_option: "now",
    publish_at: "",
    seo: { meta_title: "", meta_description: "", meta_keywords: "", og_image_url: "" },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function VideoForm({ mode, videoId, defaultValues, previewVideo }: VideoFormProps) {
    const router = useRouter();
    const { toast } = useToast();
    const persistedVideoIdRef = useRef(videoId ?? "");
    const draftCreationPromiseRef = useRef<Promise<VideoOut> | null>(null);
    const pendingAssetSavesRef = useRef(new Set<Promise<unknown>>());
    const transcodeTriggeredUrlRef = useRef<string | null>(null);
    const originalVideoUrlRef = useRef<string>(defaultValues?.video_url ?? "");
    const [savingDraft, setSavingDraft] = useState(false);
    // Controlled tab groups so an invalid submit can jump straight to the tab holding the error
    const [basicTab, setBasicTab] = useState("basic");
    const [accessTab, setAccessTab] = useState("access");
    const [mediaTab, setMediaTab] = useState("video");
    const [streamPreviewUrl, setStreamPreviewUrl] = useState<string | null>(null);
    const [streamPreviewToken, setStreamPreviewToken] = useState<string | undefined>(undefined);
    const [previewVideoId, setPreviewVideoId] = useState<string | undefined>(videoId);
    const [transcodeStatus, setTranscodeStatus] = useState<VideoOut["transcode_status"]>(previewVideo?.transcode_status ?? null);
    const [transcodeProgress, setTranscodeProgress] = useState<number>(previewVideo?.transcode_progress ?? 0);

    // Build the CORS-safe HLS stream URL (+ DRM token), the same way the listing preview does.
    const buildStreamPreview = useCallback(async (id: string) => {
        let token: string | undefined;
        try {
            token = (await getDrmKeyToken(id)).token;
        } catch {
            // Non-DRM videos do not need a key token.
        }
        const base = `${process.env.NEXT_PUBLIC_API_URL}${ENDPOINTS.media.stream(id)}`;
        setStreamPreviewUrl(token ? `${base}?token=${token}` : base);
        setStreamPreviewToken(token);
    }, []);

    // Preload the inline HLS player once the render is complete (one-click playback).
    useEffect(() => {
        if (previewVideoId && transcodeStatus === "complete") {
            void buildStreamPreview(previewVideoId);
        }
    }, [previewVideoId, transcodeStatus, buildStreamPreview]);

    // Poll transcode status while a job is in flight so the preview swaps to HLS automatically.
    useEffect(() => {
        if (!previewVideoId || (transcodeStatus !== "pending" && transcodeStatus !== "processing")) return;
        let cancelled = false;
        const timer = setInterval(async () => {
            try {
                const s = await getTranscodeStatus(previewVideoId);
                if (cancelled) return;
                setTranscodeStatus(s.transcode_status);
                setTranscodeProgress(s.transcode_progress ?? 0);
            } catch {
                // transient — keep polling
            }
        }, 8000);
        return () => { cancelled = true; clearInterval(timer); };
    }, [previewVideoId, transcodeStatus]);

    const retryTranscode = useCallback(async () => {
        const id = previewVideoId ?? persistedVideoIdRef.current;
        if (!id) return;
        try {
            await triggerTranscode(id);
            setPreviewVideoId(id);
            setStreamPreviewUrl(null);
            setTranscodeStatus("pending");
            setTranscodeProgress(0);
            toast({ title: "Transcoding started", description: "Preparing the streaming render. The preview will appear when ready." });
        } catch (err: unknown) {
            toast({ title: "Could not start transcoding", description: getApiErrorMessage(err, "Please try again."), variant: "destructive" });
        }
    }, [previewVideoId, toast]);

    const {
        register,
        handleSubmit,
        control,
        watch,
        getValues,
        setValue,
        setError,
        formState: { errors, isSubmitting },
    } = useForm<VideoFormValues>({
        resolver: zodResolver(videoFormSchema),
        defaultValues: defaultValues ?? DEFAULT_FORM_VALUES,
    });

    const {
        fields: castFields,
        append: appendCast,
        remove: removeCast,
    } = useFieldArray({ control, name: "cast_crew" });

    const {
        fields: adBreakFields,
        append: appendAdBreak,
        remove: removeAdBreak,
        replace: replaceAdBreaks,
    } = useFieldArray({ control, name: "advertisement.ad_breaks" });
    const {
        fields: cuePointFields,
        append: appendCuePoint,
        remove: removeCuePoint,
    } = useFieldArray({ control, name: "advertisement.cue_points" });
    const [midRollIntervalMinutes, setMidRollIntervalMinutes] = useState(10);
    // Pending auto-fill awaiting confirmation via the replace-breaks dialog (instead of window.confirm)
    const [confirmReplaceBreaks, setConfirmReplaceBreaks] = useState<{ durationSeconds: number; intervalSeconds: number; existingMidCount: number } | null>(null);

    const applyMidRollFill = useCallback((durationSeconds: number, intervalSeconds: number) => {
        const existing = getValues("advertisement.ad_breaks") ?? [];
        const preBreak = existing.find((b) => b.position === "pre");
        const postBreak = existing.find((b) => b.position === "post");
        const maxMidCount = 12 - (preBreak ? 1 : 0) - (postBreak ? 1 : 0);
        const midTimes: number[] = [];
        // Stop at least 30s before the end so the last mid-roll never collides with the post-roll
        for (let at = intervalSeconds; at < durationSeconds - 30 && midTimes.length < maxMidCount; at += intervalSeconds) {
            midTimes.push(at);
        }
        replaceAdBreaks([
            ...(preBreak ? [preBreak] : []),
            ...midTimes.map((at_seconds) => ({ position: "mid" as const, at_seconds, max_ads: null, total_duration_seconds: null })),
            ...(postBreak ? [postBreak] : []),
        ]);
        toast({ title: "Mid-roll breaks generated", description: `${midTimes.length} break(s) every ${midRollIntervalMinutes} min.` });
    }, [getValues, midRollIntervalMinutes, replaceAdBreaks, toast]);

    const autoFillMidRolls = useCallback(() => {
        const durationSeconds = getValues("duration");
        if (!durationSeconds || durationSeconds <= 0) {
            toast({ title: "Set the video duration first", description: "Mid-roll timestamps are generated from the Duration field in Basic Information." });
            return;
        }
        const intervalSeconds = Math.max(1, midRollIntervalMinutes) * 60;
        if (durationSeconds - 30 < intervalSeconds) {
            toast({
                title: "Video too short for this interval",
                description: `Duration is ${Math.round(durationSeconds)}s, which doesn't leave room for a break every ${midRollIntervalMinutes} min (needs ≥ ${intervalSeconds + 30}s). Lower the interval or check Duration in Basic Information.`,
                variant: "destructive",
            });
            return;
        }
        const existingMidCount = (getValues("advertisement.ad_breaks") ?? []).filter((b) => b.position === "mid").length;
        if (existingMidCount > 0) {
            setConfirmReplaceBreaks({ durationSeconds, intervalSeconds, existingMidCount });
            return;
        }
        applyMidRollFill(durationSeconds, intervalSeconds);
    }, [getValues, midRollIntervalMinutes, toast, applyMidRollFill]);

    // Runs when zod validation blocks submission — surfaces the error (previously silent) and jumps to its tab
    const onInvalidSubmit = useCallback((formErrors: typeof errors) => {
        const found = findFirstFieldError(formErrors);
        const rootKey = found?.path[0];
        const target = rootKey ? FIELD_TAB_MAP[rootKey] : undefined;
        if (target?.group === "basic") setBasicTab(target.tab);
        if (target?.group === "access") setAccessTab(target.tab);
        if (target?.group === "media") setMediaTab(target.tab);
        toast({
            title: "Fix the highlighted field before publishing",
            description: found?.message ?? "Some fields need attention before this video can be published.",
            variant: "destructive",
        });
    }, [toast]);

    const titleValue = watch("title");
    const accessType = watch("access_type");
    const selectedRentalPlanId = watch("rental_plan_id");
    const trailerType = watch("trailer_type");
    const publishOption = watch("publish_option");
    const blockedCountries = watch("geo_fencing.blocked_countries");
    const languages = watch("language") ?? [];
    const adMode = watch("advertisement.ad_mode");
    const watchedAdBreaks = watch("advertisement.ad_breaks") ?? [];
    const midBreakCount = watchedAdBreaks.filter((b) => b.position === "mid").length;
    const preBreakCount = watchedAdBreaks.filter((b) => b.position === "pre").length;
    const postBreakCount = watchedAdBreaks.filter((b) => b.position === "post").length;
    const { data: advertisementInventory = [] } = useQuery<AdvertisementOut[]>({
        queryKey: ["advertisements", "active-video-inventory"],
        queryFn: () => listAdvertisements({ page_size: 200 }),
        staleTime: 60_000,
    });
    const activeVideoAds = advertisementInventory.filter(
        (advertisement) => advertisement.status === "active" && advertisement.ad_type === "video",
    );
    // Any ad_type is eligible for a cue-point placement (banner/overlay/popup/video), unlike
    // the pre/post/mid-roll pickers above which are video-only (IMA3/VMAP linear ad slots).
    const cuePointEligibleAds = advertisementInventory.filter(
        (advertisement) => advertisement.status === "active" && advertisement.media_url,
    );

    // Load categories filtered to "video" content type
    const [videoCategories, setVideoCategories] = useState<CategoryOut[]>([]);
    const [rentalPlans, setRentalPlans] = useState<ClientPricingPlanOut[]>([]);
    useEffect(() => {
        listCategories({ content_type: "video", page_size: 200 })
            .then((res) => setVideoCategories(res.items))
            .catch(() => {/* silently ignore — user will see empty dropdown */ });
    }, []);

    useEffect(() => {
        if (accessType !== "rental") return;
        listClientPlans({ plan_type: "rent", is_active: true })
            .then(setRentalPlans)
            .catch(() => setRentalPlans([]));
    }, [accessType]);

    // Re-apply categories after options load (edit mode: no options at mount time)
    useEffect(() => {
        if (mode === "edit" && defaultValues?.categories && videoCategories.length > 0) {
            setValue("categories", defaultValues.categories);
        }
    }, [videoCategories, mode, defaultValues, setValue]);

    // Auto-slug from title (create mode only)
    const slugSetByUser = useRef(false);
    useEffect(() => {
        if (mode === "create" && !slugSetByUser.current && titleValue) {
            setValue("slug", slugify(titleValue), { shouldValidate: false });
        }
    }, [titleValue, mode, setValue]);

    const ensureDraftBeforeUpload = useCallback(async (): Promise<boolean> => {
        const title = getValues("title").trim();
        let slug = getValues("slug").trim();
        if (!slug && title) {
            slug = slugify(title);
            setValue("slug", slug, { shouldValidate: true });
        }
        if (!title || !slug) {
            if (!title) setError("title", { message: "Title is required before uploading media" });
            if (!slug) setError("slug", { message: "Slug is required before uploading media" });
            toast({ title: "Add title and slug first", description: "A video draft must exist before media can be uploaded." });
            return false;
        }
        // Use the ref (synchronous) so concurrent uploads see the already-persisted ID
        if (persistedVideoIdRef.current) return true;

        setSavingDraft(true);
        try {
            draftCreationPromiseRef.current ??= createVideoDraft({ title, slug, status: "draft" });
            const draft = await draftCreationPromiseRef.current;
            persistedVideoIdRef.current = draft.id;
            if (mode === "create") {
                window.history.replaceState(null, "", `/admin/content/videos/${draft.id}/edit`);
            }
            toast({ title: "Draft saved", description: `“${draft.title}” was saved before upload.` });
            return true;
        } catch (err: unknown) {
            setError("root", { message: getApiErrorMessage(err, "Failed to save draft") });
            return false;
        } finally {
            draftCreationPromiseRef.current = null;
            setSavingDraft(false);
        }
    }, [getValues, setError, setValue, toast]);

    const persistVideoUrl = useCallback((url: string) => {
        setValue("video_url", url, { shouldDirty: true });
        if (!url) {
            setStreamPreviewUrl(null);
            setTranscodeStatus(null);
            setTranscodeProgress(0);
        }
        const id = persistedVideoIdRef.current;
        if (id) {
            const status = mode === "create" ? "draft" : getValues("status");
            const savePromise = updateVideo(id, { video_url: url || null, status })
                .then(() => {
                    if (!url) return undefined;
                    // Mark that transcode was already triggered for this URL to avoid duplicate triggers in onSubmit
                    transcodeTriggeredUrlRef.current = url;
                    setPreviewVideoId(id);
                    setStreamPreviewUrl(null);
                    setTranscodeStatus("pending");
                    setTranscodeProgress(0);
                    return triggerTranscode(id);
                })
                .catch((err: unknown) => {
                    setError("root", { message: getApiErrorMessage(err, "Failed to update video draft") });
                });
            pendingAssetSavesRef.current.add(savePromise);
            void savePromise.finally(() => pendingAssetSavesRef.current.delete(savePromise));
        }
    }, [getValues, mode, setError, setValue]);

    const persistThumbnail = useCallback((field: keyof VideoFormValues["thumbnails"], url: string) => {
        setValue(`thumbnails.${field}`, url, { shouldDirty: true });
        const id = persistedVideoIdRef.current;
        if (id) {
            const thumbnails = getValues("thumbnails");
            const status = mode === "create" ? "draft" : getValues("status");
            const savePromise = updateVideo(id, {
                status,
                thumbnails: {
                    video_banner: thumbnails.video_banner || null,
                    video_h_thumbnail: thumbnails.video_h_thumbnail || null,
                    video_w_thumbnail: thumbnails.video_w_thumbnail || null,
                    [field]: url || null,
                },
            }).catch((err: unknown) => {
                setError("root", { message: getApiErrorMessage(err, "Failed to update video draft") });
            });
            pendingAssetSavesRef.current.add(savePromise);
            void savePromise.finally(() => pendingAssetSavesRef.current.delete(savePromise));
        }
    }, [getValues, mode, setError, setValue]);

    // ── Submit ──────────────────────────────────────────────────────────────

    const onSubmit = async (data: VideoFormValues, targetStatus: "draft" | "published" = "published") => {
        if (!data.title.trim() || !data.slug.trim()) {
            if (!data.title.trim()) setError("title", { message: "Title is required" });
            if (!data.slug.trim()) setError("slug", { message: "Slug is required" });
            return;
        }
        // A cue-point ad can never outlast (or start after) the video it's pinned to
        for (const cue of data.advertisement.cue_points) {
            const ad = advertisementInventory.find((item) => item.id === cue.advertisement_id);
            if (!ad) continue;
            const effectiveDuration = ad.duration_seconds || 20;
            if (data.duration && cue.at_seconds >= data.duration) {
                toast({
                    title: "Cue-point time out of range",
                    description: `"${ad.title}" is set to play at ${cue.at_seconds}s, at or after the video's ${data.duration}s duration.`,
                    variant: "destructive",
                });
                return;
            }
            if (data.duration && effectiveDuration > data.duration) {
                toast({
                    title: "Ad duration exceeds video duration",
                    description: `"${ad.title}" runs ${effectiveDuration}s, longer than this video's ${data.duration}s duration, so it can't be placed here.`,
                    variant: "destructive",
                });
                return;
            }
        }
        if (targetStatus === "draft") setSavingDraft(true);
        const payload: VideoCreate = {
            title: data.title,
            slug: data.slug,
            short_description: data.short_description || null,
            long_description: data.long_description || null,
            categories: data.categories,
            age_rating: data.age_rating || null,
            content_classification: data.content_classification || null,
            language: data.language ?? [],
            rating: data.rating,
            duration: data.duration,
            cast_crew: data.cast_crew
                .filter((m) => m.name && m.role)
                .map((m) => ({ name: m.name!, role: m.role!, character: m.character })),
            related_video_ids: data.related_video_ids,
            geo_fencing: {
                blocked_countries: data.geo_fencing.blocked_countries ?? [],
                allowed_countries: data.geo_fencing.allowed_countries ?? [],
            },
            intro_times: {
                skip_start_time: data.intro_times.skip_start_time ?? null,
                skip_end_time: data.intro_times.skip_end_time ?? null,
                recap_start_time: data.intro_times.recap_start_time ?? null,
                recap_end_time: data.intro_times.recap_end_time ?? null,
                skip_start_session: data.intro_times.skip_start_session ?? null,
                skip_end_session: data.intro_times.skip_end_session ?? null,
            },
            is_featured: data.is_featured,
            is_active: data.is_active,
            status: targetStatus,
            is_slider: data.is_slider,
            is_thumbnail: data.is_thumbnail,
            advertisement: {
                pre_ad_id: data.advertisement.pre_ad_id || null,
                post_ad_id: data.advertisement.post_ad_id || null,
                mid_category_ad_id: data.advertisement.mid_category_ad_id || null,
                mid_ad_sequence_time: data.advertisement.mid_ad_sequence_time,
                ad_mode: data.advertisement.ad_mode,
                vmap_tag_url: data.advertisement.vmap_tag_url || null,
                vast_tag_url: data.advertisement.vast_tag_url || null,
                csai_vmap_tag_url: data.advertisement.vmap_tag_url || null,
                csai_vast_tag_url: data.advertisement.vast_tag_url || null,
                ssai_enabled: data.advertisement.ssai_enabled,
                ad_breaks: data.advertisement.ad_breaks.map((b) => ({
                    position: b.position,
                    at_seconds: b.position === "mid" ? b.at_seconds : null,
                    max_ads: b.max_ads,
                    total_duration_seconds: b.total_duration_seconds,
                })),
                cue_points: data.advertisement.cue_points.map((c) => ({
                    advertisement_id: c.advertisement_id,
                    at_seconds: c.at_seconds,
                })),
            },
            video_url: data.video_url || null,
            thumbnails: {
                video_banner: data.thumbnails.video_banner || null,
                video_h_thumbnail: data.thumbnails.video_h_thumbnail || null,
                video_w_thumbnail: data.thumbnails.video_w_thumbnail || null,
            },
            trailer_type: data.trailer_type,
            trailer_url: data.trailer_url || null,
            access_type: data.access_type,
            subscription_plan_ids: data.access_type === "rental" && data.rental_plan_id ? [data.rental_plan_id] : [],
            ppv_price: null,
            publish_option: data.publish_option,
            publish_at: data.publish_option === "later" ? (data.publish_at || null) : null,
            seo: {
                meta_title: data.seo.meta_title || null,
                meta_description: data.seo.meta_description || null,
                meta_keywords: data.seo.meta_keywords || null,
                og_image_url: data.seo.og_image_url || null,
            },
        };

        try {
            if (draftCreationPromiseRef.current) {
                const draft = await draftCreationPromiseRef.current;
                persistedVideoIdRef.current = draft.id;
            }
            await Promise.all([...pendingAssetSavesRef.current]);
            let savedVideo;
            const existingId = persistedVideoIdRef.current;
            if (existingId) {
                savedVideo = await updateVideo(existingId, payload);
            } else {
                savedVideo = await createVideo(payload);
                persistedVideoIdRef.current = savedVideo.id;
            }

            // Auto-trigger MediaConvert transcoding if a video file is present AND content changed.
            // In CREATE mode: always fire when video_url is set.
            // In EDIT mode: only fire when video_url changed from the original (indicating new upload).
            // Skip if the upload path already triggered transcoding for this URL (persistVideoUrl).
            const videoContentChanged = savedVideo.video_url !== originalVideoUrlRef.current;
            const shouldTrigger = !!savedVideo.video_url && 
                (mode === "create" ? true : videoContentChanged) &&
                transcodeTriggeredUrlRef.current !== savedVideo.video_url;
            if (shouldTrigger) {
                // Fire & forget — don't block the redirect
                triggerTranscode(savedVideo.id).catch(() => {/* webhook will handle errors */});
                toast({
                    title: "HLS generation started",
                    description: "Your video is being processed for streaming. This may take several minutes.",
                });
            }

            toast({
                title: targetStatus === "draft" ? "Draft saved" : "Video published",
                description: `“${savedVideo.title}” was saved successfully.`,
                variant: "success",
            });
            // Only navigate away when publishing; drafts stay on the page
            if (targetStatus === "published") {
                router.push("/admin/content/videos");
            }
        } catch (err: unknown) {
            const message = getApiErrorMessage(err, "Failed to save video");
            setError("root", { message });
            // The inline banner sits above a fixed footer and can be missed on a long form — always surface a toast too.
            toast({ title: "Could not save video", description: message, variant: "destructive" });
        } finally {
            if (targetStatus === "draft") setSavingDraft(false);
        }
    };

    // ─── Render ──────────────────────────────────────────────────────────────

    return (
        <>
            <form onSubmit={handleSubmit((data) => onSubmit(data, "published"), onInvalidSubmit)} className="w-full">
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start mb-14">

                    {/* ══════════════ LEFT COLUMN ══════════════ */}
                    <div className="space-y-6 col-span-2">

                        {/* ── Tab Group 1 ─────────────────────────────────────── */}
                        <Tabs value={basicTab} onValueChange={setBasicTab} className="w-full">
                            <TabsList className="mb-4">
                                <TabsTrigger value="basic" className="flex items-center gap-2">
                                    <FileText size={14} />
                                    Basic Information
                                </TabsTrigger>
                                <TabsTrigger value="cast" className="flex items-center gap-2">
                                    <Users size={14} />
                                    Cast &amp; Crew
                                </TabsTrigger>
                                <TabsTrigger value="intro" className="flex items-center gap-2">
                                    <Clock size={14} />
                                    Intro &amp; Skip
                                </TabsTrigger>
                                <TabsTrigger value="ad" className="flex items-center gap-2">
                                    <Zap size={14} />
                                    Advertisement
                                </TabsTrigger>
                                <TabsTrigger value="seo" className="flex items-center gap-2">
                                    <Search size={14} />
                                    SEO
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="basic">
                                <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
                                    <SectionHeading>Basic Information</SectionHeading>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="block text-xs font-semibold text-muted-foreground">Title *</label>
                                            <input {...register("title")} autoFocus placeholder="e.g. Inception" className={inputCls(!!errors.title)} />
                                            <FieldError msg={errors.title?.message} />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="block text-xs font-semibold text-muted-foreground">Slug *</label>
                                            <input
                                                {...register("slug", { onChange: () => { slugSetByUser.current = true; } })}
                                                placeholder="inception"
                                                disabled={mode === "edit"}
                                                className={`${inputCls(!!errors.slug)} disabled:opacity-40`}
                                            />
                                            <FieldError msg={errors.slug?.message} />
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex items-center justify-between">
                                            <label className="block text-xs font-semibold text-muted-foreground">Short Description</label>
                                            <AiWriteButton
                                                title={titleValue}
                                                category={videoCategories.find((c) => c.slug === watch("categories")[0])?.name}
                                                hint="short"
                                                onAccept={(text) => setValue("short_description", text)}
                                            />
                                        </div>
                                        <textarea {...register("short_description")} rows={2} placeholder="Brief summary shown in cards (max ~160 chars)" className={textareaCls(2)} />
                                    </div>

                                    <div className="space-y-1">
                                        <div className="flex items-center justify-between">
                                            <label className="block text-xs font-semibold text-muted-foreground">Long Description</label>
                                            <AiWriteButton
                                                title={titleValue}
                                                category={videoCategories.find((c) => c.slug === watch("categories")[0])?.name}
                                                hint="long"
                                                onAccept={(text) => setValue("long_description", text)}
                                            />
                                        </div>
                                        <textarea {...register("long_description")} rows={6} placeholder="Full synopsis, plot details, background…" className={textareaCls(6)} />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
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
                                                            {/* Selected pills */}
                                                            {selected.length > 0 && (
                                                                <div className="flex flex-wrap gap-1.5">
                                                                    {selected.map((slug) => {
                                                                        const cat = videoCategories.find((c) => c.slug === slug);
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
                                                            {/* Dropdown to add more */}
                                                            <div className="relative">
                                                                <select
                                                                    value=""
                                                                    onChange={(e) => { if (e.target.value) toggle(e.target.value); }}
                                                                    className={selectCls()}
                                                                >
                                                                    <option value="">+ Add category…</option>
                                                                    {videoCategories
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
                                            <label className="block text-xs font-semibold text-muted-foreground">Content Classification</label>
                                            <div className="relative">
                                                <select {...register("content_classification")} className={selectCls()}>
                                                    <option value="">— Select —</option>
                                                    {CONTENT_CLASSIFICATIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                                                </select>
                                                <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="block text-xs font-semibold text-muted-foreground">Age Rating</label>
                                            <div className="relative">
                                                <select {...register("age_rating")} className={selectCls()}>
                                                    <option value="">— Select —</option>
                                                    {AGE_RATINGS.map((r) => <option key={r} value={r}>{r}</option>)}
                                                </select>
                                                <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="block text-xs font-semibold text-muted-foreground">Video Language</label>
                                            <CheckboxDropdown
                                                selected={languages}
                                                onChange={(v) => setValue("language", v)}
                                                placeholder="+ Select languages"
                                                options={LANGUAGE_OPTIONS}
                                                columns={2}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="block text-xs font-semibold text-muted-foreground">Rating (0–10)</label>
                                            <Controller
                                                name="rating"
                                                control={control}
                                                render={({ field }) => (
                                                    <input
                                                        type="number" min={0} max={10} step={0.1}
                                                        value={field.value ?? ""}
                                                        onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                                                        placeholder="8.4"
                                                        className={inputCls(!!errors.rating)}
                                                    />
                                                )}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="block text-xs font-semibold text-muted-foreground">Duration (seconds)</label>
                                            <Controller
                                                name="duration"
                                                control={control}
                                                render={({ field }) => (
                                                    <input
                                                        type="number" min={0}
                                                        value={field.value ?? ""}
                                                        onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                                                        placeholder="7380 (=2h 3m)"
                                                        className={inputCls(!!errors.duration)}
                                                    />
                                                )}
                                            />
                                        </div>
                                    </div>
                                </section>
                            </TabsContent>

                            <TabsContent value="cast">
                                <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <SectionHeading>Cast &amp; Crew</SectionHeading>
                                <button
                                    type="button"
                                    onClick={() => appendCast({ name: "", role: "", character: "" })}
                                    className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                                >
                                    <Plus size={13} /> Add Person
                                </button>
                            </div>

                            {castFields.length === 0 && (
                                <p className="text-xs text-muted-foreground py-2">No cast or crew added yet.</p>
                            )}

                            <div className="space-y-3">
                                {castFields.map((field, index) => (
                                    <div key={field.id} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-start">
                                        <div className="space-y-1">
                                            <input
                                                {...register(`cast_crew.${index}.name`)}
                                                placeholder="Name"
                                                className={inputCls(!!errors.cast_crew?.[index]?.name)}
                                            />
                                            <FieldError msg={errors.cast_crew?.[index]?.name?.message} />
                                        </div>
                                        <div className="relative">
                                            <select {...register(`cast_crew.${index}.role`)} className={selectCls()}>
                                                <option value="">Role</option>
                                                {CREW_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                                            </select>
                                            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                                        </div>
                                        <input
                                            {...register(`cast_crew.${index}.character`)}
                                            placeholder="Character (optional)"
                                            className={inputCls()}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => removeCast(index)}
                                            className="p-2 mt-0.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/8 transition-colors"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                                </section>
                            </TabsContent>

                            <TabsContent value="intro">
                                <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
                                    <SectionHeading>
                                        Intro &amp; Skip Times{" "}
                                        <span className="font-normal normal-case opacity-60">(blank = disabled, values in seconds)</span>
                                    </SectionHeading>

                                    <div className="grid grid-cols-2 gap-4">
                                        {(
                                            [
                                                ["intro_times.skip_start_time", "Skip Start Time"],
                                                ["intro_times.skip_end_time", "Skip End Time"],
                                                ["intro_times.recap_start_time", "Recap Start Time"],
                                                ["intro_times.recap_end_time", "Recap End Time"],
                                                ["intro_times.skip_start_session", "Skip Start Session"],
                                                ["intro_times.skip_end_session", "Skip End Session"],
                                            ] as const
                                        ).map(([name, label]) => (
                                            <div key={name} className="space-y-1">
                                                <label className="block text-xs font-semibold text-muted-foreground">{label}</label>
                                                <Controller
                                                    name={name}
                                                    control={control}
                                                    render={({ field }) => (
                                                        <input
                                                            type="number" min={0}
                                                            value={field.value ?? ""}
                                                            onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                                                            placeholder="seconds"
                                                            className={inputCls()}
                                                        />
                                                    )}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            </TabsContent>

                            <TabsContent value="ad">
                                <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
                                    <SectionHeading>Advertisement</SectionHeading>
                                    <p className="text-xs text-muted-foreground">
                                        In CSAI/Hybrid mode, Pre-roll, Post-roll and Mid-roll ads play through the same IMA3
                                        player used for VMAP/VAST tags — a dynamically generated schedule is built from
                                        whichever ad(s) below resolve for this slot. This requires an active <span className="text-foreground font-medium">Placement</span> rule
                                        (Admin → Advertisements → Placements) targeting Pre-roll/Mid-roll/Post-roll for this video
                                        (or all videos) — the ID pickers below only pin down which ad fills that slot, they don&apos;t
                                        create the assignment by themselves.
                                    </p>
                                    <FieldError msg={findFirstFieldError(errors.advertisement)?.message} />
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="block text-xs font-semibold text-muted-foreground">Ad Mode</label>
                                            <select {...register("advertisement.ad_mode")} className={selectCls()}>
                                                <option value="hybrid">Hybrid (SSAI + CSAI fallback)</option>
                                                <option value="ssai">SSAI only</option>
                                                <option value="csai">CSAI only</option>
                                                <option value="none">No ads</option>
                                            </select>
                                        </div>
                                        <label className="flex items-center gap-2 text-sm text-foreground mt-6">
                                            <input
                                                type="checkbox"
                                                {...register("advertisement.ssai_enabled")}
                                                className="h-4 w-4 accent-primary"
                                            />
                                            Enable SSAI override
                                        </label>
                                        <div className="space-y-1">
                                            <label className="block text-xs font-semibold text-muted-foreground">Pre-roll Ad ID</label>
                                            <select {...register("advertisement.pre_ad_id")} className={selectCls()}>
                                                <option value="">Automatic by placement priority</option>
                                                {activeVideoAds.map((advertisement) => (
                                                    <option key={advertisement.id} value={advertisement.id}>{advertisement.title}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="block text-xs font-semibold text-muted-foreground">Post-roll Ad ID</label>
                                            <select {...register("advertisement.post_ad_id")} className={selectCls()}>
                                                <option value="">Automatic by placement priority</option>
                                                {activeVideoAds.map((advertisement) => (
                                                    <option key={advertisement.id} value={advertisement.id}>{advertisement.title}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="block text-xs font-semibold text-muted-foreground">Mid-roll Campaign</label>
                                            <select {...register("advertisement.mid_category_ad_id")} className={selectCls()}>
                                                <option value="">Automatic by placement priority</option>
                                                {activeVideoAds.map((advertisement) => (
                                                    <option key={advertisement.id} value={advertisement.id}>{advertisement.title}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="block text-xs font-semibold text-muted-foreground">Mid-roll Sequence Time (seconds)</label>
                                            <Controller
                                                name="advertisement.mid_ad_sequence_time"
                                                control={control}
                                                render={({ field }) => (
                                                    <input
                                                        type="number" min={0}
                                                        value={field.value ?? ""}
                                                        onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                                                        placeholder="e.g. 300 (= 5 min in)"
                                                        className={inputCls()}
                                                    />
                                                )}
                                            />
                                        </div>
                                        <div className="space-y-1 col-span-2">
                                            <label className="block text-xs font-semibold text-muted-foreground">VMAP Tag URL</label>
                                            <input
                                                {...register("advertisement.vmap_tag_url")}
                                                placeholder="https://pubads.g.doubleclick.net/...output=vmap"
                                                className={inputCls()}
                                            />
                                        </div>
                                        <div className="space-y-1 col-span-2">
                                            <label className="block text-xs font-semibold text-muted-foreground">VAST Tag URL (fallback)</label>
                                            <input
                                                {...register("advertisement.vast_tag_url")}
                                                placeholder="https://pubads.g.doubleclick.net/...output=vast"
                                                className={inputCls()}
                                            />
                                        </div>
                                    </div>

                                    <div className="pt-1 border-t border-border space-y-3">
                                        <div className="flex items-center justify-between gap-2 flex-wrap">
                                            <div>
                                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                                    Ad Break Scheduler
                                                </p>
                                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                                    {preBreakCount + midBreakCount + postBreakCount === 0
                                                        ? "No breaks scheduled yet."
                                                        : `${preBreakCount + midBreakCount + postBreakCount} break(s) scheduled — ${preBreakCount} pre-roll, ${midBreakCount} mid-roll, ${postBreakCount} post-roll.`}
                                                    {" "}Each row below is one ad slot; not yet saved until you click Save/Update below.
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                    Every
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        value={midRollIntervalMinutes}
                                                        onChange={(e) => setMidRollIntervalMinutes(Math.max(1, Number(e.target.value) || 1))}
                                                        className="w-14 rounded-md border border-border bg-secondary/40 px-2 py-1 text-xs text-foreground"
                                                    />
                                                    min
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={autoFillMidRolls}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs border border-border hover:border-primary/50 transition-colors"
                                                >
                                                    Auto-fill Mid-rolls
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => appendAdBreak({ position: "mid", at_seconds: null, max_ads: null, total_duration_seconds: null })}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs border border-border hover:border-primary/50 transition-colors"
                                                >
                                                    <Plus size={12} /> Add Break
                                                </button>
                                            </div>
                                        </div>

                                        {adBreakFields.length === 0 ? (
                                            <p className="text-xs text-muted-foreground">
                                                No explicit breaks configured. Mid-roll ads (if any) fall back to "Mid-roll Sequence
                                                Time" above, and a manual VMAP/VAST Tag URL can still control scheduling independently.
                                            </p>
                                        ) : (
                                            <div className="space-y-2">
                                                {adBreakFields.map((field, index) => (
                                                    <div key={field.id} className="rounded-lg border border-border bg-secondary/25 p-3 grid grid-cols-12 gap-2 items-end">
                                                        <div className="col-span-3 space-y-1">
                                                            <label className="block text-[11px] font-semibold text-muted-foreground">Position</label>
                                                            <select
                                                                {...register(`advertisement.ad_breaks.${index}.position`)}
                                                                className={selectCls()}
                                                            >
                                                                <option value="pre">Pre</option>
                                                                <option value="mid">Mid</option>
                                                                <option value="post">Post</option>
                                                            </select>
                                                        </div>
                                                        <div className="col-span-3 space-y-1">
                                                            <label className="block text-[11px] font-semibold text-muted-foreground">At (sec)</label>
                                                            <Controller
                                                                name={`advertisement.ad_breaks.${index}.at_seconds`}
                                                                control={control}
                                                                render={({ field: f }) => (
                                                                    <input
                                                                        type="number"
                                                                        min={0}
                                                                        value={f.value ?? ""}
                                                                        onChange={(e) => f.onChange(e.target.value === "" ? null : Number(e.target.value))}
                                                                        disabled={watch(`advertisement.ad_breaks.${index}.position`) !== "mid"}
                                                                        className={inputCls()}
                                                                        placeholder="300"
                                                                    />
                                                                )}
                                                            />
                                                        </div>
                                                        <div className="col-span-3 space-y-1">
                                                            <label className="block text-[11px] font-semibold text-muted-foreground">Max Ads</label>
                                                            <Controller
                                                                name={`advertisement.ad_breaks.${index}.max_ads`}
                                                                control={control}
                                                                render={({ field: f }) => (
                                                                    <input
                                                                        type="number"
                                                                        min={1}
                                                                        value={f.value ?? ""}
                                                                        onChange={(e) => f.onChange(e.target.value === "" ? null : Number(e.target.value))}
                                                                        className={inputCls()}
                                                                        placeholder="2"
                                                                    />
                                                                )}
                                                            />
                                                        </div>
                                                        <div className="col-span-2 space-y-1">
                                                            <label className="block text-[11px] font-semibold text-muted-foreground">Pod Sec</label>
                                                            <Controller
                                                                name={`advertisement.ad_breaks.${index}.total_duration_seconds`}
                                                                control={control}
                                                                render={({ field: f }) => (
                                                                    <input
                                                                        type="number"
                                                                        min={1}
                                                                        value={f.value ?? ""}
                                                                        onChange={(e) => f.onChange(e.target.value === "" ? null : Number(e.target.value))}
                                                                        className={inputCls()}
                                                                        placeholder="60"
                                                                    />
                                                                )}
                                                            />
                                                        </div>
                                                        <div className="col-span-1 flex justify-end">
                                                            <button
                                                                type="button"
                                                                onClick={() => removeAdBreak(index)}
                                                                className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                                                            >
                                                                <Trash2 size={13} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        <p className="text-[11px] text-muted-foreground">
                                            Recommended OTT policy: 1 pre-roll, 1 post-roll, and spaced mid-rolls for long-form content. Current mode: <span className="text-foreground font-medium">{adMode}</span>.
                                            Max Ads / Pod Sec are stored for reporting but don&apos;t yet cap how many ads play back-to-back.
                                        </p>
                                    </div>

                                    <div className="pt-1 border-t border-border space-y-3">
                                        <div className="flex items-center justify-between gap-2 flex-wrap">
                                            <div>
                                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                                    Cue-Point Ads (Any Ad Type)
                                                </p>
                                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                                    {cuePointFields.length === 0
                                                        ? "No cue-point ads scheduled."
                                                        : `${cuePointFields.length} ad(s) scheduled to show at an exact video timestamp.`}
                                                    {" "}Each plays for its own duration (or a 20s default) then auto-hides — works for banner, overlay, popup, or video ads alike.
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => appendCuePoint({ advertisement_id: "", at_seconds: 0 })}
                                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs border border-border hover:border-primary/50 transition-colors"
                                            >
                                                <Plus size={12} /> Add Cue-Point Ad
                                            </button>
                                        </div>

                                        {cuePointFields.length === 0 ? (
                                            <p className="text-xs text-muted-foreground">
                                                No ads pinned to a specific moment. Use this to sync a banner/overlay/popup (or a video
                                                ad) to content beats — e.g. the same 120/240/360s marks used above — instead of the
                                                session-long cycle used for untimed display ads.
                                            </p>
                                        ) : (
                                            <div className="space-y-2">
                                                {cuePointFields.map((field, index) => {
                                                    const selectedAdId = watch(`advertisement.cue_points.${index}.advertisement_id`);
                                                    const selectedAd = cuePointEligibleAds.find((a) => a.id === selectedAdId);
                                                    const atSeconds = watch(`advertisement.cue_points.${index}.at_seconds`);
                                                    const videoDuration = watch("duration");
                                                    const effectiveAdDuration = selectedAd?.duration_seconds || 20;
                                                    const exceedsDuration = !!videoDuration && effectiveAdDuration > videoDuration;
                                                    const startsPastEnd = !!videoDuration && typeof atSeconds === "number" && atSeconds >= videoDuration;
                                                    const hideAt = typeof atSeconds === "number" ? atSeconds + effectiveAdDuration : null;
                                                    return (
                                                        <div key={field.id} className="rounded-lg border border-border bg-secondary/25 p-3 grid grid-cols-12 gap-2 items-end">
                                                            <div className="col-span-5 space-y-1">
                                                                <label className="block text-[11px] font-semibold text-muted-foreground">Ad</label>
                                                                <select
                                                                    {...register(`advertisement.cue_points.${index}.advertisement_id`)}
                                                                    className={selectCls()}
                                                                >
                                                                    <option value="">Select an ad…</option>
                                                                    {cuePointEligibleAds.map((ad) => (
                                                                        <option key={ad.id} value={ad.id}>
                                                                            {ad.title} ({ad.ad_type}{ad.duration_seconds ? `, ${ad.duration_seconds}s` : ""})
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                            <div className="col-span-3 space-y-1">
                                                                <label className="block text-[11px] font-semibold text-muted-foreground">At (sec)</label>
                                                                <Controller
                                                                    name={`advertisement.cue_points.${index}.at_seconds`}
                                                                    control={control}
                                                                    render={({ field: f }) => (
                                                                        <input
                                                                            type="number"
                                                                            min={0}
                                                                            value={f.value ?? ""}
                                                                            onChange={(e) => f.onChange(e.target.value === "" ? 0 : Number(e.target.value))}
                                                                            className={inputCls()}
                                                                            placeholder="120"
                                                                        />
                                                                    )}
                                                                />
                                                            </div>
                                                            <div className="col-span-3 space-y-1">
                                                                <label className="block text-[11px] font-semibold text-muted-foreground">Hides At</label>
                                                                <div className={`${inputCls()} flex items-center bg-secondary/40 text-muted-foreground`}>
                                                                    {hideAt !== null ? `${hideAt}s` : "—"}
                                                                </div>
                                                            </div>
                                                            <div className="col-span-1 flex justify-end">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => removeCuePoint(index)}
                                                                    className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                                                                >
                                                                    <Trash2 size={13} />
                                                                </button>
                                                            </div>
                                                            {(exceedsDuration || startsPastEnd) && (
                                                                <p className="col-span-12 text-[11px] text-red-400">
                                                                    {exceedsDuration
                                                                        ? `This ad's duration (${effectiveAdDuration}s) exceeds the video's duration (${videoDuration}s) — it can't be placed on this video.`
                                                                        : `This cue point (${atSeconds}s) is at or after the video's duration (${videoDuration}s).`}
                                                                </p>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        <p className="text-[11px] text-muted-foreground">
                                            Industry pattern: cue-point ads sync to content position (like non-linear/companion ads in
                                            VAST or JW Player ad rules) — reuse the same 120/240/360s marks as your Ad Break Scheduler
                                            above. The frequency-capped banner cycling elsewhere in the player still applies to display
                                            ads with no cue point set here.
                                        </p>
                                    </div>
                                </section>
                            </TabsContent>

                            <TabsContent value="seo">
                                <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
                                    <SectionHeading>SEO</SectionHeading>

                                    <div className="space-y-1">
                                        <label className="block text-xs font-semibold text-muted-foreground">Meta Title</label>
                                        <input {...register("seo.meta_title")} placeholder="Page title for search engines" className={inputCls()} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="block text-xs font-semibold text-muted-foreground">Meta Description</label>
                                        <textarea {...register("seo.meta_description")} rows={3} placeholder="150–160 character description for search snippets" className={textareaCls(3)} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="block text-xs font-semibold text-muted-foreground">Meta Keywords</label>
                                        <input {...register("seo.meta_keywords")} placeholder="keyword1, keyword2, keyword3" className={inputCls()} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="block text-xs font-semibold text-muted-foreground">OG Image URL</label>
                                        <input {...register("seo.og_image_url")} placeholder="https://…" className={inputCls()} />
                                    </div>
                                </section>
                            </TabsContent>
                        </Tabs>

                        {/* ── Tab Group 2 ─────────────────────────────────────── */}
                        <Tabs value={accessTab} onValueChange={setAccessTab} className="w-full">
                            <TabsList className="mb-4">
                                <TabsTrigger value="access" className="flex items-center gap-2">
                                    <CheckCircle2 size={14} />
                                    User Access
                                </TabsTrigger>
                                <TabsTrigger value="geo" className="flex items-center gap-2">
                                    <Globe size={14} />
                                    Geo Fencing
                                </TabsTrigger>
                                <TabsTrigger value="visibility" className="flex items-center gap-2">
                                    <Eye size={14} />
                                    Visibility
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="access">
                                <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
                                    <SectionHeading>User Access</SectionHeading>
                                    <div className="space-y-1">
                                        <div className="relative">
                                            <select
                                                {...register("access_type", {
                                                    onChange: () => {
                                                        setValue("rental_plan_id", null);
                                                    },
                                                })}
                                                className={selectCls()}
                                            >
                                                <option value="free">Free</option>
                                                <option value="subscription">Subscription</option>
                                                <option value="rental">Rent</option>
                                            </select>
                                            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                                        </div>
                                    </div>
                                    {accessType === "subscription" && (
                                        <div className="rounded-lg border border-primary/20 bg-primary/5 px-3.5 py-3 text-xs text-muted-foreground">
                                            <p className="font-semibold text-foreground mb-0.5">All Subscribers</p>
                                            <p>Any user with an active subscription plan will have access to this video. No further configuration required.</p>
                                        </div>
                                    )}
                                    {accessType === "rental" && (
                                        rentalPlans.length > 0 ? (
                                            <div className="space-y-2">
                                                <label className="block text-xs font-semibold text-muted-foreground">Rent Plan</label>
                                                <div className="space-y-1.5">
                                                    {rentalPlans.map((plan) => (
                                                        <label key={plan.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-2.5 transition-colors hover:border-primary/40">
                                                            <input
                                                                type="radio"
                                                                name="rental_plan_id"
                                                                checked={selectedRentalPlanId === plan.id}
                                                                onChange={() => setValue("rental_plan_id", plan.id, { shouldDirty: true })}
                                                                className="h-3.5 w-3.5 shrink-0 accent-primary"
                                                            />
                                                            <span className="min-w-0">
                                                                <span className="block truncate text-xs font-medium text-foreground">{plan.name}</span>
                                                                <span className="text-[11px] text-muted-foreground">{plan.currency} {plan.price}</span>
                                                            </span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="text-xs text-muted-foreground">No active Rent pricing plans are available.</p>
                                        )
                                    )}
                                </section>
                            </TabsContent>

                            <TabsContent value="geo">
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
                            </TabsContent>

                            <TabsContent value="visibility">
                                <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
                                    <SectionHeading>Visibility</SectionHeading>
                                    <Controller
                                        name="publish_option"
                                        control={control}
                                        render={({ field }) => (
                                            <div className="flex gap-3">
                                                {(["now", "later"] as const).map((opt) => (
                                                    <button
                                                        key={opt}
                                                        type="button"
                                                        onClick={() => field.onChange(opt)}
                                                        className={`flex-1 py-2 rounded-lg border text-xs font-semibold capitalize transition-colors ${field.value === opt
                                                            ? "border-primary bg-primary/10 text-primary"
                                                            : "border-border text-muted-foreground hover:text-foreground"
                                                            }`}
                                                    >
                                                        {opt === "now" ? "Publish Now" : "Schedule"}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    />
                                    {publishOption === "later" && (
                                        <div className="space-y-1">
                                            <label className="block text-xs font-semibold text-muted-foreground">Publish At</label>
                                            <input
                                                {...register("publish_at")}
                                                type="datetime-local"
                                                className={inputCls()}
                                            />
                                        </div>
                                    )}
                                </section>
                            </TabsContent>
                        </Tabs>
                    </div>

                    {/* RIGHT COLUMN */}
                    <div className="space-y-6 col-span-1 xl:sticky xl:top-8">
                        <Tabs value={mediaTab} onValueChange={setMediaTab} className="w-full">
                            <TabsList className="mb-4">
                                <TabsTrigger value="video" className="flex items-center gap-2">
                                    <Film size={14} />
                                    Video
                                </TabsTrigger>
                                <TabsTrigger value="banner" className="flex items-center gap-2">
                                    <Image size={14} />
                                    Banner
                                </TabsTrigger>
                                <TabsTrigger value="thumbnails" className="flex items-center gap-2">
                                    <Image size={14} />
                                    Thumbnails
                                </TabsTrigger>
                                <TabsTrigger value="trailer" className="flex items-center gap-2">
                                    <Play size={14} />
                                    Trailer
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="video">
                                {/* Video Upload */}
                                <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
                                    <SectionHeading>
                                        <Film size={14} className="inline mr-1 -mt-0.5" />
                                        Video Upload
                                    </SectionHeading>
                                    <Controller name="video_url" control={control} render={({ field }) => (
                                        <S3VideoField
                                            label="Video File"
                                            hint="MP4, MKV, MOV up to 500 GB (multipart above 5 GB)"
                                            accept="video/mp4,video/x-matroska,video/quicktime,video/*"
                                            value={field.value ?? ""}
                                            thumbnailUrl={watch("thumbnails.video_banner") || watch("thumbnails.video_w_thumbnail") || undefined}
                                            streamPreviewUrl={streamPreviewUrl}
                                            streamVideoId={previewVideoId}
                                            streamDrmKeyToken={streamPreviewToken}
                                            transcodeStatus={transcodeStatus}
                                            transcodeProgress={transcodeProgress}
                                            onRetryTranscode={retryTranscode}
                                            onChange={persistVideoUrl}
                                            onDurationDetected={(seconds) => {
                                                setValue("duration", Math.round(seconds), { shouldDirty: true });
                                                toast({ title: "Duration detected", description: `Set to ${Math.round(seconds)}s from the uploaded file.` });
                                            }}
                                        />
                                    )} />
                                </section>
                            </TabsContent>

                            <TabsContent value="banner">
                                {/* Banner */}
                                <section className="rounded-2xl border border-border bg-card p-6 space-y-5">
                                    <SectionHeading>Banner</SectionHeading>
                                    <Controller name="thumbnails.video_banner" control={control} render={({ field }) => (
                                        <S3ImageField label="Video Banner (1920 × 1080 px)" hint="16:9 wide banner used in hero and detail pages" aspect="16:9" value={field.value ?? ""} onChange={(url) => persistThumbnail("video_banner", url)} onBeforeUpload={ensureDraftBeforeUpload} />
                                    )} />
                                </section>
                            </TabsContent>

                            <TabsContent value="thumbnails">
                                <section className="rounded-2xl border border-border bg-card p-6 space-y-5">
                                    <SectionHeading>Thumbnails</SectionHeading>
    
                                    {/* Portrait + Wide — stacked */}
                                    <div className="space-y-6">
                                        <Controller name="thumbnails.video_h_thumbnail" control={control} render={({ field }) => (
                                            <S3ImageField label="Portrait Thumbnail (600 × 900 px)" hint="2:3 tall poster" aspect="2:3" value={field.value ?? ""} onChange={(url) => persistThumbnail("video_h_thumbnail", url)} onBeforeUpload={ensureDraftBeforeUpload} />
                                        )} />
                                        <Controller name="thumbnails.video_w_thumbnail" control={control} render={({ field }) => (
                                            <S3ImageField label="Wide Thumbnail (1200 × 800 px)" hint="3:2 wide card" aspect="3:2" value={field.value ?? ""} onChange={(url) => persistThumbnail("video_w_thumbnail", url)} onBeforeUpload={ensureDraftBeforeUpload} />
                                        )} />
                                    </div>
                                </section>
                            </TabsContent>

                            <TabsContent value="trailer">
                                <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
                                    <SectionHeading>Trailer</SectionHeading>
                                    <Controller
                                        name="trailer_type"
                                        control={control}
                                        render={({ field }) => (
                                            <div className="flex gap-3">
                                                {(["upload", "url", null] as const).map((t) => (
                                                    <button
                                                        key={String(t)}
                                                        type="button"
                                                        onClick={() => field.onChange(t)}
                                                        className={`flex-1 py-2 rounded-lg border text-xs font-semibold capitalize transition-colors ${field.value === t
                                                            ? "border-primary bg-primary/10 text-primary"
                                                            : "border-border text-muted-foreground hover:text-foreground"
                                                            }`}
                                                    >
                                                        {t === null ? "None" : t === "upload" ? "Upload" : "URL"}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    />
                                    {trailerType === "url" && (
                                        <div className="space-y-1">
                                            <label className="block text-xs font-semibold text-muted-foreground">Trailer URL</label>
                                            <input {...register("trailer_url")} placeholder="https://youtube.com/watch?v=…" className={inputCls()} />
                                        </div>
                                    )}
                                    {trailerType === "upload" && (
                                        <Controller name="trailer_url" control={control} render={({ field }) => (
                                            <S3VideoField
                                                label="Trailer File"
                                                hint="MP4, MOV up to 500 GB (multipart above 5 GB)"
                                                accept="video/mp4,video/quicktime,video/*"
                                                value={field.value ?? ""}
                                                onChange={field.onChange}
                                                onBeforeUpload={ensureDraftBeforeUpload}
                                            />
                                        )} />
                                    )}
                                </section>
                            </TabsContent>
                        </Tabs>

                        {/* Status Settings */}
                        <section className="rounded-2xl border border-border bg-card p-6 space-y-2">
                            <SectionHeading>Status Settings</SectionHeading>
                            <Controller name="is_active" control={control} render={({ field }) => (
                                <LabeledSwitch checked={field.value} onCheckedChange={field.onChange} label="Active" description="Inactive videos are hidden from users" />
                            )} />
                            <div className="border-t border-border" />
                            <Controller name="is_featured" control={control} render={({ field }) => (
                                <LabeledSwitch checked={field.value} onCheckedChange={field.onChange} label="Featured" description="Show in featured / hero sections" />
                            )} />
                            <div className="border-t border-border" />
                            <Controller name="is_slider" control={control} render={({ field }) => (
                                <LabeledSwitch checked={field.value} onCheckedChange={field.onChange} label="Slider" description="Include in homepage slider" />
                            )} />
                            <div className="border-t border-border" />
                            <Controller name="is_thumbnail" control={control} render={({ field }) => (
                                <LabeledSwitch checked={field.value} onCheckedChange={field.onChange} label="Thumbnail View" description="Prefer thumbnail-first layout" />
                            )} />
                        </section>

                        {/* Related Videos */}
                        <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
                            <SectionHeading>Related Videos</SectionHeading>
                            <Controller
                                control={control}
                                name="related_video_ids"
                                render={({ field }) => (
                                    <RelatedVideoSearch
                                        value={field.value}
                                        onChange={field.onChange}
                                        excludeId={videoId}
                                    />
                                )}
                            />
                        </section>
                    </div>
                    {/* END RIGHT COLUMN */}
                </div>

                {/* ── Sticky footer action bar ──────────────────────────── */}
                {errors.root && (
                    <div className="flex items-center gap-2 rounded-lg px-4 py-3 mt-4 text-sm text-red-300 border border-red-500/20 bg-red-500/8">
                        <AlertTriangle size={14} /> {errors.root.message}
                    </div>
                )}

                <div className="fixed flex justify-end w-full z-30 items-center bottom-0 left-0  gap-2 px-6 p-2.5 border-t border-border/50 bg-background">
                    <button
                        type="button"
                        disabled={isSubmitting || savingDraft}
                        onClick={() => { void onSubmit(getValues(), "draft"); }}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border bg-card text-foreground text-sm font-semibold hover:bg-secondary transition-colors disabled:opacity-50"
                    >
                        {savingDraft
                            ? <Loader2 size={14} className="animate-spin" />
                            : null}
                        Save Draft
                    </button>
                    <button
                        type="submit"
                        disabled={isSubmitting || savingDraft}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition-all disabled:opacity-50"
                    >
                        {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                        {defaultValues?.status === "published" ? "Save Changes" : "Publish Video"}
                    </button>
                    <button
                        type="button"
                        onClick={() => router.push("/admin/content/videos")}
                        className="px-4 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            </form>

            <AlertDialog open={!!confirmReplaceBreaks} onOpenChange={(open) => { if (!open) setConfirmReplaceBreaks(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Replace existing mid-roll breaks?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This replaces the {confirmReplaceBreaks?.existingMidCount} existing mid-roll break(s) with one every {midRollIntervalMinutes} min. Pre-roll and post-roll breaks are kept as-is.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (confirmReplaceBreaks) applyMidRollFill(confirmReplaceBreaks.durationSeconds, confirmReplaceBreaks.intervalSeconds);
                                setConfirmReplaceBreaks(null);
                            }}
                        >
                            Replace
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
