"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { Loader2, AlertTriangle, CheckCircle2, ChevronDown, Tag, X } from "lucide-react";
import {
    createPage,
    updatePage,
    type PageCreate,
    type PageOut,
    type PageStatus,
    type PageUpdate,
} from "@/lib/api";
import { RichTextEditor } from "@/components/admin/RichTextEditor";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toSlug(title: string) {
    return title
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

function textareaCls() {
    return "w-full rounded-lg bg-secondary border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none";
}

function FieldError({ msg }: { msg?: string }) {
    if (!msg) return null;
    return <p className="text-[11px] text-red-400 mt-0.5">{msg}</p>;
}

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
    return (
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            {children}
            {required && <span className="text-red-400 ml-0.5">*</span>}
        </label>
    );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">{title}</h3>
            {children}
        </div>
    );
}

// ─── Keywords tag input ────────────────────────────────────────────────────────

function KeywordsInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const tags = value ? value.split(",").map((t) => t.trim()).filter(Boolean) : [];
    const [input, setInput] = useState("");

    const addTag = () => {
        const trimmed = input.trim().replace(/,/g, "");
        if (!trimmed || tags.includes(trimmed)) { setInput(""); return; }
        onChange([...tags, trimmed].join(", "));
        setInput("");
    };

    const removeTag = (tag: string) => {
        onChange(tags.filter((t) => t !== tag).join(", "));
    };

    return (
        <div className="rounded-lg bg-secondary border border-border px-3 py-2 flex flex-wrap gap-1.5 min-h-[2.25rem]">
            {tags.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-medium">
                    <Tag className="h-3 w-3" />
                    {tag}
                    <button type="button" onClick={() => removeTag(tag)} className="hover:text-primary/60 ml-0.5">
                        <X className="h-3 w-3" />
                    </button>
                </span>
            ))}
            <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); }
                    if (e.key === "Backspace" && !input && tags.length) removeTag(tags[tags.length - 1]);
                }}
                onBlur={addTag}
                placeholder={tags.length === 0 ? "Add keyword, press Enter…" : ""}
                className="flex-1 min-w-[120px] bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
        </div>
    );
}

// ─── Zod schema ───────────────────────────────────────────────────────────────

const pageSchema = z.object({
    title: z.string().min(1, "Title is required").max(255),
    slug: z
        .string()
        .min(1, "Slug is required")
        .max(255)
        .regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers and hyphens allowed"),
    short_description: z.string().max(500).nullable().optional(),
    body: z.string().nullable().optional(),
    seo_title: z.string().max(255).nullable().optional(),
    seo_description: z.string().max(500).nullable().optional(),
    seo_keywords: z.string().nullable().optional(),
    og_image_url: z.string().url("Must be a valid URL").nullable().optional().or(z.literal("")),
    status: z.enum(["draft", "published"]),
    is_active: z.boolean(),
    sort_order: z.number().int().min(0),
});

type FormValues = z.infer<typeof pageSchema>;

// ─── Props ────────────────────────────────────────────────────────────────────

