"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import {
    ChevronDown, Upload, X, Loader2, AlertTriangle, CheckCircle2, Check,
    ImageIcon, Film,
} from "lucide-react";
import { LabeledSwitch } from "@/components/ui/labeled-switch";
import {
    createCategory, updateCategory, listCategories,
    type CategoryOut, type CategoryCreate, CATEGORY_CONTENT_TYPES,
} from "@/lib/api";
import { ENDPOINTS } from "@/lib/api/endpoints";
import apiClient from "@/lib/api/client";
import { resolveMediaUrl, resolveThumbnailUrl, resolveBannerUrl } from "@/lib/media";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toSlug(name: string) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}

function inputCls(hasError = false) {
    return `w-full h-9 rounded-lg bg-secondary border ${hasError ? "border-red-500/60" : "border-border"
        } px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors`;
}

function selectCls(hasError = false) {
    return `w-full h-9 rounded-lg bg-secondary border ${hasError ? "border-red-500/60" : "border-border"
        } px-3 pr-8 text-sm text-foreground appearance-none focus:outline-none focus:ring-1 focus:ring-primary transition-colors`;
}

function textareaCls() {
    return `w-full rounded-lg bg-secondary border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none`;
}

function FieldError({ msg }: { msg?: string }) {
    if (!msg) return null;
    return <p className="text-[11px] text-red-400 mt-0.5">{msg}</p>;
}

function SectionHeading({ children }: { children: React.ReactNode }) {
    return (
        <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">{children}</h3>
    );
}

// ─── Media asset type ─────────────────────────────────────────────────────────

interface MediaAsset {
    id: string;
    original_filename: string;
    url: string;
    display_url: string | null;
    content_type: string;
    width: number | null;
    height: number | null;
}

// ─── Image upload field (presign → S3 → confirm) ──────────────────────────────

interface ImageFieldProps {
    label: string;
    hint: string;
    aspect: "1:1" | "16:9";
    value: string | null;
    onChange: (url: string | null) => void;
    onChangeAssetId?: (id: string | null) => void;
    onOpenLibrary: () => void;
}

