"use client";

import ContentImageField from "@/components/content/ContentImageField";
import { useEffect, useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, AlertTriangle, CheckCircle2, Check } from "lucide-react";
import { LabeledSwitch } from "@/components/ui/labeled-switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { createCategory, updateCategory, listCategories, type CategoryOut, type CategoryCreate, CATEGORY_CONTENT_TYPES } from "@/lib/api";
import { resolveThumbnailUrl, resolveBannerUrl } from "@/lib/media";

const labelCls = "block text-sm font-medium leading-none text-foreground";

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
    return `w-full h-10 rounded-md bg-background border ${hasError ? "border-red-500/60" : "border-input"
        } px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-colors`;
}

function selectCls(hasError = false) {
    return `w-full h-10 rounded-md bg-background border ${hasError ? "border-red-500/60" : "border-input"
        } px-3 py-2 pr-8 text-sm text-foreground appearance-none ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-colors`;
}

function textareaCls() {
    return `w-full rounded-md bg-background border border-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none`;
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

// ─── Image upload field (presign → S3 → confirm) ──────────────────────────────

interface ImageFieldProps {
    label: string;
    hint: string;
    aspect: "1:1" | "16:9";
    value: string | null;
    onChange: (url: string | null) => void;
    onChangeAssetId?: (id: string | null) => void;
}

function ImageField({ onChange, ...props }: ImageFieldProps) {
    return <ContentImageField {...props} onChange={url => onChange(url || null)} purpose={props.aspect === "1:1" ? "thumbnail" : "banner"} />;
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
    is_category_row_enabled: z.boolean(),
    thumbnail_view: z.enum(["landscape", "wider_landscape", "portrait"]),
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
        is_category_row_enabled: c.is_category_row_enabled ?? true,
        thumbnail_view: c.thumbnail_view ?? "landscape",
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
    is_category_row_enabled: true,
    thumbnail_view: "landscape",
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
            is_category_row_enabled: data.is_category_row_enabled,
            thumbnail_view: data.thumbnail_view,
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
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6 items-start mb-14">

                {/* ══════════════ LEFT COLUMN ══════════════ */}
                <div className="space-y-6">

                    {/* ── Category Details ──────────────────────────────────── */}
                    <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
                        <SectionHeading>Category Details</SectionHeading>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className={labelCls}>Name *</label>
                                <input
                                    {...register("name")}
                                    autoFocus
                                    placeholder="e.g. Action Movies"
                                    className={inputCls(!!errors.name)}
                                />
                                <FieldError msg={errors.name?.message} />
                            </div>
                            <div className="space-y-1">
                                <label className={labelCls}>Slug *</label>
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
                            <label className={labelCls}>Description</label>
                            <textarea
                                {...register("description")}
                                rows={3}
                                placeholder="Optional short description for this category…"
                                className={textareaCls()}
                            />
                        </div>

                        <div className="space-y-1">
                            <label className={labelCls}>Content Types</label>
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
                                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
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
                            <p className="text-xs text-muted-foreground">Select all content types this category applies to (e.g. Video + Series for "Action")</p>
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
                            {!isParent && (
                                <div className="col-span-2 space-y-1">
                                    <label className={labelCls}>Parent Category</label>
                                    <div className="relative">
                                        <select
                                            className={selectCls()}
                                            value={watch("parent_id") ?? ""}
                                            onChange={(e) => setValue("parent_id", e.target.value || null)}
                                        >
                                            <option value="">— None —</option>
                                            {parentCategories.map((c) => (
                                                <option key={c.id} value={c.id}>{c.name}</option>
                                            ))}
                                        </select>
                                        <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                                    </div>
                                </div>
                            )}
                            <div className="space-y-1">
                                <label className={labelCls}>Sort Order</label>
                                <input type="number" min={0} {...register("sort_order")} className={inputCls()} />
                                <p className="text-xs text-muted-foreground">Lower numbers appear first</p>
                            </div>

                            <div className="col-span-2 border-t border-border pt-4">
                                <Controller
                                    name="is_category_row_enabled"
                                    control={control}
                                    render={({ field }) => (
                                        <LabeledSwitch
                                            checked={field.value}
                                            onCheckedChange={field.onChange}
                                            label="Category Row Enabled"
                                            description="Show this category as a row on storefront pages"
                                        />
                                    )}
                                />
                            </div>

                            <fieldset className="col-span-2 space-y-3">
                                <legend className={labelCls}>Category Row Thumbnail View</legend>
                                <Controller
                                    name="thumbnail_view"
                                    control={control}
                                    render={({ field }) => (
                                        <RadioGroup value={field.value} onValueChange={field.onChange} onBlur={field.onBlur} className="flex flex-wrap gap-6" aria-label="Category Row Thumbnail View">
                                            <div className="flex items-center gap-2">
                                                <RadioGroupItem value="landscape" id="thumbnail-view-landscape" />
                                                <label htmlFor="thumbnail-view-landscape" className="cursor-pointer text-sm font-medium">Landscape</label>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <RadioGroupItem value="wider_landscape" id="thumbnail-view-wider-landscape" />
                                                <label htmlFor="thumbnail-view-wider-landscape" className="cursor-pointer text-sm font-medium">Wider Landscape</label>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <RadioGroupItem value="portrait" id="thumbnail-view-portrait" />
                                                <label htmlFor="thumbnail-view-portrait" className="cursor-pointer text-sm font-medium">Portrait</label>
                                            </div>
                                        </RadioGroup>
                                    )}
                                />
                                <FieldError msg={errors.thumbnail_view?.message} />
                            </fieldset>
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

            <div className="fixed flex justify-end w-full z-30 items-center bottom-0 left-0 gap-2 px-6 p-2.5 border-t border-border/50 bg-card">
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

        </form>
    );
}