interface PageFormProps {
    mode: "create" | "edit";
    initialData?: PageOut;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PageForm({ mode, initialData }: PageFormProps) {
    const router = useRouter();
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
    const [slugManual, setSlugManual] = useState(mode === "edit");

    const showToast = (text: string, ok = true) => {
        setToast({ text, ok });
        setTimeout(() => setToast(null), 3500);
    };

    const {
        register,
        handleSubmit,
        control,
        setValue,
        watch,
        formState: { errors },
    } = useForm<FormValues>({
        resolver: zodResolver(pageSchema),
        defaultValues: {
            title: initialData?.title ?? "",
            slug: initialData?.slug ?? "",
            short_description: initialData?.short_description ?? "",
            body: initialData?.body ?? "",
            seo_title: initialData?.seo_title ?? "",
            seo_description: initialData?.seo_description ?? "",
            seo_keywords: initialData?.seo_keywords ?? "",
            og_image_url: initialData?.og_image_url ?? "",
            status: (initialData?.status as PageStatus) ?? "draft",
            is_active: initialData?.is_active ?? true,
            sort_order: initialData?.sort_order ?? 0,
        },
    });

    const titleValue = watch("title");
    const statusValue = watch("status");
    const isActiveValue = watch("is_active");

    // Auto-generate slug from title in create mode
    useEffect(() => {
        if (!slugManual && mode === "create" && titleValue) {
            setValue("slug", toSlug(titleValue), { shouldValidate: false });
        }
    }, [titleValue, slugManual, mode, setValue]);

    const onSubmit = async (data: FormValues) => {
        setSaving(true);
        try {
            if (mode === "create") {
                const createPayload: PageCreate = {
                    title: data.title,
                    slug: data.slug,
                    body: data.body || null,
                    short_description: data.short_description || null,
                    seo_title: data.seo_title || null,
                    seo_description: data.seo_description || null,
                    seo_keywords: data.seo_keywords || null,
                    og_image_url: data.og_image_url || null,
                    status: data.status,
                    is_active: data.is_active,
                    sort_order: data.sort_order,
                };

                const created = await createPage(createPayload);
                showToast("Page created successfully");
                router.push(`/admin/pages/${created.id}`);
            } else {
                const updatePayload: PageUpdate = {
                    title: data.title,
                    slug: data.slug,
                    body: data.body || null,
                    short_description: data.short_description || null,
                    seo_title: data.seo_title || null,
                    seo_description: data.seo_description || null,
                    seo_keywords: data.seo_keywords || null,
                    og_image_url: data.og_image_url || null,
                    status: data.status,
                    is_active: data.is_active,
                    sort_order: data.sort_order,
                };

                await updatePage(initialData!.id, updatePayload);
                showToast("Page saved");
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Save failed";
            showToast(msg, false);
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

            {/* Two-column layout on large screens */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

                {/* ── Left column (main content) ────────────────────────────── */}
                <div className="lg:col-span-2 space-y-6">

                    {/* Basic details */}
                    <SectionCard title="Page Details">
                        <div>
                            <Label required>Title</Label>
                            <input
                                {...register("title")}
                                placeholder="e.g. Privacy Policy"
                                className={inputCls(!!errors.title)}
                            />
                            <FieldError msg={errors.title?.message} />
                        </div>

                        <div>
                            <Label required>
                                Page Slug
                                <span className="ml-1.5 text-[10px] font-normal text-muted-foreground/60 normal-case tracking-normal">
                                    URL path for the page
                                </span>
                            </Label>
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground shrink-0">/</span>
                                <input
                                    {...register("slug")}
                                    placeholder="privacy-policy"
                                    className={inputCls(!!errors.slug)}
                                    onChange={(e) => {
                                        setSlugManual(true);
                                        register("slug").onChange(e);
                                    }}
                                />
                            </div>
                            <FieldError msg={errors.slug?.message} />
                        </div>

                        <div>
                            <Label>Short Description</Label>
                            <textarea
                                {...register("short_description")}
                                rows={2}
                                placeholder="Brief summary shown in navigation tooltips or page listings…"
                                className={textareaCls()}
                            />
                            <FieldError msg={errors.short_description?.message} />
                        </div>
                    </SectionCard>

                    {/* Body / rich text editor */}
                    <SectionCard title="Page Content">
                        <div>
                            <Label>Body Content</Label>
                            <Controller
                                name="body"
                                control={control}
                                render={({ field }) => (
                                    <RichTextEditor
                                        value={field.value ?? ""}
                                        onChange={field.onChange}
                                        placeholder="Write your page content here…"
                                        minHeight={400}
                                    />
                                )}
                            />
                            <FieldError msg={errors.body?.message} />
                        </div>
                    </SectionCard>

                    {/* SEO */}
                    <SectionCard title="SEO & Meta">
                        <div>
                            <Label>SEO Title</Label>
                            <input
                                {...register("seo_title")}
                                placeholder="Overrides page title in browser tab and search results"
                                className={inputCls(!!errors.seo_title)}
                            />
                            <FieldError msg={errors.seo_title?.message} />
                        </div>

                        <div>
                            <Label>Meta Description</Label>
                            <textarea
                                {...register("seo_description")}
                                rows={3}
                                placeholder="160-character description shown in search engine results…"
                                className={textareaCls()}
                            />
                            <FieldError msg={errors.seo_description?.message} />
                        </div>

                        <div>
                            <Label>
                                Keywords / Tags
                                <span className="ml-1.5 text-[10px] font-normal text-muted-foreground/60 normal-case tracking-normal">
                                    Press Enter or comma to add
                                </span>
                            </Label>
                            <Controller
                                name="seo_keywords"
                                control={control}
                                render={({ field }) => (
                                    <KeywordsInput value={field.value ?? ""} onChange={field.onChange} />
                                )}
                            />
                        </div>

                        <div>
                            <Label>Open Graph Image URL</Label>
                            <input
                                {...register("og_image_url")}
                                placeholder="https://example.com/og-image.jpg"
                                className={inputCls(!!errors.og_image_url)}
                            />
                            <FieldError msg={errors.og_image_url?.message} />
                        </div>
                    </SectionCard>
                </div>

                {/* ── Right column (publishing controls) ───────────────────── */}
                <div className="space-y-6">

                    {/* Publish panel */}
                    <SectionCard title="Publishing">
                        {/* Status select */}
                        <div>
                            <Label>Status</Label>
                            <div className="relative">
                                <Controller
                                    name="status"
                                    control={control}
                                    render={({ field }) => (
                                        <select
                                            {...field}
                                            className="w-full h-9 rounded-lg bg-secondary border border-border px-3 pr-8 text-sm text-foreground appearance-none focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                                        >
                                            <option value="draft">Draft</option>
                                            <option value="published">Published</option>
                                        </select>
                                    )}
                                />
                                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                            </div>
                        </div>

                        {/* Active toggle */}
                        <div className="flex items-center justify-between py-1">
                            <div>
                                <p className="text-sm font-medium text-foreground">Active</p>
                                <p className="text-xs text-muted-foreground">Deactivate to hide without deleting</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setValue("is_active", !isActiveValue)}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${isActiveValue ? "bg-primary" : "bg-muted"
                                    }`}
                            >
                                <span
                                    className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${isActiveValue ? "translate-x-6" : "translate-x-1"
                                        }`}
                                />
                            </button>
                        </div>

                        {/* Sort order */}
                        <div>
                            <Label>Sort Order</Label>
                            <input
                                {...register("sort_order", { valueAsNumber: true })}
                                type="number"
                                min={0}
                                className={inputCls(!!errors.sort_order)}
                            />
                            <p className="text-[11px] text-muted-foreground mt-0.5">Lower = appears first in menus</p>
                            <FieldError msg={errors.sort_order?.message} />
                        </div>

                        {/* Save button */}
                        <div className="flex flex-col gap-2 pt-2">
                            <button
                                type="submit"
                                disabled={saving}
                                className="w-full h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
                            >
                                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                {saving
                                    ? "Saving…"
                                    : mode === "create"
                                        ? statusValue === "published"
                                            ? "Publish Page"
                                            : "Save as Draft"
                                        : "Save Changes"
                                }
                            </button>
                            <button
                                type="button"
                                onClick={() => router.push("/admin/pages")}
                                className="w-full h-9 rounded-lg border border-border text-sm font-medium hover:bg-secondary transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </SectionCard>

                    {/* Preview tip */}
                    {mode === "edit" && initialData?.status === "published" && (
                        <div className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground space-y-1">
                            <p className="font-medium text-foreground text-sm">Live URL</p>
                            <p className="font-mono break-all text-primary">/{initialData.slug}</p>
                            <p>This page is publicly accessible via your storefront navigation.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Toast */}
            {toast && (
                <div
                    className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium border transition-all ${toast.ok
                            ? "bg-card border-emerald-500/20 text-foreground"
                            : "bg-card border-red-500/20 text-foreground"
                        }`}
                >
                    {toast.ok
                        ? <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                        : <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                    }
                    {toast.text}
                </div>
            )}
        </form>
    );
}
