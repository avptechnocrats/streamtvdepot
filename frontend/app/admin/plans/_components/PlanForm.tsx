"use client";

import { useEffect, useState } from "react";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus, Trash2, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { createPlan, updatePlan, type PlanOut, type PlanCreate } from "@/lib/api";
import { slugify } from "./utils";
import { SUPPORTED_CURRENCIES, APP_PLATFORMS } from "@/lib/api";

// ─── Schema ────────────────────────────────────────────────────────────────────

const nullableLimit = z.preprocess(
    (v) => {
        if (v === "" || v === null || v === undefined) return null;
        const n = Number(v);
        return isNaN(n) ? null : Math.trunc(n);
    },
    z.number().int().min(-1, "Minimum is -1 (unlimited)").nullable(),
);

const nullablePrice = z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
    z.number().min(0, "Must be ≥ 0").nullable(),
);

const requiredPrice = z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z.number({ invalid_type_error: "Required" }).min(0, "Must be ≥ 0"),
);

export const planFormSchema = z.object({
    // Basic Info
    name: z.string().min(1, "Name is required"),
    sub_text: z.string().optional(),
    slug: z
        .string()
        .min(1, "Slug is required")
        .regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers, hyphens"),
    description: z.string().optional(),
    // Pricing
    currency: z.enum(["USD", "EUR", "GBP", "INR", "AED", "SGD", "CAD", "AUD"]),
    price_monthly: z.coerce.number({ invalid_type_error: "Required" }).min(0, "Must be ≥ 0"),
    price_quarterly: requiredPrice,
    price_yearly: requiredPrice,
    // Apps
    additional_app_price: nullablePrice,
    additional_apps: z.object({
        android: z.boolean(),
        ios: z.boolean(),
        roku: z.boolean(),
        apple_tv: z.boolean(),
        fire_tv: z.boolean(),
    }),
    // Features
    key_features: z.array(z.object({ value: z.string() })),
    // User Limits
    max_users: nullableLimit,
    max_admin_users: nullableLimit,
    // Usage Limits (AWS-metered)
    bandwidth_gb_monthly: nullableLimit,
    encoding_minutes_monthly: nullableLimit,
    api_calls_per_month: nullableLimit,
    concurrent_users_peak: nullableLimit,
    max_storage_gb: nullableLimit,
    max_streams: nullableLimit,
    simultaneous_uploads: z.coerce.number().int().min(1, "Minimum is 1").default(1),
    // Overage Pricing
    overage_bandwidth_per_gb: nullablePrice,
    overage_storage_per_gb: nullablePrice,
    overage_encoding_per_minute: nullablePrice,
    overage_api_per_1m_calls: nullablePrice,
    // Content Restrictions
    allowed_content_types: z.array(z.string()),
    max_bitrate_mbps: nullableLimit,
    content_retention_days: z.coerce.number().int().min(1, "Minimum is 1").default(365),
    // Status (edit only)
    is_active: z.boolean().optional(),
    is_trial: z.boolean().default(false),
});

export type PlanFormValues = z.infer<typeof planFormSchema>;

// ─── Default values ────────────────────────────────────────────────────────────

