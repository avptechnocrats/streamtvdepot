"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
    createAdvertisement,
    updateAdvertisement,
    type AdvertisementOut,
    type AdvertisementCreate,
    type AdvertisementUpdate,
    type AdType,
    type AdStatus,
} from "@/lib/api";
import { AD_TYPE_META, PLACEMENT_TYPE_META } from "@/lib/ad-format";
import { useToast } from "@/hooks/use-toast";

const AD_TYPES = Object.keys(AD_TYPE_META) as AdType[];
const AD_STATUSES: AdStatus[] = ["draft", "active", "paused", "expired"];

function inputCls() {
    return "w-full h-9 rounded-lg bg-secondary border border-border px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary";
}

function selectCls() {
    return "w-full h-9 rounded-lg bg-secondary border border-border px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary";
}

type AdForm = {
    title: string;
    description: string;
    ad_type: AdType;
    media_url: string;
    click_through_url: string;
    duration_seconds: string;
    /** datetime-local value: "YYYY-MM-DDTHH:MM" — treated as UTC on submit */
    starts_at: string;
    ends_at: string;
    budget: string;
    cost_per_impression: string;
    cost_per_click: string;
    is_skippable: boolean;
    status: AdStatus;
};

const EMPTY_FORM: AdForm = {
    title: "",
    description: "",
    ad_type: "video",
    media_url: "",
    click_through_url: "",
    duration_seconds: "",
    starts_at: "",
    ends_at: "",
    budget: "",
    cost_per_impression: "",
    cost_per_click: "",
    is_skippable: true,
    status: "draft",
};

/** "YYYY-MM-DDTHH:MM" → "YYYY-MM-DDTHH:MM:00Z" (UTC) for the backend */
function toIso(local: string): string | null {
    return local ? `${local}:00Z` : null;
}

/** ISO datetime from API → "YYYY-MM-DDTHH:MM" for datetime-local input */
function toLocal(iso: string | null | undefined): string {
    if (!iso) return "";
    return iso.replace(/(\.[\d]+)?(Z|[+-]\d{2}:\d{2})$/, "").slice(0, 16);
}

function toCreatePayload(form: AdForm): AdvertisementCreate {
    return {
        title: form.title.trim(),
        description: form.description.trim() || null,
        ad_type: form.ad_type,
        media_url: form.media_url.trim() || null,
        click_through_url: form.click_through_url.trim() || null,
        duration_seconds: form.duration_seconds === "" ? null : Number(form.duration_seconds),
        starts_at: toIso(form.starts_at),
        ends_at: toIso(form.ends_at),
        budget: form.budget === "" ? null : Number(form.budget),
        cost_per_impression: form.cost_per_impression === "" ? null : Number(form.cost_per_impression),
        cost_per_click: form.cost_per_click === "" ? null : Number(form.cost_per_click),
        is_skippable: form.is_skippable,
    };
}

function toUpdatePayload(form: AdForm): AdvertisementUpdate {
    return {
        ...toCreatePayload(form),
        status: form.status,
    };
}

function fromAd(ad: AdvertisementOut): AdForm {
    return {
        title: ad.title,
        description: ad.description ?? "",
        ad_type: ad.ad_type,
        media_url: ad.media_url ?? "",
        click_through_url: ad.click_through_url ?? "",
        duration_seconds: ad.duration_seconds == null ? "" : String(ad.duration_seconds),
        starts_at: toLocal(ad.starts_at),
        ends_at: toLocal(ad.ends_at),
        budget: ad.budget == null ? "" : String(ad.budget),
        cost_per_impression: ad.cost_per_impression == null ? "" : String(ad.cost_per_impression),
        cost_per_click: ad.cost_per_click == null ? "" : String(ad.cost_per_click),
        is_skippable: ad.is_skippable,
        status: ad.status,
    };
}

interface AdvertisementFormProps {
    mode: "create" | "edit";
    initialData?: AdvertisementOut;
}