function ImageField({ label, hint, aspect, value, onChange, onChangeAssetId, onOpenLibrary }: ImageFieldProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);

    const handleFile = useCallback(
        async (file: File) => {
            if (!file.type.startsWith("image/")) {
                setUploadError("Please select an image file");
                return;
            }
            setUploading(true);
            setUploadError(null);
            try {
                const presignRes = await apiClient.post<{ upload_url: string; s3_key: string; storage_class?: string | null }>(
                    ENDPOINTS.admin.upload.presign,
                    { filename: file.name, content_type: file.type, file_size: file.size },
                );
                const { upload_url, s3_key, storage_class } = presignRes.data;

                // x-amz-storage-class must be sent if it was signed into the PUT URL
                const putHeaders: Record<string, string> = { "Content-Type": file.type };
                if (storage_class) putHeaders["x-amz-storage-class"] = storage_class;

                const putRes = await fetch(upload_url, {
                    method: "PUT",
                    body: file,
                    headers: putHeaders,
                });
                if (!putRes.ok) {
                    const statusCode = putRes.status;
                    // Consume body to avoid memory leaks; do NOT surface raw XML to users.
                    await putRes.text().catch(() => "");
                    const msg =
                        statusCode === 403
                            ? "Upload not allowed. Storage permissions may need to be configured."
                            : statusCode === 413
                                ? "File is too large to upload."
                                : "Upload failed. Please try again."
                    throw new Error(msg);
                }

                const dims = await new Promise<{ width: number; height: number }>((resolve) => {
                    const img = new window.Image();
                    const objectUrl = URL.createObjectURL(file);
                    img.onload = () => {
                        URL.revokeObjectURL(objectUrl);
                        resolve({ width: img.naturalWidth, height: img.naturalHeight });
                    };
                    img.onerror = () => {
                        URL.revokeObjectURL(objectUrl);
                        resolve({ width: 0, height: 0 });
                    };
                    img.src = objectUrl;
                });

                const confirmRes = await apiClient.post<{ id: string; url: string; display_url: string | null }>(
                    ENDPOINTS.admin.upload.confirm,
                    {
                        s3_key,
                        original_filename: file.name,
                        content_type: file.type,
                        file_size: file.size,
                        width: dims.width || null,
                        height: dims.height || null,
                    },
                );
                onChange(resolveMediaUrl(confirmRes.data) ?? confirmRes.data.url);
                onChangeAssetId?.(confirmRes.data.id);
            } catch (err: unknown) {
                const rawMsg = err instanceof Error ? err.message : "";
                // Never show XML or internal error details to the user.
                const isClean = rawMsg.length > 0 && !rawMsg.includes("<") && !rawMsg.includes("{");
                setUploadError(isClean ? rawMsg : "Upload failed. Please try again.");
            } finally {
                setUploading(false);
            }
        },
        [onChange, onChangeAssetId],
    );

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    };

    const previewH = aspect === "1:1" ? "h-40" : "h-28";

    return (
        <div className="space-y-2">
            <div>
                <label className="block text-xs font-semibold text-muted-foreground">
                    {label} <span className="font-normal opacity-50">({aspect})</span>
                </label>
                <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>
            </div>

            {/* Drop zone / preview */}
            <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => !value && inputRef.current?.click()}
                className={`relative rounded-xl border-2 overflow-hidden transition-colors ${value
                    ? "border-border cursor-default"
                    : "border-dashed border-border hover:border-primary/50 cursor-pointer group"
                    }`}
            >
                {value ? (
                    <div className={`relative ${previewH}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={value} alt={label} className="w-full h-full object-cover" />
                        {uploading ? (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                <Loader2 size={20} className="animate-spin text-white" />
                            </div>
                        ) : (
                            <div className="absolute inset-0 bg-black/0 hover:bg-black/50 transition-colors flex items-center justify-center gap-2 group">
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
                                    className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/70 text-white text-xs font-medium transition-opacity"
                                >
                                    <Upload size={12} /> Replace
                                </button>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        // De-link only — permanent delete is via Media Library
                                        onChange(null);
                                        onChangeAssetId?.(null);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2 py-1.5 rounded-lg bg-red-500/80 text-white text-xs font-medium transition-opacity"
                                >
                                    <X size={12} />
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className={`${previewH} flex flex-col items-center justify-center gap-2 text-muted-foreground group-hover:text-foreground transition-colors`}>
                        {uploading ? (
                            <Loader2 size={18} className="animate-spin" />
                        ) : (
                            <>
                                <ImageIcon size={18} />
                                <p className="text-xs font-medium">Click or drag image here</p>
                                <p className="text-[11px] opacity-60">JPG, PNG, WebP</p>
                            </>
                        )}
                    </div>
                )}
            </div>

            <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                    e.target.value = "";
                }}
            />

            {uploadError && <p className="text-[11px] text-red-400">{uploadError}</p>}

            <div className="flex gap-2">
                <button
                    type="button"
                    disabled={uploading}
                    onClick={() => inputRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors disabled:opacity-50"
                >
                    <Upload size={12} /> {uploading ? "Uploading…" : "Upload"}
                </button>
                <button
                    type="button"
                    disabled={uploading}
                    onClick={onOpenLibrary}
                    className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors disabled:opacity-50"
                >
                    <ImageIcon size={12} /> Media Library
                </button>
            </div>
        </div>
    );
}

// ─── Media library modal ──────────────────────────────────────────────────────

function MediaLibraryModal({
    open,
    onClose,
    onSelect,
}: {
    open: boolean;
    onClose: () => void;
    onSelect: (url: string, assetId: string) => void;
}) {
    const [assets, setAssets] = useState<MediaAsset[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!open) return;
        setLoading(true);
        apiClient
            .get<{ items: MediaAsset[] }>(ENDPOINTS.admin.upload.mediaLibrary, { params: { page_size: 100 } })
            .then((r) => setAssets(r.data.items))
            .finally(() => setLoading(false));
    }, [open]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-3xl max-h-[80vh] flex flex-col rounded-2xl border border-border bg-card shadow-2xl">
                <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
                    <h2 className="text-base font-semibold text-foreground">Media Library</h2>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto min-h-0 p-5">
                    {loading ? (
                        <div className="grid grid-cols-4 gap-3">
                            {Array.from({ length: 8 }).map((_, i) => (
                                <div key={i} className="aspect-square rounded-xl bg-muted animate-pulse" />
                            ))}
                        </div>
                    ) : assets.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
                            <ImageIcon size={32} className="opacity-30" />
                            <p className="text-sm">No media assets yet</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-4 gap-3">
                            {assets.map((asset) => {
                                const isVideo = asset.content_type.startsWith("video/");
                                const displaySrc = resolveMediaUrl(asset) ?? asset.url;
                                return (
                                    <button
                                        key={asset.id}
                                        type="button"
                                        onClick={() => { onSelect(displaySrc, asset.id); onClose(); }}
                                        className="group relative aspect-square rounded-xl overflow-hidden border border-border hover:border-primary transition-colors bg-secondary"
                                    >
                                        {isVideo ? (
                                            <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-muted-foreground bg-black/40">
                                                <Film size={22} className="opacity-60" />
                                                <span className="text-[10px] px-1 text-center line-clamp-2 opacity-50">{asset.original_filename}</span>
                                            </div>
                                        ) : (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={displaySrc}
                                                alt={asset.original_filename}
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                            />
                                        )}
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                                            <Check size={20} className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Zod schema ───────────────────────────────────────────────────────────────

const schema = z.object({
    name: z.string().min(1, "Name is required"),
    slug: z
        .string()
        .min(1, "Slug is required")
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lowercase letters, numbers and hyphens only"),
    description: z.string().optional(),
    is_parent: z.boolean(),
    parent_id: z.string().nullable().optional(),
    content_types: z.array(z.string()).default([]),
    thumbnail_asset_id: z.string().nullable().optional(),
    thumbnail_url: z.string().nullable().optional(),
    banner_asset_id: z.string().nullable().optional(),
    banner_url: z.string().nullable().optional(),
    sort_order: z.coerce.number().int().min(0),
});

export type CategoryFormValues = z.infer<typeof schema>;

// ─── Map API → form values ────────────────────────────────────────────────────

export function categoryToFormValues(c: CategoryOut): CategoryFormValues {
    return {
        name: c.name,
        slug: c.slug,
        description: c.description ?? "",
        is_parent: c.is_parent,
        parent_id: c.parent_id,
        content_types: c.content_types ?? [],
        thumbnail_asset_id: c.thumbnail_asset_id,
        // Pre-fill with the presigned display URL so the preview renders correctly
        thumbnail_url: resolveThumbnailUrl(c),
        banner_asset_id: c.banner_asset_id,
        banner_url: resolveBannerUrl(c),
        sort_order: c.sort_order,
    };
}

// ─── Props / defaults ─────────────────────────────────────────────────────────

interface CategoryFormProps {
    mode: "create" | "edit";
    categoryId?: string;
    defaultValues?: CategoryFormValues;
}

const DEFAULT_VALUES: CategoryFormValues = {
    name: "",
    slug: "",
    description: "",
    is_parent: false,
    parent_id: null,
    content_types: [],
    thumbnail_asset_id: null,
    thumbnail_url: null,
    banner_asset_id: null,
    banner_url: null,
    sort_order: 0,
};

// ─── Component ────────────────────────────────────────────────────────────────

export function CategoryForm({ mode, categoryId, defaultValues }: CategoryFormProps) {
    const router = useRouter();
    const [parentCategories, setParentCategories] = useState<CategoryOut[]>([]);
    const [libraryTarget, setLibraryTarget] = useState<"thumbnail" | "banner" | null>(null);

    const {
        register,
        handleSubmit,
        control,
        watch,
        setValue,
        setError,
        formState: { errors, isSubmitting },
    } = useForm<CategoryFormValues>({
        resolver: zodResolver(schema),
        defaultValues: defaultValues ?? DEFAULT_VALUES,
    });

    const nameValue = watch("name");
    const isParent = watch("is_parent");

    // Load parent categories for the dropdown
    useEffect(() => {
        listCategories({ page_size: 200 })
            .then((res) => setParentCategories(res.items.filter((c) => c.is_parent && c.id !== categoryId)))
            .catch(() => { });
    }, [categoryId]);

    // Auto-slug from name (create mode only)
    const slugSetByUser = useRef(!!defaultValues);
    useEffect(() => {
        if (mode === "create" && !slugSetByUser.current && nameValue) {
            setValue("slug", toSlug(nameValue), { shouldValidate: false });
        }
    }, [nameValue, mode, setValue]);

    const onSubmit = async (data: CategoryFormValues) => {
        const payload: CategoryCreate = {
            name: data.name,
            slug: data.slug,
            description: data.description || null,
            is_parent: data.is_parent,
            parent_id: data.is_parent ? null : (data.parent_id || null),
            content_types: (data.content_types ?? []) as CategoryCreate["content_types"],
            thumbnail_asset_id: data.thumbnail_asset_id || null,
            thumbnail_url: data.thumbnail_url || null,
            banner_asset_id: data.banner_asset_id || null,
            banner_url: data.banner_url || null,
            sort_order: data.sort_order,
        };;
        try {
            if (mode === "edit" && categoryId) {
                await updateCategory(categoryId, payload);
            } else {
                await createCategory(payload);
            }
            router.push("/admin/content/categories");
        } catch (err: unknown) {
            setError("root", {
                message: err instanceof Error ? err.message : "Failed to save category",
            });
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="w-full">
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6 items-start">

                {/* ══════════════ LEFT COLUMN ══════════════ */}
                <div className="space-y-6">

                    {/* ── Category Details ──────────────────────────────────── */}
                    <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
                        <SectionHeading>Category Details</SectionHeading>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="block text-xs font-semibold text-muted-foreground">Name *</label>
                                <input
                                    {...register("name")}
                                    autoFocus
                                    placeholder="e.g. Action Movies"
                                    className={inputCls(!!errors.name)}
                                />
                                <FieldError msg={errors.name?.message} />
                            </div>
                            <div className="space-y-1">
                                <label className="block text-xs font-semibold text-muted-foreground">Slug *</label>
                                <input
                                    {...register("slug", { onChange: () => { slugSetByUser.current = true; } })}
                                    placeholder="action-movies"
                                    disabled={mode === "edit"}
                                    className={`${inputCls(!!errors.slug)} disabled:opacity-40 font-mono`}
                                />
                                <FieldError msg={errors.slug?.message} />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="block text-xs font-semibold text-muted-foreground">Description</label>
                            <textarea
                                {...register("description")}
                                rows={3}
                                placeholder="Optional short description for this category…"
                                className={textareaCls()}
                            />
                        </div>

                        {/* Is Parent toggle */}
                        <div className="border-t border-border pt-4">
                            <Controller
                                name="is_parent"
                                control={control}
                                render={({ field }) => (
                                    <LabeledSwitch
                                        checked={field.value}
                                        onCheckedChange={(v) => {
                                            field.onChange(v);
                                            if (v) setValue("parent_id", null);
                                        }}
                                        label="Is Parent Category"
                                        description="Top-level category that can contain sub-categories"
                                    />
                                )}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="block text-xs font-semibold text-muted-foreground">Sort Order</label>
                                <input
                                    type="number"
                                    min={0}
                                    {...register("sort_order")}
                                    className={inputCls()}
                                />
                                <p className="text-[11px] text-muted-foreground">Lower numbers appear first</p>
                            </div>

                            <div className="space-y-1 col-span-2">
                                <label className="block text-xs font-semibold text-muted-foreground">Content Types</label>
                                <div className="flex flex-wrap gap-2 pt-0.5">
                                    {CATEGORY_CONTENT_TYPES.map((ct) => {
                                        const selected = (watch("content_types") ?? []).includes(ct.value);
                                        return (
                                            <button
                                                key={ct.value}
                                                type="button"
                                                onClick={() => {
                                                    const current = watch("content_types") ?? [];
                                                    setValue("content_types",
                                                        selected
                                                            ? current.filter((v) => v !== ct.value)
                                                            : [...current, ct.value],
                                                    );
                                                }}
                                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                                                    selected
                                                        ? "border-primary bg-primary/10 text-primary"
                                                        : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                                                }`}
                                            >
                                                {selected && <Check size={11} />}
                                                {ct.label}
                                            </button>
                                        );
                                    })}
                                </div>
                                <p className="text-[11px] text-muted-foreground">Select all content types this category applies to (e.g. Video + Series for "Action")</p>
                            </div>

                            {!isParent && (
                                <div className="space-y-1">
                                    <label className="block text-xs font-semibold text-muted-foreground">
                                        Parent Category
                                    </label>
                                    <div className="relative">
                                        <select
                                            className={selectCls()}
                                            value={watch("parent_id") ?? ""}
                                            onChange={(e) => setValue("parent_id", e.target.value || null)}
                                        >
                                            <option value="">— None —</option>
                                            {parentCategories.map((c) => (
                                                <option key={c.id} value={c.id}>
                                                    {c.name}
                                                </option>
                                            ))}
                                        </select>
                                        <ChevronDown
                                            size={13}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </section>

                </div>

                {/* ══════════════ RIGHT COLUMN ══════════════ */}
                <div className="space-y-6 xl:sticky xl:top-8">

                    {/* ── Images ────────────────────────────────────────────── */}
                    <section className="rounded-2xl border border-border bg-card p-6 space-y-5">
                        <SectionHeading>Images</SectionHeading>

                        <Controller
                            name="thumbnail_url"
                            control={control}
                            render={({ field }) => (
                                <ImageField
                                    label="Thumbnail"
                                    hint="1:1 — 1080 × 1080 px recommended"
                                    aspect="1:1"
                                    value={field.value ?? null}
                                    onChange={field.onChange}
                                    onChangeAssetId={(id) => setValue("thumbnail_asset_id", id)}
                                    onOpenLibrary={() => setLibraryTarget("thumbnail")}
                                />
                            )}
                        />

                        <Controller
                            name="banner_url"
                            control={control}
                            render={({ field }) => (
                                <ImageField
                                    label="Banner"
                                    hint="16:9 — 1280 × 720 px recommended"
                                    aspect="16:9"
                                    value={field.value ?? null}
                                    onChange={field.onChange}
                                    onChangeAssetId={(id) => setValue("banner_asset_id", id)}
                                    onOpenLibrary={() => setLibraryTarget("banner")}
                                />
                            )}
                        />
                    </section>
                </div>
                {/* ══════════════ END RIGHT COLUMN ══════════════ */}
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
                    {isSubmitting ? (
                        <Loader2 size={14} className="animate-spin" />
                    ) : (
                        <CheckCircle2 size={14} />
                    )}
                    {mode === "create" ? "Create Category" : "Save Changes"}
                </button>
                <button
                    type="button"
                    onClick={() => router.push("/admin/content/categories")}
                    className="px-4 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                >
                    Cancel
                </button>
            </div>

            {/* Media library modal */}
            <MediaLibraryModal
                open={!!libraryTarget}
                onClose={() => setLibraryTarget(null)}
                onSelect={(url, assetId) => {
                    if (libraryTarget === "thumbnail") {
                        setValue("thumbnail_url", url);
                        setValue("thumbnail_asset_id", assetId);
                    } else if (libraryTarget === "banner") {
                        setValue("banner_url", url);
                        setValue("banner_asset_id", assetId);
                    }
                    setLibraryTarget(null);
                }}
            />
        </form>
    );
}
