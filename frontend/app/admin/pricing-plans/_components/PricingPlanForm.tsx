"use client";

import { useEffect, useRef, useState } from "react";
import { useForm, Controller, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, AlertTriangle, CheckCircle2, Plus, Trash2, X } from "lucide-react";
import { LabeledSwitch } from "@/components/ui/labeled-switch";
import {
    createClientPlan,
    listAudios,
    listCategories,
    listLiveTvChannels,
    listSeries,
    listVideos,
    updateClientPlan,
    type ClientPricingPlanOut,
    type ClientPricingPlanCreate,
    type CategoryOut,
    type BillingCycle,
    type PlanType,
    type CountryPriceOverride,
} from "@/lib/api";

// ─── Countries ────────────────────────────────────────────────────────────────

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

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "AED", "SGD", "CAD", "AUD"] as const;

const SUBSCRIPTION_CYCLE_OPTIONS = [
    { billingValue: 1, billingUnit: "months" as const, label: "Monthly", desc: "Billed every month" },
    { billingValue: 3, billingUnit: "months" as const, label: "Quarterly", desc: "Billed every 3 months" },
    { billingValue: 12, billingUnit: "months" as const, label: "Yearly", desc: "Billed once a year" },
];

// ─── Schema ───────────────────────────────────────────────────────────────────

const nullablePosInt = z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : Math.trunc(Number(v))),
    z.number().int().min(1, "Must be ≥ 1").nullable(),
);

const countryPriceSchema = z.object({
    country: z.string().min(1, "Select a country"),
    price: z.coerce.number({ invalid_type_error: "Price required" }).min(0, "Must be ≥ 0"),
    currency: z.enum(["USD", "EUR", "GBP", "INR", "AED", "SGD", "CAD", "AUD"]),
});

const schema = z.object({
    name: z.string().trim().min(1, "Name is required").max(255, "Name must be 255 characters or less"),
    description: z.string().optional(),
    price: z.coerce.number({ invalid_type_error: "Price is required" }).min(0, "Must be ≥ 0"),
    currency: z.enum(["USD", "EUR", "GBP", "INR", "AED", "SGD", "CAD", "AUD"]),
    billing_value: nullablePosInt,
    billing_unit: z.enum(["months", "days", "hours"]),
    plan_type: z.enum(["subscription", "ppv", "rent"]),
    trial_days: z.coerce.number().int().min(0, "Must be between 0 and 365").max(365, "Must be between 0 and 365"),
    trial_requires_active_payment_method: z.boolean(),
    max_screens: nullablePosInt,
    max_downloads: nullablePosInt,
    is_active: z.boolean(),
    country_pricing: z.array(countryPriceSchema).optional(),
}).superRefine((data, ctx) => {
    if (!data.country_pricing || data.country_pricing.length === 0) return;
    const seen = new Set<string>();
    data.country_pricing.forEach((row, idx) => {
        const code = row.country.trim().toUpperCase();
        if (!code) return;
        if (seen.has(code)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["country_pricing", idx, "country"],
                message: "Country already has an override",
            });
            return;
        }
        seen.add(code);
    });
});

type FormValues = z.infer<typeof schema>;

// ─── Default values ───────────────────────────────────────────────────────────

function deriveBillingFromPlan(plan?: ClientPricingPlanOut): {
    billing_value: number | null;
    billing_unit: "months" | "days" | "hours";
} {
    if (!plan) return { billing_value: 1, billing_unit: "months" };
    if (plan.billing_cycle === "daily" || plan.billing_cycle === "weekly") {
        if (plan.restriction_days != null) return { billing_value: plan.restriction_days, billing_unit: "days" };
        if (plan.restriction_hours_per_day != null) return { billing_value: plan.restriction_hours_per_day, billing_unit: "hours" };
    }
    if (plan.billing_cycle === "monthly" || plan.billing_cycle === "quarterly" || plan.billing_cycle === "yearly") {
        if (plan.restriction_months != null) return { billing_value: plan.restriction_months, billing_unit: "months" };
    }
    if (plan.restriction_months != null) return { billing_value: plan.restriction_months, billing_unit: "months" };
    if (plan.restriction_days != null) return { billing_value: plan.restriction_days, billing_unit: "days" };
    if (plan.restriction_hours_per_day != null) return { billing_value: plan.restriction_hours_per_day, billing_unit: "hours" };
    // Fall back to billing_cycle enum
    switch (plan.billing_cycle) {
        case "daily": return { billing_value: 1, billing_unit: "days" };
        case "weekly": return { billing_value: 7, billing_unit: "days" };
        case "monthly": return { billing_value: 1, billing_unit: "months" };
        case "quarterly": return { billing_value: 3, billing_unit: "months" };
        case "yearly": return { billing_value: 12, billing_unit: "months" };
        default: return { billing_value: null, billing_unit: "months" };
    }
}

function planToFormValues(plan?: ClientPricingPlanOut): FormValues {
    const { billing_value, billing_unit } = deriveBillingFromPlan(plan);
    return {
        name: plan?.name ?? "",
        description: plan?.description ?? "",
        price: plan?.price ?? 0,
        currency: (plan?.currency as FormValues["currency"]) ?? "USD",
        billing_value,
        billing_unit,
        plan_type: (plan?.plan_type as FormValues["plan_type"]) ?? "subscription",
        trial_days: plan?.trial_days ?? 0,
        trial_requires_active_payment_method: plan?.trial_requires_active_payment_method ?? false,
        max_screens: plan?.max_screens ?? null,
        max_downloads: plan?.max_downloads ?? null,
        is_active: plan?.is_active ?? true,
        country_pricing: (plan?.country_pricing as FormValues["country_pricing"]) ?? [],
    };
}