export function planToFormValues(plan?: PlanOut): PlanFormValues {
    return {
        name: plan?.name ?? "",
        sub_text: plan?.sub_text ?? "",
        slug: plan?.slug ?? "",
        description: plan?.description ?? "",
        currency: (plan?.currency as PlanFormValues["currency"]) ?? "USD",
        price_monthly: plan?.price_monthly ?? 0,
        price_quarterly: plan?.price_quarterly ?? 0,
        price_yearly: plan?.price_yearly ?? 0,
        additional_app_price: plan?.additional_app_price ?? null,
        additional_apps: {
            android: plan?.additional_apps?.android ?? false,
            ios: plan?.additional_apps?.ios ?? false,
            roku: plan?.additional_apps?.roku ?? false,
            apple_tv: plan?.additional_apps?.apple_tv ?? false,
            fire_tv: plan?.additional_apps?.fire_tv ?? false,
        },
        key_features: (plan?.key_features ?? []).map((v) => ({ value: v })),
        max_users: plan?.max_users ?? null,
        max_admin_users: plan?.max_admin_users ?? null,
        bandwidth_gb_monthly: plan?.bandwidth_gb_monthly ?? null,
        encoding_minutes_monthly: plan?.encoding_minutes_monthly ?? null,
        api_calls_per_month: plan?.api_calls_per_month ?? null,
        concurrent_users_peak: plan?.concurrent_users_peak ?? null,
        max_storage_gb: plan?.max_storage_gb ?? null,
        max_streams: plan?.max_streams ?? null,
        simultaneous_uploads: plan?.simultaneous_uploads ?? 1,
        overage_bandwidth_per_gb: plan?.overage_bandwidth_per_gb ?? null,
        overage_storage_per_gb: plan?.overage_storage_per_gb ?? null,
        overage_encoding_per_minute: plan?.overage_encoding_per_minute ?? null,
        overage_api_per_1m_calls: plan?.overage_api_per_1m_calls ?? null,
        allowed_content_types: plan?.allowed_content_types ?? [],
        max_bitrate_mbps: plan?.max_bitrate_mbps ?? null,
        content_retention_days: plan?.content_retention_days ?? 365,
        is_active: plan?.is_active ?? true,
        is_trial: plan?.is_trial ?? false,
    };
}

// ─── Reusable field wrappers ───────────────────────────────────────────────────

function FieldError({ msg }: { msg?: string }) {
    if (!msg) return null;
    return <p className="text-[11px] text-red-400 mt-0.5">{msg}</p>;
}

function inputCls(hasError?: boolean) {
    return `w-full h-9 rounded-lg bg-secondary border px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary ${hasError ? "border-red-500" : "border-border"}`;
}

function SectionHeading({ children }: { children: React.ReactNode }) {
    return (
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
            {children}
        </h3>
    );
}

// ─── Tabs ──────────────────────────────────────────────────────────────────────

type TabId = "basic" | "pricing" | "features" | "usage" | "overages" | "content";

interface Tab {
    id: TabId;
    label: string;
    icon?: string;
}

const TABS: Tab[] = [
    { id: "basic", label: "Basic Info" },
    { id: "pricing", label: "Pricing" },
    { id: "features", label: "Features" },
    { id: "usage", label: "Usage Limits" },
    { id: "overages", label: "Overage Pricing" },
    { id: "content", label: "Content" },
];

// ─── Component ─────────────────────────────────────────────────────────────────

interface PlanFormProps {
    mode: "create" | "edit";
    planId?: string;
    defaultValues?: PlanFormValues;
}

