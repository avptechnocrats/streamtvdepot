"use client";

import S3ImageField from "@/components/content/ContentImageField";
import { useEffect, useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, AlertTriangle, X, Clapperboard } from "lucide-react";
import { LabeledSwitch } from "@/components/ui/labeled-switch";
import { createSeries, updateSeries, type SeriesOut, type SeriesCreate, listCategories, listClientPlans, type CategoryOut, type ClientPricingPlanOut, VIDEO_LANGUAGES } from "@/lib/api";

import { AiWriteButton } from "@/components/AiWriteButton";
import { CategoryPicker } from "@/components/CategoryPicker";

// ─── Schema ───────────────────────────────────────────────────────────────────

const schema = z.object({
    title: z.string().min(1, "Title is required"),
    description: z.string().optional(),
    genre: z.string().optional(),
    categories: z.array(z.string()),
    language: z.array(z.string()).optional(),
    thumbnail_url: z.string().optional(),
    trailer_url: z.string().optional(),
    access_type: z.enum(["free", "subscription", "ppv", "rental"]),
    subscription_plan_ids: z.array(z.string()),
    status: z.enum(["draft", "published", "archived"]),
    is_featured: z.boolean(),
    total_seasons: z.coerce.number().int().min(1, "At least 1 season"),
}).superRefine((data, context) => {
    if (["ppv", "rental"].includes(data.access_type) && data.subscription_plan_ids.length !== 1) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["subscription_plan_ids"], message: "Select one active plan for paid series." });
    }
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

// ─── S3 Thumbnail field ───────────────────────────────────────────────────────

// ─── Converter helper (used by edit page) ─────────────────────────────────────

export function seriesToFormValues(series: SeriesOut): FormValues {
    return {
        title: series.title,
        description: series.description ?? "",
        genre: series.genre ?? "",
        categories: series.categories ?? [],
        language: series.language ? [series.language] : [],
        thumbnail_url: series.thumbnail_url ?? "",
        trailer_url: series.trailer_url ?? "",
        access_type: series.access_type,
        subscription_plan_ids: series.subscription_plan_ids ?? [],
        status: series.status,
        is_featured: series.is_featured,
        total_seasons: series.total_seasons,
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
    language: [],
    thumbnail_url: "",
    trailer_url: "",
    access_type: "free",
    subscription_plan_ids: [],
    status: "draft",
    is_featured: false,
    total_seasons: 1,
};

// ─── Component ────────────────────────────────────────────────────────────────

const LANGUAGE_OPTIONS = VIDEO_LANGUAGES.map((l) => ({ value: l, label: l }));

export function SeriesForm({ mode, seriesId, defaultValues }: SeriesFormProps) {
    const router = useRouter();
    const [availableCategories, setAvailableCategories] = useState<CategoryOut[]>([]);
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
    const languages = watch("language") ?? [];
    const accessType = watch("access_type");
    const selectedPlanIds = watch("subscription_plan_ids");

    useEffect(() => {
        listCategories({ content_type: "series", page_size: 200 })
            .then((res) => setAvailableCategories(res.items))
            .catch(() => { /* silently ignore */ });
        listClientPlans({ is_active: true })
            .then(setPricingPlans)
            .catch(() => { /* silently ignore */ });
    }, []);

    const paidPlans = pricingPlans.filter((plan) =>
        accessType === "ppv" ? plan.plan_type === "ppv" : plan.plan_type === "rent"
    );

    const submitForm = async (data: FormValues, targetStatus: "draft" | "published") => {
        const payload: SeriesCreate = {
            title: data.title,
            description: data.description || null,
            genre: data.genre || null,
            categories: data.categories,
            language: (data.language && data.language.length > 0) ? data.language[0] : null,
            thumbnail_url: data.thumbnail_url || null,
            trailer_url: data.trailer_url || null,
            access_type: data.access_type,
            subscription_plan_ids: data.subscription_plan_ids,
            status: targetStatus,
            is_featured: data.is_featured,
            total_seasons: data.total_seasons,
        };
        try {
            if (mode === "edit" && seriesId) {
                await updateSeries(seriesId, payload);
            } else {
                await createSeries(payload);
            }
            router.push("/admin/content/series");
        } catch (err: unknown) {
            setError("root", { message: err instanceof Error ? err.message : "Failed to save series" });
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
        <form onSubmit={handleSubmit(onSubmit)} className="w-full pb-28">
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6 items-start">

                {/* ══ LEFT ══ */}
                <div className="space-y-6">

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

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="block text-xs font-semibold text-muted-foreground">Genre</label>
                                <input {...register("genre")} placeholder="e.g. Drama, Documentary" className={inputCls()} />
                            </div>
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
                                <label className="block text-xs font-semibold text-muted-foreground">Language</label>
                                <CheckboxDropdown
                                    selected={languages}
                                    onChange={(v) => setValue("language", v)}
                                    placeholder="+ Select languages"
                                    options={LANGUAGE_OPTIONS}
                                    columns={2}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="block text-xs font-semibold text-muted-foreground">Total Seasons *</label>
                                <input
                                    {...register("total_seasons")}
                                    type="number"
                                    min={1}
                                    placeholder="1"
                                    className={inputCls(!!errors.total_seasons)}
                                />
                                <FieldError msg={errors.total_seasons?.message} />
                            </div>
                            <div className="space-y-1">
                                <label className="block text-xs font-semibold text-muted-foreground">Trailer URL</label>
                                <input {...register("trailer_url")} placeholder="https://…" className={inputCls()} />
                            </div>
                        </div>
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
                                Active subscription plans that include this series or its categories grant access to every episode.
                            </div>
                        )}

                        {(accessType === "ppv" || accessType === "rental") && (
                            <div className="space-y-2">
                                <label className="block text-xs font-semibold text-muted-foreground">{accessType === "ppv" ? "One-time purchase plan" : "Rental plan"}</label>
                                {paidPlans.length ? paidPlans.map((plan) => (
                                    <label key={plan.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-2.5 transition-colors hover:border-primary/40">
                                        <input type="radio" name="series_purchase_plan" checked={selectedPlanIds.includes(plan.id)} onChange={() => setValue("subscription_plan_ids", [plan.id], { shouldDirty: true, shouldValidate: true })} className="h-3.5 w-3.5 accent-primary" />
                                        <span className="min-w-0">
                                            <span className="block truncate text-xs font-medium text-foreground">{plan.name}</span>
                                            <span className="text-[11px] text-muted-foreground">{plan.currency} {plan.price}{accessType === "rental" ? ` · ${plan.billing_cycle}` : ""}</span>
                                        </span>
                                    </label>
                                )) : <p className="text-xs text-muted-foreground">Create and activate a matching {accessType === "ppv" ? "PPV" : "Rent"} pricing plan before publishing this series.</p>}
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
                                    description="Show this series in featured sections"
                                />
                            )}
                        />
                    </section>

                    {/* Thumbnail */}
                    <section className="rounded-2xl border border-border bg-card p-6 space-y-6">
                        <div className="flex items-center gap-2">
                            <Clapperboard size={14} className="text-muted-foreground" />
                            <SectionHeading>Thumbnail</SectionHeading>
                        </div>

                        <Controller name="thumbnail_url" control={control} render={({ field }) => (
                            <S3ImageField
                                label="Thumbnail"
                                hint="Used in series listings and cards"
                                aspect="2:3"
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
                    {mode === "edit" ? "Save Changes" : "Publish Series"}
                </button>
                <button
                    type="button"
                    onClick={() => router.push("/admin/content/series")}
                    className="px-4 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                >
                    Cancel
                </button>
            </div>
        </form>
    );
}