function isPresetSubscriptionCycle(
    billingValue: number | null | undefined,
    billingUnit: FormValues["billing_unit"] | undefined,
) {
    return SUBSCRIPTION_CYCLE_OPTIONS.some(
        (option) => option.billingValue === billingValue && option.billingUnit === billingUnit,
    );
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

function inputCls(hasError = false) {
    return `w-full h-9 rounded-lg bg-secondary border ${hasError ? "border-red-500/60" : "border-border"} px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors`;
}

function selectCls(hasError = false) {
    return `w-full h-9 rounded-lg bg-secondary border ${hasError ? "border-red-500/60" : "border-border"} px-3 pr-8 text-sm text-foreground appearance-none focus:outline-none focus:ring-1 focus:ring-primary transition-colors`;
}

function FieldError({ msg }: { msg?: string }) {
    if (!msg) return null;
    return <p className="text-[11px] text-red-400 mt-0.5">{msg}</p>;
}

function SectionHeading({ children }: { children: React.ReactNode }) {
    return <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">{children}</h3>;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface PricingPlanFormProps {
    mode: "create" | "edit";
    planId?: string;
    defaultValues?: ClientPricingPlanOut;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PricingPlanForm({ mode, planId, defaultValues }: PricingPlanFormProps) {
    const router = useRouter();
    const initialized = useRef(false);
    const initialBilling = deriveBillingFromPlan(defaultValues);
    const lastPaidPriceRef = useRef<number>(defaultValues?.price && defaultValues.price > 0 ? defaultValues.price : 9.99);
    const [freeSubscriptionEnabled, setFreeSubscriptionEnabled] = useState(
        defaultValues?.plan_type === "subscription" && Number(defaultValues?.price ?? 0) === 0,
    );
    const [freeTrialEnabled, setFreeTrialEnabled] = useState(
        defaultValues?.plan_type === "subscription"
            && Number(defaultValues?.price ?? 0) > 0
            && Number(defaultValues?.trial_days ?? 0) > 0,
    );
    const [subscriptionCycleMode, setSubscriptionCycleMode] = useState<"preset" | "custom">(
        isPresetSubscriptionCycle(initialBilling.billing_value, initialBilling.billing_unit)
            ? "preset"
            : "custom",
    );
    const [appliesToMode, setAppliesToMode] = useState<"all" | "specific">("all");
    const [appliesToScope, setAppliesToScope] = useState<"content" | "category_subcategory">("content");
    const [appliesToSelectedOptionId, setAppliesToSelectedOptionId] = useState("");
    const [availableContentOptions, setAvailableContentOptions] = useState<Array<{ id: string; label: string }>>([]);
    const [availableCategoryOptions, setAvailableCategoryOptions] = useState<Array<{ id: string; label: string }>>([]);
    const [contentOptionMap, setContentOptionMap] = useState<Record<string, string>>({});
    const [categoryOptionMap, setCategoryOptionMap] = useState<Record<string, string>>({});
    const [appliesToSearchInput, setAppliesToSearchInput] = useState("");
    const [appliesToSearchQuery, setAppliesToSearchQuery] = useState("");
    const [appliesToLoadingOptions, setAppliesToLoadingOptions] = useState(false);
    const [appliesToOptionsError, setAppliesToOptionsError] = useState<string | null>(null);
    const [appliesToDropdownOpen, setAppliesToDropdownOpen] = useState(false);
    const [selectedContentIds, setSelectedContentIds] = useState<string[]>([]);
    const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);

    const {
        register,
        handleSubmit,
        control,
        setError,
        setValue,
        reset,
        formState: { errors, isSubmitting },
    } = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: planToFormValues(defaultValues),
    });

    const { fields: cpFields, append: cpAppend, remove: cpRemove } = useFieldArray({
        control,
        name: "country_pricing",
    });

    const planType = useWatch({ control, name: "plan_type" });
    const billingValue = useWatch({ control, name: "billing_value" });
    const billingUnit = useWatch({ control, name: "billing_unit" });
    const price = useWatch({ control, name: "price" });
    const isCustomSubscriptionCycle = planType === "subscription" && subscriptionCycleMode === "custom";
    const isFreeSubscription = planType === "subscription" && freeSubscriptionEnabled;

    useEffect(() => {
        if (defaultValues && !initialized.current) {
            reset(planToFormValues(defaultValues));
            const derivedBilling = deriveBillingFromPlan(defaultValues);
            setFreeSubscriptionEnabled(
                defaultValues.plan_type === "subscription" && Number(defaultValues.price ?? 0) === 0,
            );
            setFreeTrialEnabled(
                defaultValues.plan_type === "subscription"
                    && Number(defaultValues.price ?? 0) > 0
                    && Number(defaultValues.trial_days ?? 0) > 0,
            );
            setSubscriptionCycleMode(
                isPresetSubscriptionCycle(derivedBilling.billing_value, derivedBilling.billing_unit)
                    ? "preset"
                    : "custom",
            );
            const isSubscriptionPlan = defaultValues.plan_type === "subscription";
            setAppliesToMode(isSubscriptionPlan && !defaultValues.applies_to_all_content ? "specific" : "all");
            setAppliesToScope(defaultValues.applies_to_scope === "category_subcategory" ? "category_subcategory" : "content");
            setSelectedContentIds(isSubscriptionPlan ? (defaultValues.applies_to_content_ids ?? []).map(String) : []);
            setSelectedCategoryIds(isSubscriptionPlan ? (defaultValues.applies_to_category_ids ?? []).map(String) : []);
            initialized.current = true;
        }
    }, [defaultValues, reset]);

    useEffect(() => {
        const timer = setTimeout(() => {
            setAppliesToSearchQuery(appliesToSearchInput.trim());
        }, 300);
        return () => clearTimeout(timer);
    }, [appliesToSearchInput]);

    useEffect(() => {
        setAppliesToSelectedOptionId("");
    }, [appliesToScope]);

    useEffect(() => {
        if (planType !== "subscription" || appliesToMode !== "specific") return;
        if (!appliesToSearchQuery) {
            setAvailableContentOptions([]);
            setAvailableCategoryOptions([]);
            setAppliesToLoadingOptions(false);
            setAppliesToOptionsError(null);
            return;
        }

        const CONTENT_PAGE_SIZE = 100;
        const CATEGORY_PAGE_SIZE = 200;
        let cancelled = false;

        const loadAppliesToOptions = async () => {
            setAppliesToLoadingOptions(true);
            setAppliesToOptionsError(null);
            try {
                if (appliesToScope === "content") {
                    const [videosRes, liveRes, seriesRes, audiosRes] = await Promise.allSettled([
                        listVideos({ page: 1, page_size: CONTENT_PAGE_SIZE, search: appliesToSearchQuery || undefined }),
                        listLiveTvChannels({ page: 1, page_size: CONTENT_PAGE_SIZE, search: appliesToSearchQuery || undefined }),
                        listSeries({ page: 1, page_size: CONTENT_PAGE_SIZE }),
                        listAudios({ page: 1, page_size: CONTENT_PAGE_SIZE, search: appliesToSearchQuery || undefined }),
                    ]);

                    if (cancelled) return;

                    const videoOptions = videosRes.status === "fulfilled"
                        ? videosRes.value.map((v) => ({ id: v.id, label: `[Video] ${v.title}` }))
                        : [];
                    const liveOptions = liveRes.status === "fulfilled"
                        ? liveRes.value.map((c) => ({ id: c.id, label: `[Live] ${c.title}` }))
                        : [];
                    const seriesOptions = seriesRes.status === "fulfilled"
                        ? seriesRes.value
                            .filter((s) => !appliesToSearchQuery || s.title.toLowerCase().includes(appliesToSearchQuery.toLowerCase()))
                            .map((s) => ({ id: s.id, label: `[Series] ${s.title}` }))
                        : [];
                    const audioOptions = audiosRes.status === "fulfilled"
                        ? audiosRes.value.map((a) => ({ id: a.id, label: `[Audio] ${a.title}` }))
                        : [];

                    const incomingOptions = [...videoOptions, ...liveOptions, ...seriesOptions, ...audioOptions];

                    setAvailableContentOptions(incomingOptions);
                    setContentOptionMap((prev) => {
                        const next = { ...prev };
                        for (const option of incomingOptions) next[option.id] = option.label;
                        return next;
                    });
                    return;
                }

                const categories = await listCategories({
                    page: 1,
                    page_size: CATEGORY_PAGE_SIZE,
                    search: appliesToSearchQuery || undefined,
                });
                if (cancelled) return;

                const incomingCategoryOptions = categories.items.map((cat: CategoryOut) => ({
                    id: cat.id,
                    label: cat.parent_id ? `[Sub] ${cat.name}` : `[Category] ${cat.name}`,
                }));

                setAvailableCategoryOptions(incomingCategoryOptions);
                setCategoryOptionMap((prev) => {
                    const next = { ...prev };
                    for (const option of incomingCategoryOptions) next[option.id] = option.label;
                    return next;
                });
            } catch (err) {
                if (cancelled) return;
                setAppliesToOptionsError(err instanceof Error ? err.message : "Failed to load options");
                if (appliesToScope === "content") setAvailableContentOptions([]);
                else setAvailableCategoryOptions([]);
            } finally {
                if (!cancelled) setAppliesToLoadingOptions(false);
            }
        };

        void loadAppliesToOptions();
        return () => {
            cancelled = true;
        };
    }, [appliesToMode, appliesToScope, appliesToSearchQuery, planType]);

    useEffect(() => {
        if (planType !== "subscription") return;
        if (subscriptionCycleMode === "preset" && !isPresetSubscriptionCycle(billingValue, billingUnit)) {
            setSubscriptionCycleMode("custom");
            return;
        }
        if (subscriptionCycleMode === "custom" && billingValue == null) {
            setValue("billing_value", 1, { shouldDirty: true, shouldValidate: true });
            if (billingUnit === "hours") {
                setValue("billing_unit", "days", { shouldDirty: true, shouldValidate: true });
            }
        }
    }, [billingUnit, billingValue, planType, setValue, subscriptionCycleMode]);

    useEffect(() => {
        if (typeof price === "number" && price > 0) {
            lastPaidPriceRef.current = price;
        }
    }, [price]);

    useEffect(() => {
        if (planType !== "subscription") {
            setFreeSubscriptionEnabled(false);
            setFreeTrialEnabled(false);
            setValue("trial_days", 0, { shouldDirty: true, shouldValidate: true });
            setValue("trial_requires_active_payment_method", false, { shouldDirty: true, shouldValidate: true });
            setAppliesToMode("all");
            setSelectedContentIds([]);
            setSelectedCategoryIds([]);
            setAppliesToSelectedOptionId("");
            setAppliesToSearchInput("");
            setAppliesToSearchQuery("");
            setAppliesToDropdownOpen(false);
            return;
        }

        if (isFreeSubscription) {
            setFreeTrialEnabled(false);
            setValue("trial_days", 0, { shouldDirty: true, shouldValidate: true });
            setValue("trial_requires_active_payment_method", false, { shouldDirty: true, shouldValidate: true });
        }
    }, [isFreeSubscription, planType, setValue]);

    const toggleFreeSubscription = (nextValue: boolean) => {
        setFreeSubscriptionEnabled(nextValue);

        if (nextValue) {
            setFreeTrialEnabled(false);
            setValue("trial_days", 0, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
            setValue("trial_requires_active_payment_method", false, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
            if (typeof price === "number" && price > 0) {
                lastPaidPriceRef.current = price;
            }
            setValue("price", 0, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
            return;
        }

        setValue(
            "price",
            lastPaidPriceRef.current > 0 ? lastPaidPriceRef.current : 9.99,
            { shouldDirty: true, shouldTouch: true, shouldValidate: true },
        );
    };

    const toggleFreeTrialPeriod = (nextValue: boolean) => {
        setFreeTrialEnabled(nextValue);

        if (nextValue) {
            if (freeSubscriptionEnabled) {
                setFreeSubscriptionEnabled(false);
                setValue(
                    "price",
                    lastPaidPriceRef.current > 0 ? lastPaidPriceRef.current : 9.99,
                    { shouldDirty: true, shouldTouch: true, shouldValidate: true },
                );
            }
            setValue("trial_days", 7, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
            return;
        }

        setValue("trial_days", 0, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
        setValue("trial_requires_active_payment_method", false, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
    };

    const handleAddAppliesTo = () => {
        if (!appliesToSelectedOptionId) return;

        if (appliesToScope === "content") {
            setSelectedContentIds((prev) => (prev.includes(appliesToSelectedOptionId) ? prev : [...prev, appliesToSelectedOptionId]));
        } else {
            setSelectedCategoryIds((prev) => (prev.includes(appliesToSelectedOptionId) ? prev : [...prev, appliesToSelectedOptionId]));
        }

        setAppliesToSelectedOptionId("");
        setAppliesToSearchInput("");
        setAppliesToSearchQuery("");
        setAppliesToDropdownOpen(false);
    };

    const onSubmit = async (data: FormValues) => {
        // Map billing_value + billing_unit → backend billing_cycle + restriction fields
        let billing_cycle: BillingCycle = "monthly";
        let restriction_months: number | null = null;
        let restriction_days: number | null = null;
        let restriction_hours_per_day: number | null = null;
        const submitAsFreeSubscription = data.plan_type === "subscription" && freeSubscriptionEnabled;
        const normalizedTrialDays = Number.isFinite(data.trial_days)
            ? Math.max(0, Math.min(365, Math.trunc(data.trial_days)))
            : 0;
        const submitTrialDays = (!submitAsFreeSubscription && data.plan_type === "subscription" && freeTrialEnabled)
            ? normalizedTrialDays
            : 0;
        const appliesToAllContent = data.plan_type !== "subscription" || appliesToMode === "all";

        if (submitAsFreeSubscription) {
            billing_cycle = "lifetime";
        } else if (data.billing_value != null) {
            if (data.billing_unit === "months") {
                restriction_months = data.billing_value;
                billing_cycle = data.billing_value >= 12 ? "yearly"
                    : data.billing_value >= 3 ? "quarterly"
                        : "monthly";
            } else if (data.billing_unit === "days") {
                restriction_days = data.billing_value;
                billing_cycle = data.billing_value >= 7 ? "weekly" : "daily";
            } else {
                restriction_hours_per_day = data.billing_value;
                billing_cycle = "daily";
            }
        }

        const payload: ClientPricingPlanCreate = {
            name: data.name,
            description: data.description || null,
            price: submitAsFreeSubscription ? 0 : data.price,
            currency: data.currency,
            billing_cycle,
            plan_type: data.plan_type as PlanType,
            trial_days: submitTrialDays,
            trial_requires_active_payment_method: submitTrialDays > 0 && !!data.trial_requires_active_payment_method,
            applies_to_all_content: appliesToAllContent,
            applies_to_scope: data.plan_type === "subscription" ? appliesToScope : "content",
            applies_to_content_ids: appliesToAllContent
                ? null
                : (appliesToScope === "content" ? selectedContentIds : null),
            applies_to_category_ids: appliesToAllContent
                ? null
                : (appliesToScope === "category_subcategory" ? selectedCategoryIds : null),
            max_screens: data.max_screens,
            max_downloads: data.max_downloads,
            restriction_months,
            restriction_hours_per_day,
            restriction_days,
            country_pricing: (data.country_pricing && data.country_pricing.length > 0)
                ? (submitAsFreeSubscription
                    ? null
                    : (data.country_pricing as CountryPriceOverride[]))
                : null,
        };

        try {
            if (mode === "edit" && planId) {
                await updateClientPlan(planId, { ...payload, is_active: data.is_active });
            } else {
                await createClientPlan(payload);
            }
            router.push(
                mode === "create"
                    ? "/admin/pricing-plans?toast=plan-created"
                    : "/admin/pricing-plans?toast=plan-updated",
            );
        } catch (err: unknown) {
            setError("root", { message: err instanceof Error ? err.message : "Failed to save plan" });
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="w-full">
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6 items-start mb-20">

                {/* ══════════════ LEFT COLUMN ══════════════ */}
                <div className="space-y-6">

                    {/* ── Basic Information ─────────────────────────────────── */}
                    <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
                        <SectionHeading>Basic Information</SectionHeading>

                        <div className="space-y-1">
                            <label className="block text-xs font-semibold text-muted-foreground">Name *</label>
                            <input
                                {...register("name")}
                                autoFocus
                                placeholder="e.g. Standard Monthly"
                                className={inputCls(!!errors.name)}
                            />
                            <FieldError msg={errors.name?.message} />
                        </div>

                        <div className="space-y-1">
                            <label className="block text-xs font-semibold text-muted-foreground">Description</label>
                            <textarea
                                {...register("description")}
                                rows={3}
                                placeholder="Describe what this plan includes…"
                                className="w-full rounded-lg bg-secondary border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                            />
                        </div>
                    </section>

                    {/* ── Pricing ───────────────────────────────────────────── */}
                    <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
                        <div>
                            <SectionHeading>Pricing</SectionHeading>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Default price applied to all countries. Add country overrides below to charge a different amount for specific countries.
                            </p>
                        </div>

                        {planType === "subscription" && (
                            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                                <Controller
                                    name="price"
                                    control={control}
                                    render={() => (
                                        <LabeledSwitch
                                            checked={isFreeSubscription}
                                            onCheckedChange={toggleFreeSubscription}
                                            label="Free subscription"
                                            description="Sets the subscription price to 0 so users can start it without being charged."
                                        />
                                    )}
                                />

                                <div className="mt-3 border-t border-emerald-500/20 pt-3">
                                    <Controller
                                        name="trial_days"
                                        control={control}
                                        render={() => (
                                            <LabeledSwitch
                                                checked={freeTrialEnabled}
                                                onCheckedChange={toggleFreeTrialPeriod}
                                                label="Free Trial Period"
                                                description="Allow users to start with a one-time trial period before they need to purchase."
                                            />
                                        )}
                                    />

                                    {freeTrialEnabled && !isFreeSubscription && (
                                        <div className="mt-3 space-y-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                                            <div className="space-y-1">
                                                <label className="block text-xs font-semibold text-muted-foreground">Trial Period (days)</label>
                                                <input
                                                    {...register("trial_days")}
                                                    type="number"
                                                    min={0}
                                                    max={365}
                                                    step={1}
                                                    placeholder="7"
                                                    className={inputCls(!!errors.trial_days)}
                                                />
                                                <p className="text-[10px] text-muted-foreground">Allowed range: 0 to 365 days.</p>
                                                <FieldError msg={errors.trial_days?.message} />
                                            </div>

                                            <Controller
                                                name="trial_requires_active_payment_method"
                                                control={control}
                                                render={({ field }) => (
                                                    <LabeledSwitch
                                                        checked={Boolean(field.value)}
                                                        onCheckedChange={(checked) => field.onChange(Boolean(checked))}
                                                        label="Require active payment method to start trial"
                                                        description="Users must save a payment method before the trial can begin."
                                                    />
                                                )}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="block text-xs font-semibold text-muted-foreground">Default Price *</label>
                                <input
                                    {...register("price")}
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    placeholder="9.99"
                                    disabled={isFreeSubscription}
                                    className={inputCls(!!errors.price)}
                                />
                                {isFreeSubscription && (
                                    <p className="text-[10px] text-muted-foreground">Price is locked to 0 while free subscription is enabled.</p>
                                )}
                                <FieldError msg={errors.price?.message} />
                            </div>

                            <div className="space-y-1">
                                <label className="block text-xs font-semibold text-muted-foreground">Default Currency</label>
                                <div className="relative">
                                    <select {...register("currency")} className={selectCls()}>
                                        {CURRENCIES.map((c) => (
                                            <option key={c} value={c}>{c}</option>
                                        ))}
                                    </select>
                                    <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                                </div>
                            </div>
                        </div>

                        {!isFreeSubscription && (
                            <div className="space-y-4 border-t border-border/60 pt-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <SectionHeading>Country Overrides</SectionHeading>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            Set a different price for specific countries. Countries not listed here will use the default price above.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => cpAppend({ country: "", price: 0, currency: "USD" })}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-primary border border-primary/30 hover:bg-primary/10 transition-colors shrink-0"
                                    >
                                        <Plus size={12} /> Add Country
                                    </button>
                                </div>

                                {cpFields.length === 0 && (
                                    <p className="text-xs text-muted-foreground italic">
                                        No overrides set — all countries will be charged the default price.
                                    </p>
                                )}

                                <div className="space-y-3">
                                    {cpFields.map((field, idx) => (
                                        <div key={field.id} className="grid grid-cols-[1fr_120px_100px_auto] gap-2 items-start">
                                            <div className="space-y-1">
                                                {idx === 0 && <label className="block text-[11px] font-semibold text-muted-foreground">Country</label>}
                                                <div className="relative">
                                                    <select
                                                        {...register(`country_pricing.${idx}.country`)}
                                                        className={selectCls(!!errors.country_pricing?.[idx]?.country)}
                                                    >
                                                        <option value="">— Select —</option>
                                                        {COUNTRIES.map((c) => (
                                                            <option key={c.code} value={c.code}>{c.name}</option>
                                                        ))}
                                                    </select>
                                                    <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                                                </div>
                                                <FieldError msg={errors.country_pricing?.[idx]?.country?.message} />
                                            </div>

                                            <div className="space-y-1">
                                                {idx === 0 && <label className="block text-[11px] font-semibold text-muted-foreground">Price</label>}
                                                <input
                                                    {...register(`country_pricing.${idx}.price`)}
                                                    type="number"
                                                    min={0}
                                                    step="0.01"
                                                    placeholder="0.00"
                                                    className={inputCls(!!errors.country_pricing?.[idx]?.price)}
                                                />
                                                <FieldError msg={errors.country_pricing?.[idx]?.price?.message} />
                                            </div>

                                            <div className="space-y-1">
                                                {idx === 0 && <label className="block text-[11px] font-semibold text-muted-foreground">Currency</label>}
                                                <div className="relative">
                                                    <select
                                                        {...register(`country_pricing.${idx}.currency`)}
                                                        className={selectCls()}
                                                    >
                                                        {CURRENCIES.map((c) => (
                                                            <option key={c} value={c}>{c}</option>
                                                        ))}
                                                    </select>
                                                    <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                                                </div>
                                            </div>

                                            <div className={idx === 0 ? "pt-5" : ""}>
                                                <button
                                                    type="button"
                                                    onClick={() => cpRemove(idx)}
                                                    className="h-9 w-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/8 transition-colors"
                                                    aria-label="Remove override"
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </section>

                    {/* ── Applies To ───────────────────────────────────── */}
                    {planType === "subscription" && <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
                        <SectionHeading>Applies To</SectionHeading>

                        <div className="flex items-center gap-6">
                            <button
                                type="button"
                                onClick={() => {
                                    setAppliesToMode("all");
                                    setSelectedContentIds([]);
                                    setSelectedCategoryIds([]);
                                    setAppliesToSelectedOptionId("");
                                    setAppliesToSearchInput("");
                                    setAppliesToDropdownOpen(false);
                                }}
                                className="flex items-center gap-2 text-sm text-foreground"
                            >
                                <span className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${appliesToMode === "all" ? "border-primary" : "border-muted-foreground/40"}`}>
                                    {appliesToMode === "all" && <span className="h-2 w-2 rounded-full bg-primary" />}
                                </span>
                                All Content
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setAppliesToMode("specific");
                                    setAppliesToSearchInput("");
                                    setAppliesToSelectedOptionId("");
                                    setAppliesToDropdownOpen(true);
                                }}
                                className="flex items-center gap-2 text-sm text-foreground"
                            >
                                <span className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${appliesToMode === "specific" ? "border-primary" : "border-muted-foreground/40"}`}>
                                    {appliesToMode === "specific" && <span className="h-2 w-2 rounded-full bg-primary" />}
                                </span>
                                Specific Contents
                            </button>
                        </div>

                        {appliesToMode === "specific" && (
                            <div className="space-y-3">
                                <div className="grid grid-cols-1 md:grid-cols-[220px_1fr_auto] gap-3">
                                    <div className="relative">
                                        <select
                                            value={appliesToScope}
                                            onChange={(e) => {
                                                setAppliesToScope(e.target.value as "content" | "category_subcategory");
                                                setAppliesToSelectedOptionId("");
                                                setAppliesToSearchInput("");
                                                setAppliesToDropdownOpen(true);
                                            }}
                                            className={selectCls()}
                                        >
                                            <option value="category_subcategory">Category/Sub Category</option>
                                            <option value="content">Content</option>
                                        </select>
                                        <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                                    </div>

                                    <div className="relative">
                                        <input
                                            value={appliesToSearchInput}
                                            onFocus={() => setAppliesToDropdownOpen(true)}
                                            onBlur={() => {
                                                setTimeout(() => setAppliesToDropdownOpen(false), 120);
                                            }}
                                            onChange={(e) => {
                                                setAppliesToSearchInput(e.target.value);
                                                setAppliesToSelectedOptionId("");
                                                setAppliesToDropdownOpen(true);
                                            }}
                                            placeholder="Type at least one letter to search content/category"
                                            className={inputCls()}
                                        />

                                        {appliesToDropdownOpen
                                            && !!appliesToSearchQuery
                                            && (appliesToScope === "content" ? availableContentOptions : availableCategoryOptions).length > 0 && (
                                            <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
                                                {(appliesToScope === "content" ? availableContentOptions : availableCategoryOptions).map((opt) => (
                                                    <button
                                                        key={opt.id}
                                                        type="button"
                                                        onMouseDown={(e) => {
                                                            e.preventDefault();
                                                            setAppliesToSelectedOptionId(opt.id);
                                                            setAppliesToSearchInput(opt.label);
                                                            setAppliesToDropdownOpen(false);
                                                        }}
                                                        className="block w-full px-3 py-2 text-left text-xs text-foreground hover:bg-secondary"
                                                    >
                                                        {opt.label}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <button
                                        type="button"
                                        onClick={handleAddAppliesTo}
                                        disabled={!appliesToSelectedOptionId}
                                        className="h-9 px-4 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        + Add
                                    </button>
                                </div>

                                {(selectedContentIds.length > 0 || selectedCategoryIds.length > 0) && (
                                    <div className="flex flex-wrap gap-2">
                                        {[...
                                            selectedContentIds.map((id) => ({ id, scope: "content" as const })),
                                            ...selectedCategoryIds.map((id) => ({ id, scope: "category_subcategory" as const })),
                                        ].map((item) => {
                                            const label = item.scope === "content"
                                                ? (contentOptionMap[item.id] ?? item.id)
                                                : (categoryOptionMap[item.id] ?? item.id);
                                            return (
                                                <span key={`${item.scope}-${item.id}`} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-xs text-foreground">
                                                    {label}
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            if (item.scope === "content") {
                                                                setSelectedContentIds((prev) => prev.filter((itemId) => itemId !== item.id));
                                                            } else {
                                                                setSelectedCategoryIds((prev) => prev.filter((itemId) => itemId !== item.id));
                                                            }
                                                        }}
                                                        className="text-muted-foreground hover:text-red-400"
                                                        aria-label="Remove applies-to item"
                                                    >
                                                        <X size={12} />
                                                    </button>
                                                </span>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </section>}

                    {/* ── Device Limits ───────────────────────────────────── */}
                    <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
                        <div>
                            <SectionHeading>Device Limits</SectionHeading>
                            <p className="text-xs text-muted-foreground mt-1">Leave blank for unlimited.</p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="block text-xs font-semibold text-muted-foreground">Max Screens</label>
                                <Controller
                                    name="max_screens"
                                    control={control}
                                    render={({ field }) => (
                                        <input
                                            type="number"
                                            min={1}
                                            step={1}
                                            value={field.value ?? ""}
                                            onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                                            placeholder="e.g. 2"
                                            className={inputCls(!!errors.max_screens)}
                                        />
                                    )}
                                />
                                <p className="text-[10px] text-muted-foreground">Concurrent streams</p>
                                <FieldError msg={errors.max_screens?.message} />
                            </div>

                            <div className="space-y-1">
                                <label className="block text-xs font-semibold text-muted-foreground">Max Downloads</label>
                                <Controller
                                    name="max_downloads"
                                    control={control}
                                    render={({ field }) => (
                                        <input
                                            type="number"
                                            min={1}
                                            step={1}
                                            value={field.value ?? ""}
                                            onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                                            placeholder="e.g. 5"
                                            className={inputCls(!!errors.max_downloads)}
                                        />
                                    )}
                                />
                                <p className="text-[10px] text-muted-foreground">Offline downloads</p>
                                <FieldError msg={errors.max_downloads?.message} />
                            </div>
                        </div>
                    </section>

                </div>

                {/* ══════════════ RIGHT COLUMN ══════════════ */}
                <div className="space-y-6 xl:sticky xl:top-8">
                    {/* ── Status ────────────────────────────────────────────── */}
                    <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
                        <SectionHeading>Status</SectionHeading>
                        <Controller
                            name="is_active"
                            control={control}
                            render={({ field }) => (
                                <LabeledSwitch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    label="Active"
                                    description="Inactive plans are hidden from users"
                                />
                            )}
                        />
                    </section>
                    {/* ── Plan Type ──────────────────────────────────── */}
                    <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
                        <SectionHeading>Plan Type</SectionHeading>
                        <Controller
                            name="plan_type"
                            control={control}
                            render={({ field }) => (
                                <div className="flex flex-col gap-2">
                                    {([
                                        { value: "subscription", label: "Subscription", description: "Recurring access for a billing period" },
                                        { value: "ppv",          label: "PPV",          description: "One-time pay-per-view purchase" },
                                        { value: "rent",         label: "Rent",         description: "Temporary access for a fixed window" },
                                    ] as const).map((opt) => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => field.onChange(opt.value)}
                                            className={`flex items-center gap-3 w-full rounded-xl border px-2 py-2 text-left transition-colors ${
                                                field.value === opt.value
                                                    ? "border-primary bg-primary/10 text-foreground"
                                                    : "border-border bg-secondary hover:border-primary/40"
                                            }`}
                                        >
                                            <span className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center ${
                                                field.value === opt.value ? "border-primary" : "border-muted-foreground/40"
                                            }`}>
                                                {field.value === opt.value && (
                                                    <span className="h-2 w-2 rounded-full bg-primary" />
                                                )}
                                            </span>
                                            <span>
                                                <span className="block text-sm font-medium">{opt.label}</span>
                                                <span className="block text-xs text-muted-foreground">{opt.description}</span>
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        />
                    </section>

                    {/* ── Billing Cycle / Duration ───────────────────────── */}
                    {planType === "subscription" ? (
                        isFreeSubscription ? (
                            <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6 space-y-2">
                                <SectionHeading>Free Subscription</SectionHeading>
                                <p className="text-xs text-muted-foreground">
                                    Free subscription grants access while this plan remains active.
                                </p>
                            </section>
                        ) : (
                            <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
                                <div>
                                    <SectionHeading>Billing Cycle</SectionHeading>
                                    <p className="text-xs text-muted-foreground mt-1">How often the subscriber is charged.</p>
                                </div>

                                <Controller
                                    name="billing_value"
                                    control={control}
                                    render={({ field: bvField }) => (
                                        <Controller
                                            name="billing_unit"
                                            control={control}
                                            render={({ field: buField }) => (
                                                <div className="flex flex-col gap-2">
                                                    {SUBSCRIPTION_CYCLE_OPTIONS.map((opt) => {
                                                        const selected =
                                                            subscriptionCycleMode === "preset"
                                                            && bvField.value === opt.billingValue
                                                            && buField.value === opt.billingUnit;
                                                        return (
                                                            <button
                                                                key={opt.label}
                                                                type="button"
                                                                onClick={() => {
                                                                    setSubscriptionCycleMode("preset");
                                                                    bvField.onChange(opt.billingValue);
                                                                    buField.onChange(opt.billingUnit);
                                                                }}
                                                                className={`flex items-center gap-3 w-full rounded-xl border px-2 py-2 text-left transition-colors ${
                                                                    selected
                                                                        ? "border-primary bg-primary/10 text-foreground"
                                                                        : "border-border bg-secondary hover:border-primary/40"
                                                                }`}
                                                            >
                                                                <span className={`h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center ${
                                                                    selected ? "border-primary" : "border-muted-foreground/40"
                                                                }`}>
                                                                    {selected && <span className="h-2 w-2 rounded-full bg-primary" />}
                                                                </span>
                                                                <span>
                                                                    <span className="block text-sm font-medium">{opt.label}</span>
                                                                    <span className="block text-xs text-muted-foreground">{opt.desc}</span>
                                                                </span>
                                                            </button>
                                                        );
                                                    })}

                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setSubscriptionCycleMode("custom");
                                                            if (bvField.value == null) {
                                                                bvField.onChange(1);
                                                            }
                                                            if (buField.value === "hours") {
                                                                buField.onChange("days");
                                                            }
                                                        }}
                                                        className={`flex items-center gap-3 w-full rounded-xl border px-4 py-2 text-left transition-colors ${
                                                            isCustomSubscriptionCycle
                                                                ? "border-primary bg-primary/10 text-foreground"
                                                                : "border-border bg-secondary hover:border-primary/40"
                                                        }`}
                                                    >
                                                        <span className={`h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center ${
                                                            isCustomSubscriptionCycle ? "border-primary" : "border-muted-foreground/40"
                                                        }`}>
                                                            {isCustomSubscriptionCycle && <span className="h-2 w-2 rounded-full bg-primary" />}
                                                        </span>
                                                        <span>
                                                            <span className="block text-sm font-medium">Custom</span>
                                                            <span className="block text-xs text-muted-foreground">Billed every chosen number of days or months</span>
                                                        </span>
                                                    </button>

                                                    {isCustomSubscriptionCycle && (
                                                        <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-secondary/40 p-4">
                                                            <div className="space-y-1">
                                                                <label className="block text-xs font-semibold text-muted-foreground">Every</label>
                                                                <Controller
                                                                    name="billing_value"
                                                                    control={control}
                                                                    render={({ field }) => (
                                                                        <input
                                                                            type="number"
                                                                            min={1}
                                                                            step={1}
                                                                            value={field.value ?? ""}
                                                                            onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                                                                            placeholder="e.g. 45"
                                                                            className={inputCls(!!errors.billing_value)}
                                                                        />
                                                                    )}
                                                                />
                                                                <FieldError msg={errors.billing_value?.message} />
                                                            </div>

                                                            <div className="space-y-1">
                                                                <label className="block text-xs font-semibold text-muted-foreground">Unit</label>
                                                                <div className="relative">
                                                                    <select
                                                                        value={buField.value}
                                                                        onChange={(e) => buField.onChange(e.target.value as "months" | "days")}
                                                                        className={selectCls()}
                                                                    >
                                                                        <option value="days">Days</option>
                                                                        <option value="months">Months</option>
                                                                    </select>
                                                                    <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        />
                                    )}
                                />
                            </section>
                        )
                    ) : (
                        <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
                            <div>
                                <SectionHeading>Duration</SectionHeading>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {planType === "rent" ? "How long the rental window lasts." : "How long access is granted after purchase."}
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="block text-xs font-semibold text-muted-foreground">Value</label>
                                    <Controller
                                        name="billing_value"
                                        control={control}
                                        render={({ field }) => (
                                            <input
                                                type="number"
                                                min={1}
                                                step={1}
                                                value={field.value ?? ""}
                                                onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                                                placeholder="e.g. 48"
                                                className={inputCls(!!errors.billing_value)}
                                            />
                                        )}
                                    />
                                    <FieldError msg={errors.billing_value?.message} />
                                </div>

                                <div className="space-y-1">
                                    <label className="block text-xs font-semibold text-muted-foreground">Unit</label>
                                    <div className="relative">
                                        <select {...register("billing_unit")} className={selectCls()}>
                                            <option value="hours">Hours</option>
                                            <option value="days">Days</option>
                                            <option value="months">Months</option>
                                        </select>
                                        <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                                    </div>
                                </div>
                            </div>
                        </section>
                    )}
                </div>
            </div>

            {/* ── Sticky footer action bar ──────────────────────────── */}
            {errors.root && (
                <div className="flex items-center gap-2 rounded-lg px-4 py-3 mt-4 text-sm text-red-300 border border-red-500/20 bg-red-500/8">
                    <AlertTriangle size={14} /> {errors.root.message}
                </div>
            )}

            <div className="fixed flex justify-end w-full z-30 items-center bottom-0 left-0 gap-2 px-6 p-2.5 border-t border-border/50 bg-background">
                <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition-all disabled:opacity-50"
                >
                    {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                    {mode === "create" ? "Create Plan" : "Save Changes"}
                </button>
                <button
                    type="button"
                    onClick={() => router.push("/admin/pricing-plans")}
                    className="px-4 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                >
                    Cancel
                </button>
            </div>
        </form>
    );
}
