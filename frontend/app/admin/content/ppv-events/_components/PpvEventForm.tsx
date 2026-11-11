"use client";

import S3ImageField from "@/components/content/ContentImageField";
import { useEffect, useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Eye, Globe, Loader2, AlertTriangle, CheckCircle2, Radio, Users } from "lucide-react";
import { LabeledSwitch } from "@/components/ui/labeled-switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { createPpvEvent, updatePpvEvent, type PpvEventOut, type PpvEventCreate, PPV_EVENT_SOURCES, listCategories, listClientPlans, type CategoryOut, type ClientPricingPlanOut } from "@/lib/api";
import { slugify } from "../../videos/_components/utils";

import { AiWriteButton } from "@/components/AiWriteButton";
import ContentTagPicker from "@/components/content/ContentTagPicker";

// ─── Schema ───────────────────────────────────────────────────────────────────

const schema = z.object({
    title: z.string().min(1, "Title is required"),
    scheduled_at: z.string().min(1, "Event start date and time are required").refine(
        (value) => Number.isFinite(new Date(value).getTime()), "Enter a valid start date and time",
    ),
    time_zone: z.string().min(1, "Select a timezone"),
    slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Only lowercase, numbers, hyphens"),
    description: z.string().optional(),
    category: z.string().optional(),
    tags: z.array(z.string()),
    source: z.enum(["rtmp", "external"], { required_error: "Source is required" }),
    stream_url: z.string().optional(),
    banner: z.string().optional(),
    portrait: z.string().optional(),
    wide: z.string().optional(),
    geo_fencing: z.object({ blocked_countries: z.array(z.string()) }),
    pricing_plan_id: z.string().nullable().refine((value) => Boolean(value), "Select a PPV pricing plan"),
    is_active: z.boolean(),
}).refine((data) => data.source !== "external" || /^https:\/\/.+\.m3u8(?:[?#].*)?$/i.test(data.stream_url?.trim() ?? ""), {
    message: "Enter a secure HTTPS HLS (.m3u8) URL",
    path: ["stream_url"],
}).superRefine((data, context) => {
    if (!data.scheduled_at) return;
    try {
        const instant = fromZonedTime(data.scheduled_at, data.time_zone);
        if (formatInTimeZone(instant, data.time_zone, "yyyy-MM-dd'T'HH:mm") !== data.scheduled_at) {
            context.addIssue({ code: z.ZodIssueCode.custom, path: ["scheduled_at"], message: "This time does not exist in the selected timezone" });
        }
    } catch {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["scheduled_at"], message: "Enter a valid time and timezone" });
    }
});

type FormValues = z.infer<typeof schema>;

// ─── Shared UI helpers ────────────────────────────────────────────────────────

function inputCls(hasError = false) {
    return `w-full h-9 rounded-lg bg-background border ${hasError ? "border-red-500/60" : "border-input"} px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors`;
}

function selectCls(hasError = false) {
    return `w-full h-9 rounded-lg bg-background border ${hasError ? "border-red-500/60" : "border-input"} px-3 pr-8 text-sm text-foreground appearance-none focus:outline-none focus:ring-1 focus:ring-primary transition-colors`;
}