export function PlanForm({ mode, planId, defaultValues }: PlanFormProps) {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<TabId>("basic");

    const {
        register,
        control,
        handleSubmit,
        watch,
        setValue,
        setError,
        formState: { errors, isSubmitting },
    } = useForm<PlanFormValues>({
        resolver: zodResolver(planFormSchema),
        defaultValues: defaultValues ?? planToFormValues(),
    });

    const { fields, append, remove } = useFieldArray({ control, name: "key_features" });
    const contentTypeWatcher = watch("allowed_content_types");

    // Auto-generate slug on create
    const nameValue = watch("name");
    useEffect(() => {
        if (mode === "create") {
            setValue("slug", slugify(nameValue), { shouldValidate: false });
        }
    }, [nameValue, mode, setValue]);

    const onSubmit = async (data: PlanFormValues) => {
        const payload: PlanCreate = {
            name: data.name,
            sub_text: data.sub_text || undefined,
            slug: data.slug,
            description: data.description || undefined,
            currency: data.currency,
            price_monthly: data.price_monthly,
            price_quarterly: data.price_quarterly,
            price_yearly: data.price_yearly,
            additional_app_price: data.additional_app_price ?? undefined,
            additional_apps: data.additional_apps,
            key_features: data.key_features.map((f) => f.value).filter(Boolean),
            max_users: data.max_users,
            max_storage_gb: data.max_storage_gb,
            max_streams: data.max_streams,
            max_admin_users: data.max_admin_users,
            bandwidth_gb_monthly: data.bandwidth_gb_monthly,
            encoding_minutes_monthly: data.encoding_minutes_monthly,
            api_calls_per_month: data.api_calls_per_month,
            concurrent_users_peak: data.concurrent_users_peak,
            simultaneous_uploads: data.simultaneous_uploads,
            overage_bandwidth_per_gb: data.overage_bandwidth_per_gb,
            overage_storage_per_gb: data.overage_storage_per_gb,
            overage_encoding_per_minute: data.overage_encoding_per_minute,
            overage_api_per_1m_calls: data.overage_api_per_1m_calls,
            allowed_content_types: data.allowed_content_types,
            max_bitrate_mbps: data.max_bitrate_mbps,
            content_retention_days: data.content_retention_days,
            is_trial: data.is_trial,
        };

        try {
            if (mode === "edit" && planId) {
                await updatePlan(planId, { ...payload, is_active: data.is_active });
            } else {
                await createPlan(payload);
            }
            router.push("/admin/plans");
        } catch (err: unknown) {
            setError("root", {
                message: err instanceof Error ? err.message : "Failed to save plan",
            });
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-4xl">
            {/* ── Tabs ────────────────────────────────────────────────── */}
            <div className="mb-6 border-b border-border">
                <div className="flex gap-1 overflow-x-auto">
                    {TABS.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                                activeTab === tab.id
                                    ? "border-primary text-primary"
                                    : "border-transparent text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Tab Content ─────────────────────────────────────────── */}
            <div className="space-y-6">
                {/* ── BASIC INFO TAB ──────────────────────────────────── */}
                {activeTab === "basic" && (
                    <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
                        <SectionHeading>Basic Information</SectionHeading>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="block text-xs font-semibold text-muted-foreground">Name *</label>
                                <input {...register("name")} autoFocus placeholder="Pro" className={inputCls(!!errors.name)} />
                                <FieldError msg={errors.name?.message} />
                            </div>
                            <div className="space-y-1">
                                <label className="block text-xs font-semibold text-muted-foreground">Slug *</label>
                                <input
                                    {...register("slug")}
                                    placeholder="pro"
                                    disabled={mode === "edit"}
                                    className={`${inputCls(!!errors.slug)} disabled:opacity-40`}
                                />
                                <FieldError msg={errors.slug?.message} />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="block text-xs font-semibold text-muted-foreground">Sub-text</label>
                            <input {...register("sub_text")} placeholder="e.g. Best for growing teams" className={inputCls()} />
                        </div>

                        <div className="space-y-1">
                            <label className="block text-xs font-semibold text-muted-foreground">Description</label>
                            <textarea
                                {...register("description")}
                                rows={4}
                                placeholder="Describe what this plan includes…"
                                className="w-full rounded-lg bg-secondary border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                            />
                        </div>

                        <div className="flex items-center justify-between pt-1 border-t border-border/50">
                            <div className="pt-4">
                                <p className="text-sm font-medium text-foreground">Trial Plan</p>
                                <p className="text-xs text-muted-foreground">Trial plans are hidden from frontend listings</p>
                            </div>
                            <Controller
                                name="is_trial"
                                control={control}
                                render={({ field }) => (
                                    <button
                                        type="button"
                                        onClick={() => field.onChange(!field.value)}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${field.value ? "bg-primary" : "bg-muted"}`}
                                    >
                                        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${field.value ? "translate-x-6" : "translate-x-1"}`} />
                                    </button>
                                )}
                            />
                        </div>

                        {/* Status toggle (edit only) */}
                        {mode === "edit" && (
                            <div className="flex items-center justify-between pt-1 border-t border-border/50">
                                <div className="pt-4">
                                    <p className="text-sm font-medium text-foreground">Active</p>
                                    <p className="text-xs text-muted-foreground">Inactive plans won't appear to clients</p>
                                </div>
                                <Controller
                                    name="is_active"
                                    control={control}
                                    render={({ field }) => (
                                        <button
                                            type="button"
                                            onClick={() => field.onChange(!field.value)}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${field.value ? "bg-primary" : "bg-muted"}`}
                                        >
                                            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${field.value ? "translate-x-6" : "translate-x-1"}`} />
                                        </button>
                                    )}
                                />
                            </div>
                        )}
                    </section>
                )}

                {/* ── PRICING TAB ─────────────────────────────────────── */}
                {activeTab === "pricing" && (
                    <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
                        <SectionHeading>Pricing</SectionHeading>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <label className="block text-xs font-semibold text-muted-foreground">Currency *</label>
                                <div className="relative">
                                    <select
                                        {...register("currency")}
                                        className="w-full h-9 rounded-lg bg-secondary border border-border px-3 pr-8 text-sm text-foreground appearance-none focus:outline-none focus:ring-1 focus:ring-primary"
                                    >
                                        {SUPPORTED_CURRENCIES.map((c) => (
                                            <option key={c} value={c}>{c}</option>
                                        ))}
                                    </select>
                                    <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="block text-xs font-semibold text-muted-foreground">Monthly *</label>
                                <input {...register("price_monthly")} type="number" min={0} step="0.01" className={inputCls(!!errors.price_monthly)} />
                                <FieldError msg={errors.price_monthly?.message} />
                            </div>
                            <div className="space-y-1">
                                <label className="block text-xs font-semibold text-muted-foreground">Quarterly *</label>
                                <Controller
                                    name="price_quarterly"
                                    control={control}
                                    render={({ field }) => (
                                        <input
                                            type="number" min={0} step="0.01"
                                            value={field.value ?? ""}
                                            onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                                            placeholder="—"
                                            className={inputCls(!!errors.price_quarterly)}
                                        />
                                    )}
                                />
                                <FieldError msg={errors.price_quarterly?.message} />
                            </div>
                            <div className="space-y-1">
                                <label className="block text-xs font-semibold text-muted-foreground">Yearly *</label>
                                <Controller
                                    name="price_yearly"
                                    control={control}
                                    render={({ field }) => (
                                        <input
                                            type="number" min={0} step="0.01"
                                            value={field.value ?? ""}
                                            onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                                            placeholder="—"
                                            className={inputCls(!!errors.price_yearly)}
                                        />
                                    )}
                                />
                                <FieldError msg={errors.price_yearly?.message} />
                            </div>
                        </div>

                        <div className="border-t border-border/50 pt-4">
                            <SectionHeading>App Platforms</SectionHeading>
                            <div className="flex flex-wrap gap-3 mb-4">
                                {APP_PLATFORMS.map((platform) => {
                                    const label = platform.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase());
                                    return (
                                        <Controller
                                            key={platform}
                                            name={`additional_apps.${platform}` as `additional_apps.${typeof platform}`}
                                            control={control}
                                            render={({ field }) => (
                                                <button
                                                    type="button"
                                                    onClick={() => field.onChange(!field.value)}
                                                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${field.value
                                                        ? "border-primary bg-primary/10 text-primary"
                                                        : "border-border text-muted-foreground hover:text-foreground"
                                                        }`}
                                                >
                                                    {label}
                                                </button>
                                            )}
                                        />
                                    );
                                })}
                            </div>

                            <div className="space-y-1">
                                <label className="block text-xs font-semibold text-muted-foreground">Additional App Price</label>
                                <Controller
                                    name="additional_app_price"
                                    control={control}
                                    render={({ field }) => (
                                        <input
                                            type="number" min={0} step="0.01"
                                            value={field.value ?? ""}
                                            onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                                            placeholder="Per-app add-on price"
                                            className={inputCls()}
                                        />
                                    )}
                                />
                            </div>
                        </div>
                    </section>
                )}

                {/* ── FEATURES TAB ────────────────────────────────────── */}
                {activeTab === "features" && (
                    <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
                        <SectionHeading>Key Features</SectionHeading>

                        <div className="space-y-2">
                            {fields.map((field, index) => (
                                <div key={field.id} className="flex gap-2">
                                    <input
                                        {...register(`key_features.${index}.value`)}
                                        placeholder={`Feature ${index + 1}`}
                                        className={`${inputCls()} flex-1`}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => remove(index)}
                                        className="p-2 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/8 transition-colors"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>

                        <button
                            type="button"
                            onClick={() => append({ value: "" })}
                            className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                        >
                            <Plus size={13} /> Add Feature
                        </button>
                    </section>
                )}

                {/* ── USAGE LIMITS TAB ────────────────────────────────── */}
                {activeTab === "usage" && (
                    <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
                        <SectionHeading>
                            Usage Limits{" "}
                            <span className="font-normal normal-case opacity-60">(blank or -1 = unlimited)</span>
                        </SectionHeading>

                        <div className="grid grid-cols-2 gap-4">
                            {(
                                [
                                    ["max_users", "Max End Users"],
                                    ["max_admin_users", "Max Admin Users"],
                                    ["max_storage_gb", "Max Storage (GB)"],
                                    ["max_streams", "Max Concurrent Streams"],
                                    ["bandwidth_gb_monthly", "Bandwidth/Month (GB)"],
                                    ["encoding_minutes_monthly", "Encoding Minutes/Month"],
                                    ["api_calls_per_month", "API Calls/Month (millions)"],
                                    ["concurrent_users_peak", "Concurrent Users (Peak)"],
                                ] as const
                            ).map(([name, label]) => (
                                <div key={name} className="space-y-1">
                                    <label className="block text-xs font-semibold text-muted-foreground">{label}</label>
                                    <Controller
                                        name={name}
                                        control={control}
                                        render={({ field }) => (
                                            <input
                                                type="number"
                                                min={-1}
                                                value={field.value ?? ""}
                                                onChange={(e) =>
                                                    field.onChange(e.target.value === "" ? null : Number(e.target.value))
                                                }
                                                onBlur={field.onBlur}
                                                placeholder="blank = unlimited"
                                                className={inputCls(!!errors[name])}
                                            />
                                        )}
                                    />
                                    <FieldError msg={errors[name]?.message} />
                                </div>
                            ))}
                        </div>

                        <div className="border-t border-border/50 pt-4">
                            <SectionHeading>Upload Settings</SectionHeading>
                            <div className="space-y-1">
                                <label className="block text-xs font-semibold text-muted-foreground">Max Simultaneous Uploads</label>
                                <input
                                    type="number"
                                    min={1}
                                    {...register("simultaneous_uploads", { valueAsNumber: true })}
                                    className={inputCls(!!errors.simultaneous_uploads)}
                                />
                                <FieldError msg={errors.simultaneous_uploads?.message} />
                            </div>
                        </div>
                    </section>
                )}

                {/* ── OVERAGE PRICING TAB ─────────────────────────────── */}
                {activeTab === "overages" && (
                    <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
                        <SectionHeading>Overage Pricing</SectionHeading>
                        <p className="text-xs text-muted-foreground mb-4">Set the cost per unit when usage exceeds plan limits</p>

                        <div className="grid grid-cols-2 gap-4">
                            {(
                                [
                                    ["overage_bandwidth_per_gb", "Bandwidth (per GB)"],
                                    ["overage_storage_per_gb", "Storage (per GB/month)"],
                                    ["overage_encoding_per_minute", "Encoding (per minute)"],
                                    ["overage_api_per_1m_calls", "API Calls (per 1M calls)"],
                                ] as const
                            ).map(([name, label]) => (
                                <div key={name} className="space-y-1">
                                    <label className="block text-xs font-semibold text-muted-foreground">{label}</label>
                                    <Controller
                                        name={name}
                                        control={control}
                                        render={({ field }) => (
                                            <input
                                                type="number"
                                                min={0}
                                                step="0.01"
                                                value={field.value ?? ""}
                                                onChange={(e) =>
                                                    field.onChange(e.target.value === "" ? null : Number(e.target.value))
                                                }
                                                placeholder="Leave blank to disable overages"
                                                className={inputCls(!!errors[name])}
                                            />
                                        )}
                                    />
                                    <FieldError msg={errors[name]?.message} />
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* ── CONTENT RESTRICTIONS TAB ────────────────────────── */}
                {activeTab === "content" && (
                    <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
                        <SectionHeading>Content Restrictions</SectionHeading>

                        <div className="space-y-3">
                            <div>
                                <p className="text-xs font-semibold text-muted-foreground mb-3">Allowed Content Types</p>
                                <div className="flex flex-wrap gap-3">
                                    {["video", "audio", "livestream", "series", "channel"].map((type) => (
                                        <Controller
                                            key={type}
                                            name="allowed_content_types"
                                            control={control}
                                            render={({ field }) => (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const current = field.value || [];
                                                        if (current.includes(type)) {
                                                            field.onChange(current.filter((t) => t !== type));
                                                        } else {
                                                            field.onChange([...current, type]);
                                                        }
                                                    }}
                                                    className={`px-4 py-2 rounded-lg border text-xs font-medium transition-colors capitalize ${
                                                        (field.value || []).includes(type)
                                                            ? "border-primary bg-primary/10 text-primary"
                                                            : "border-border text-muted-foreground hover:text-foreground"
                                                    }`}
                                                >
                                                    {type}
                                                </button>
                                            )}
                                        />
                                    ))}
                                </div>
                            </div>

                            <div className="border-t border-border/50 pt-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="block text-xs font-semibold text-muted-foreground">Max Bitrate (Mbps)</label>
                                        <Controller
                                            name="max_bitrate_mbps"
                                            control={control}
                                            render={({ field }) => (
                                                <input
                                                    type="number"
                                                    value={field.value ?? ""}
                                                    onChange={(e) =>
                                                        field.onChange(e.target.value === "" ? null : Number(e.target.value))
                                                    }
                                                    placeholder="e.g., 6 for 1080p, 3 for 720p"
                                                    className={inputCls(!!errors.max_bitrate_mbps)}
                                                />
                                            )}
                                        />
                                        <FieldError msg={errors.max_bitrate_mbps?.message} />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="block text-xs font-semibold text-muted-foreground">Content Retention (days)</label>
                                        <input
                                            type="number"
                                            min={1}
                                            {...register("content_retention_days", { valueAsNumber: true })}
                                            className={inputCls(!!errors.content_retention_days)}
                                        />
                                        <FieldError msg={errors.content_retention_days?.message} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                )}

                {/* ── Root error ──────────────────────────────────────── */}
                {errors.root && (
                    <div className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm text-red-300 border border-red-500/20 bg-red-500/8">
                        <AlertTriangle size={14} /> {errors.root.message}
                    </div>
                )}

                {/* ── Submit ──────────────────────────────────────────── */}
                <div className="flex items-center gap-3 pt-2">
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
                        {mode === "create" ? "Create Plan" : "Save Changes"}
                    </button>
                    <button
                        type="button"
                        onClick={() => router.push("/admin/plans")}
                        className="px-4 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </form>
    );
}