export function AdvertisementForm({ mode, initialData }: AdvertisementFormProps) {
    const router = useRouter();
    const [form, setForm] = useState<AdForm>(initialData ? fromAd(initialData) : EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const { toast } = useToast();

    const onSubmit = async () => {
        if (!form.title.trim()) {
            toast({ title: "Title is required", variant: "destructive" });
            return;
        }
        if (form.duration_seconds !== "" && Number(form.duration_seconds) < 1) {
            toast({ title: "Duration must be at least 1 second", variant: "destructive" });
            return;
        }

        setSaving(true);
        try {
            if (mode === "edit" && initialData) {
                await updateAdvertisement(initialData.id, toUpdatePayload(form));
                toast({ title: "Advertisement Updated", description: "Advertisement was updated successfully.", variant: "success" });
            } else {
                await createAdvertisement(toCreatePayload(form));
                toast({ title: "Advertisement Created", description: "Advertisement was created successfully.", variant: "success" });
            }
            router.push("/admin/advertisements");
            router.refresh();
        } catch (err) {
            toast({ title: "Save failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
                {mode === "edit" ? "Edit Advertisement" : "Create Advertisement"}
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Creative</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-muted-foreground">Title</label>
                            <input className={inputCls()} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-muted-foreground">Ad Type</label>
                            <select className={selectCls()} value={form.ad_type} onChange={(e) => setForm((f) => ({ ...f, ad_type: e.target.value as AdType }))}>
                                {AD_TYPES.map((t) => <option key={t} value={t}>{AD_TYPE_META[t].label}</option>)}
                            </select>
                            <p className="text-[11px] text-muted-foreground/80 leading-snug">
                                {AD_TYPE_META[form.ad_type].description}
                                {" "}Placements: {AD_TYPE_META[form.ad_type].placements.map((p) => PLACEMENT_TYPE_META[p].label).join(", ")}.
                            </p>
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                            <label className="text-xs font-semibold text-muted-foreground">Description</label>
                            <input className={inputCls()} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                            <label className="text-xs font-semibold text-muted-foreground">Media URL</label>
                            <input className={inputCls()} placeholder="https://..." value={form.media_url} onChange={(e) => setForm((f) => ({ ...f, media_url: e.target.value }))} />
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                            <label className="text-xs font-semibold text-muted-foreground">Click-through URL</label>
                            <input className={inputCls()} placeholder="https://..." value={form.click_through_url} onChange={(e) => setForm((f) => ({ ...f, click_through_url: e.target.value }))} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-muted-foreground">Duration (seconds)</label>
                            <input type="number" min={1} className={inputCls()} value={form.duration_seconds} onChange={(e) => setForm((f) => ({ ...f, duration_seconds: e.target.value }))} />
                        </div>
                        <div className="flex items-center gap-2 pt-6">
                            <input id="is-skippable" type="checkbox" checked={form.is_skippable} onChange={(e) => setForm((f) => ({ ...f, is_skippable: e.target.checked }))} />
                            <label htmlFor="is-skippable" className="text-sm text-foreground">Skippable</label>
                        </div>
                    </div>
                </div>

                <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Delivery &amp; Budget</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1 sm:col-span-2">
                            <label className="text-xs font-semibold text-muted-foreground">Status</label>
                            <select className={selectCls()} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as AdStatus }))}>
                                {AD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-muted-foreground">Starts At <span className="font-normal opacity-60">(UTC)</span></label>
                            <input type="datetime-local" className={inputCls()} value={form.starts_at} onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-muted-foreground">Ends At <span className="font-normal opacity-60">(UTC)</span></label>
                            <input type="datetime-local" className={inputCls()} value={form.ends_at} onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))} />
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                            <label className="text-xs font-semibold text-muted-foreground">Budget</label>
                            <input type="number" min={0} step="0.01" className={inputCls()} value={form.budget} onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-muted-foreground">CPI</label>
                            <input type="number" min={0} step="0.0001" className={inputCls()} value={form.cost_per_impression} onChange={(e) => setForm((f) => ({ ...f, cost_per_impression: e.target.value }))} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-muted-foreground">CPC</label>
                            <input type="number" min={0} step="0.0001" className={inputCls()} value={form.cost_per_click} onChange={(e) => setForm((f) => ({ ...f, cost_per_click: e.target.value }))} />
                        </div>
                    </div>
                </div>
            </div>
            <div className="flex gap-2">
                <button
                    type="button"
                    disabled={saving}
                    onClick={onSubmit}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 disabled:opacity-60"
                >
                    {saving ? "Saving..." : mode === "edit" ? "Update" : "Create"}
                </button>
                <button
                    type="button"
                    onClick={() => router.push("/admin/advertisements")}
                    className="px-4 py-2 rounded-lg border border-border text-sm text-foreground"
                >
                    Cancel
                </button>
            </div>
        </section>
    );
}