function textareaCls() {
    return `w-full rounded-lg bg-background border border-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none`;
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
        <details className="group rounded-lg border border-input bg-background">
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

// ─── Converter (used by edit page) ───────────────────────────────────────────

export function ppvEventToFormValues(event: PpvEventOut): FormValues {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const start = event.scheduled_at ? new Date(event.scheduled_at) : null;
    const localStart = start && Number.isFinite(start.getTime())
        ? formatInTimeZone(start, timeZone, "yyyy-MM-dd'T'HH:mm")
        : "";
    return {
        title: event.title,
        scheduled_at: localStart,
        time_zone: timeZone,
        slug: event.slug,
        description: event.description ?? "",
        category: event.category ?? "",
        tags: event.tags ?? [],
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
    scheduled_at: "",
    time_zone: "UTC",
    slug: "",
    description: "",
    category: "",
    tags: [],
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
    const [timeZones, setTimeZones] = useState<string[]>(["UTC"]);
    const [timeZoneOpen, setTimeZoneOpen] = useState(false);
    const [accessTab, setAccessTab] = useState("access");

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

    useEffect(() => {
        const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const zones = Intl.supportedValuesOf("timeZone");
        setTimeZones(Array.from(new Set(["UTC", detected, defaultValues?.time_zone ?? detected, ...zones])).sort());
        if (!defaultValues) setValue("time_zone", detected);
    }, [defaultValues, setValue]);

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
            scheduled_at: fromZonedTime(data.scheduled_at, data.time_zone).toISOString(),
            slug: data.slug,
            description: data.description || null,
            category: data.category || null,
            tags: data.tags,
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
        <form onSubmit={handleSubmit(onSubmit, (validation) => { if (validation.pricing_plan_id) setAccessTab("access"); })} className="w-full">
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start mb-14">

                {/* ══════════════ LEFT COLUMN ══════════════ */}
                <div className="min-w-0 space-y-6 xl:col-span-2">

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
                        <Controller name="tags" control={control} render={({ field }) => (
                            <ContentTagPicker selected={field.value ?? []} onChange={field.onChange} />
                        )} />
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
                        <div className="border-t border-border pt-4 space-y-4">
                            <SectionHeading>Event Schedule</SectionHeading>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="min-w-0 space-y-1">
                                <label htmlFor="event-start" className="block text-xs font-semibold text-muted-foreground">
                                    Start Date &amp; Time *
                                </label>
                                <input id="event-start" type="datetime-local" {...register("scheduled_at")} className={inputCls(!!errors.scheduled_at)} />
                                <FieldError msg={errors.scheduled_at?.message} />
                            </div>
                            <div className="min-w-0 space-y-1">
                                <label htmlFor="event-timezone" className="block text-xs font-semibold text-muted-foreground">Timezone *</label>
                                <Controller name="time_zone" control={control} render={({ field }) => (
                                    <Popover open={timeZoneOpen} onOpenChange={(open) => { setTimeZoneOpen(open); if (!open) field.onBlur(); }}>
                                        <PopoverTrigger asChild>
                                            <button ref={field.ref} id="event-timezone" type="button" role="combobox" aria-label="Timezone" aria-expanded={timeZoneOpen} aria-invalid={!!errors.time_zone} className={`${inputCls(!!errors.time_zone)} flex items-center justify-between gap-2 text-left`}>
                                                <span className="truncate">{field.value.replaceAll("_", " ")}</span>
                                                <ChevronDown size={13} className="shrink-0 text-muted-foreground" />
                                            </button>
                                        </PopoverTrigger>
                                        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-0">
                                            <Command filter={(value, search) => value.replaceAll("_", " ").toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0}>
                                                <CommandInput placeholder="Search timezones..." aria-label="Search timezones" />
                                                <CommandList className="max-h-64">
                                                    <CommandEmpty>No timezone found.</CommandEmpty>
                                                    <CommandGroup>
                                                        {timeZones.map((zone) => <CommandItem key={zone} value={zone} keywords={[zone.replaceAll("_", " ")]} onSelect={() => { field.onChange(zone); setTimeZoneOpen(false); field.onBlur(); }}>
                                                            <Check size={14} className={`shrink-0 ${field.value === zone ? "opacity-100" : "opacity-0"}`} />
                                                            <span className="truncate">{zone.replaceAll("_", " ")}</span>
                                                        </CommandItem>)}
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                )} />
                                <FieldError msg={errors.time_zone?.message} />
                            </div>
                            </div>
                        </div>
                    </section>

                    <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
                        <SectionHeading><Globe size={14} className="inline mr-1 -mt-0.5" />Geo Fencing</SectionHeading>
                        <div className="space-y-2">
                            <label className="block text-xs font-semibold text-red-400/80">Blocked Countries</label>
                            <CountryPicker selected={blockedCountries} onChange={(countries) => setValue("geo_fencing.blocked_countries", countries)} />
                        </div>
                        <p className="text-[11px] text-muted-foreground">Leave empty for worldwide access.</p>
                    </section>

                    <section className="rounded-2xl border border-border bg-card p-6">
                        <Tabs value={accessTab} onValueChange={setAccessTab}>
                            <TabsList aria-label="Event access settings" className="mb-4 grid w-full grid-cols-2 sm:w-fit">
                                <TabsTrigger value="access" className="gap-2"><Users size={14} />User Access</TabsTrigger>
                                <TabsTrigger value="visibility" className="gap-2"><Eye size={14} />Visibility</TabsTrigger>
                            </TabsList>
                        <TabsContent value="access" className="space-y-4">
                            <FieldError msg={errors.pricing_plan_id?.message} />
                            {plans.length ? (
                                <div className="space-y-1.5">
                                    <label className="block text-xs font-semibold text-muted-foreground">PPV Plan</label>
                                    {plans.map((plan) => (
                                        <label key={plan.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-input bg-background p-2.5 transition-colors hover:border-primary/40">
                                            <input type="radio" name="pricing_plan_id" checked={selectedPlanId === plan.id} onChange={() => setValue("pricing_plan_id", plan.id)} className="h-3.5 w-3.5 accent-primary" />
                                            <span className="min-w-0"><span className="block truncate text-xs font-medium text-foreground">{plan.name}</span><span className="text-[11px] text-muted-foreground">{plan.currency} {plan.price}</span></span>
                                        </label>
                                    ))}
                                    <button type="button" onClick={() => setValue("pricing_plan_id", null)} className="text-[11px] text-muted-foreground hover:text-foreground">Clear selection</button>
                                </div>
                            ) : <p className="text-xs text-muted-foreground">No active PPV pricing plans are available.</p>}
                        </TabsContent>
                        <TabsContent value="visibility" className="space-y-4">
                            <Controller name="is_active" control={control} render={({ field }) => <LabeledSwitch checked={field.value} onCheckedChange={field.onChange} label="Visible to viewers" description="Turn off to hide this event from your storefront." />} />
                        </TabsContent>
                        </Tabs>
                    </section>

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
