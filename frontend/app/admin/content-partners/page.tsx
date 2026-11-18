"use client";

import { useState } from "react";
import { Ban, Check, ChevronDown, Copy, Handshake, History, Pencil, Plus, RefreshCw, Search, UserRoundCheck } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
    createContentPartner,
    getApiErrorMessage,
    listContentPartners,
    updateContentPartner,
    SUPPORTED_CURRENCIES,
    type ContentPartner,
    type ContentPartnerInput,
    listClientPlans,
    listPartnerIngests,
    retryPartnerDelivery,
    retryPartnerIngest,
    takedownPartnerContent,
    getPartnerDeliveryCapabilities,
} from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

const shareSchema = z.string().trim().min(1, "Enter a share between 0% and 100%").refine((value) => {
    const share = Number(value);
    return Number.isFinite(share) && share >= 0 && share <= 100;
}, "Enter a share between 0% and 100%");

const formSchema = z.object({
    name: z.string().trim().min(1), legal_name: z.string(), contact_name: z.string().trim().min(1),
    contact_email: z.string().email(), subscription_share_percent: shareSchema, rental_share_percent: shareSchema,
    ppv_share_percent: shareSchema, settlement_currency: z.string().min(3), invite_account: z.boolean(),
    delivery_enabled: z.boolean(), principal_arn: z.string(), method: z.enum(["direct", "replication"]),
    metadata_format: z.enum(["none", "filmhub_csv_3"]),
    rights_timezone: z.string().min(1), rights_snapshot_confirmed: z.boolean(), auto_publish: z.boolean(),
    subscription_plan_ids: z.array(z.string()),
}).superRefine((value, context) => {
    if (value.delivery_enabled && !/^arn:aws:iam::\d{12}:(root|(user|role)\/[A-Za-z0-9+=,.@_/-]+)$/.test(value.principal_arn.trim())) {
        context.addIssue({ code: "custom", path: ["principal_arn"], message: "Enter a valid AWS IAM principal ARN" });
    }
    if (value.delivery_enabled && value.metadata_format === "filmhub_csv_3" && value.auto_publish && !value.rights_snapshot_confirmed) {
        context.addIssue({ code: "custom", path: ["auto_publish"], message: "Confirm rights snapshots before enabling automatic publication" });
    }
});

type PartnerForm = z.infer<typeof formSchema>;

const EMPTY_FORM: PartnerForm = {
    name: "", legal_name: "", contact_name: "", contact_email: "",
    subscription_share_percent: "", rental_share_percent: "", ppv_share_percent: "", settlement_currency: "USD",
    invite_account: false, delivery_enabled: false, principal_arn: "", method: "direct", metadata_format: "none", rights_timezone: "UTC",
    rights_snapshot_confirmed: false, auto_publish: false, subscription_plan_ids: [],
};

export default function ContentPartnersPage() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const partnersQuery = useQuery({ queryKey: ["content-partners"], queryFn: listContentPartners, refetchInterval: 10000 });
    const partners = partnersQuery.data ?? [];
    const loading = partnersQuery.isLoading;
    const setPartners = (update: (current: ContentPartner[]) => ContentPartner[]) => queryClient.setQueryData<ContentPartner[]>(["content-partners"], (current) => update(current ?? []));
    const [search, setSearch] = useState("");
    const formMethods = useForm<PartnerForm>({ resolver: zodResolver(formSchema), defaultValues: EMPTY_FORM });
    const form = formMethods.watch();
    const setForm = (update: PartnerForm | ((current: PartnerForm) => PartnerForm)) => {
        const next = typeof update === "function" ? update(formMethods.getValues()) : update;
        for (const key of Object.keys(next) as (keyof PartnerForm)[]) formMethods.setValue(key, next[key]);
    };
    const [editing, setEditing] = useState<ContentPartner | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [activeTab, setActiveTab] = useState("partner");
    const [submitting, setSubmitting] = useState(false);
    const [plansOpen, setPlansOpen] = useState(false);
    const deliveryCapabilities = useQuery({ queryKey: ["partner-delivery-capabilities"], queryFn: getPartnerDeliveryCapabilities, enabled: dialogOpen, retry: false });
    const [historyPartner, setHistoryPartner] = useState<ContentPartner | null>(null);
    const [historyPage, setHistoryPage] = useState(1);
    const [takedownPartner, setTakedownPartner] = useState<ContentPartner | null>(null);
    const takedownForm = useForm({ defaultValues: { kind: "movie", sku: "", reason: "" } });
    const historyQuery = useQuery({ queryKey: ["partner-ingests", historyPartner?.id, historyPage], queryFn: () => listPartnerIngests(historyPartner!.id, historyPage), enabled: Boolean(historyPartner), refetchInterval: historyPartner ? 10000 : false });
    const plansQuery = useQuery({ queryKey: ["partner-subscription-plans"], queryFn: () => listClientPlans({ plan_type: "subscription", is_active: true }), enabled: dialogOpen && form.delivery_enabled && form.metadata_format === "filmhub_csv_3" });
    const saveMutation = useMutation({ mutationFn: ({ id, payload }: { id?: string; payload: ContentPartnerInput }) => id ? updateContentPartner(id, payload) : createContentPartner(payload) });
    const deactivateMutation = useMutation({ mutationFn: (id: string) => updateContentPartner(id, { status: "inactive" }) });
    const retryDeliveryMutation = useMutation({ mutationFn: retryPartnerDelivery, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["content-partners"] }), onError: (error) => toast({ title: "Could not retry delivery", description: getApiErrorMessage(error, "Delivery retry failed"), variant: "destructive" }) });
    const retryIngestMutation = useMutation({ mutationFn: ({ partnerId, ingestId }: { partnerId: string; ingestId: string }) => retryPartnerIngest(partnerId, ingestId), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["partner-ingests"] }), onError: (error) => toast({ title: "Could not retry package", description: getApiErrorMessage(error, "Package retry failed"), variant: "destructive" }) });
    const takedownMutation = useMutation({ mutationFn: (payload: { kind: string; sku: string; reason: string }) => takedownPartnerContent(takedownPartner!.id, payload), onSuccess: () => { setTakedownPartner(null); toast({ title: "Content rights revoked" }); }, onError: (error) => toast({ title: "Takedown failed", description: getApiErrorMessage(error, "Content takedown failed"), variant: "destructive" }) });

    const openCreate = () => {
        setEditing(null);
        formMethods.reset(EMPTY_FORM);
        setActiveTab("partner");
        setDialogOpen(true);
    };

    const openEdit = (partner: ContentPartner) => {
        setEditing(partner);
        setActiveTab("partner");
        formMethods.reset({
            ...EMPTY_FORM,
            name: partner.name, legal_name: partner.legal_name ?? "", contact_name: partner.contact_name,
            contact_email: partner.contact_email, subscription_share_percent: String(partner.subscription_share_percent),
            rental_share_percent: String(partner.rental_share_percent), ppv_share_percent: String(partner.ppv_share_percent),
            settlement_currency: partner.settlement_currency,
            delivery_enabled: Boolean(partner.delivery?.enabled), principal_arn: partner.delivery?.principal_arn ?? "",
            method: partner.delivery?.options.method ?? "direct", rights_timezone: partner.delivery?.options.rights_timezone ?? "UTC",
            metadata_format: partner.delivery ? (partner.delivery.options.metadata_format ?? "filmhub_csv_3") : "none",
            rights_snapshot_confirmed: partner.delivery?.options.rights_snapshot_confirmed ?? false,
            auto_publish: partner.delivery?.options.auto_publish ?? false,
            subscription_plan_ids: partner.delivery?.options.subscription_plan_ids ?? [],
        });
        setDialogOpen(true);
    };

    const submit = formMethods.handleSubmit(async (form) => {
        if (form.delivery_enabled && !deliveryCapabilities.data?.enabled) {
            setActiveTab("aws");
            toast({ title: "Delivery provisioning is unavailable on the backend", variant: "destructive" });
            return;
        }
        if (form.delivery_enabled && !deliveryCapabilities.data?.metadata_formats?.includes(form.metadata_format)) {
            setActiveTab("aws");
            toast({ title: "Deploy the updated backend to use this delivery mode", variant: "destructive" });
            return;
        }
        if (form.delivery_enabled && form.metadata_format === "filmhub_csv_3" && !plansQuery.isSuccess) {
            setActiveTab("aws");
            toast({ title: "Could not verify subscription plans", description: "Retry loading plans before saving.", variant: "destructive" });
            return;
        }
        const shares = [form.subscription_share_percent, form.rental_share_percent, form.ppv_share_percent].map(Number);
        if (!form.name.trim() || !form.contact_name.trim() || !form.contact_email.trim() || shares.some((share) => !Number.isFinite(share) || share < 0 || share > 100)) {
            setActiveTab("partner");
            toast({ title: "Enter contact details and shares between 0% and 100%", variant: "destructive" });
            return;
        }
        setSubmitting(true);
        try {
            const payload: ContentPartnerInput = {
                name: form.name.trim(), legal_name: form.legal_name.trim() || undefined, contact_name: form.contact_name.trim(),
                contact_email: form.contact_email.trim(), subscription_share_percent: shares[0], rental_share_percent: shares[1],
                ppv_share_percent: shares[2], settlement_currency: form.settlement_currency.trim().toUpperCase(),
                invite_account: form.invite_account,
                delivery: form.delivery_enabled ? {
                    principal_arn: form.principal_arn.trim(), enabled: true, method: form.method,
                    metadata_format: form.metadata_format,
                    rights_timezone: form.rights_timezone, rights_snapshot_confirmed: form.rights_snapshot_confirmed,
                    auto_publish: form.metadata_format === "filmhub_csv_3" && form.auto_publish, access_type: editing?.delivery?.options.access_type ?? "subscription",
                    subscription_plan_ids: form.metadata_format === "filmhub_csv_3" && plansQuery.data?.length === 0 ? [] : form.subscription_plan_ids,
                } : null,
            };
            const saved = await saveMutation.mutateAsync({ id: editing?.id, payload });
            setPartners((current) => editing ? current.map((partner) => partner.id === saved.id ? saved : partner) : [saved, ...current]);
            setDialogOpen(false);
            toast({ title: editing ? "Content partner updated" : form.invite_account ? "Partner invited" : "Content partner created" });
        } catch (error) {
            toast({ title: "Could not save content partner", description: getApiErrorMessage(error, "Failed to save content partner"), variant: "destructive" });
        } finally {
            setSubmitting(false);
        }
    }, (errors) => {
        const partnerFields: (keyof PartnerForm)[] = ["name", "legal_name", "contact_name", "contact_email", "subscription_share_percent", "rental_share_percent", "ppv_share_percent", "settlement_currency"];
        setActiveTab(partnerFields.some((field) => errors[field]) ? "partner" : "aws");
        toast({ title: "Check partner settings", description: Object.values(errors).find((error) => error?.message)?.message ?? "Complete all required fields", variant: "destructive" });
    });

    const deactivatePartner = async (partner: ContentPartner) => {
        try {
            const saved = await deactivateMutation.mutateAsync(partner.id);
            setPartners((current) => current.map((item) => item.id === saved.id ? saved : item));
        } catch (error) {
            toast({ title: "Could not update partner", description: getApiErrorMessage(error, "Failed to update partner"), variant: "destructive" });
        }
    };

    const visiblePartners = partners.filter((partner) => [partner.name, partner.contact_name, partner.contact_email].join(" ").toLowerCase().includes(search.trim().toLowerCase()));

    return (
        <div className="space-y-6 p-6">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-foreground">Content Partners</h1>
                    <p className="mt-0.5 text-sm text-muted-foreground">Invite rights holders and set their revenue shares.</p>
                </div>
                <Button onClick={openCreate} className="gap-2"><Plus size={16} />Add Partner</Button>
            </div>
            <div className="relative max-w-sm">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search partners" className="h-9 w-full rounded-lg border border-border bg-secondary pl-9 pr-3 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary" />
            </div>
            {partnersQuery.isError && <p role="alert" className="text-sm text-destructive">{getApiErrorMessage(partnersQuery.error, "Could not load content partners")}</p>}
            <div className="overflow-hidden rounded-lg border border-border bg-card">
                <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b border-border bg-muted/30 text-left text-xs text-muted-foreground"><tr>
                    <th className="px-4 py-3 font-medium">Partner</th><th className="px-4 py-3 font-medium">Subscription</th><th className="px-4 py-3 font-medium">Rental</th><th className="px-4 py-3 font-medium">PPV</th><th className="px-4 py-3 font-medium">Account</th><th className="px-4 py-3 font-medium">Delivery</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr></thead><tbody className="divide-y divide-border">
                    {loading && Array.from({ length: 4 }).map((_, index) => <tr key={index}><td className="px-4 py-4"><Skeleton className="h-4 w-40" /></td><td colSpan={6} className="px-4 py-4"><Skeleton className="h-4 w-full" /></td></tr>)}
                    {!loading && visiblePartners.map((partner) => <tr key={partner.id} className="hover:bg-muted/20">
                        <td className="px-4 py-4"><p className="font-medium text-foreground">{partner.name}</p><p className="text-xs text-muted-foreground">{partner.contact_name} · {partner.contact_email}</p></td>
                        <td className="px-4 py-4">{partner.subscription_share_percent}%</td><td className="px-4 py-4">{partner.rental_share_percent}%</td><td className="px-4 py-4">{partner.ppv_share_percent}%</td>
                        <td className="px-4 py-4">{partner.account_invited ? <span className="inline-flex items-center gap-1 text-emerald-600"><UserRoundCheck size={14} /> {partner.status === "pending" ? "Invitation pending" : partner.status === "inactive" ? "Inactive" : "Active"}</span> : "Not created"}</td>
                        <td className="px-4 py-4"><span className={partner.delivery?.error ? "text-destructive" : "capitalize"}>{partner.delivery?.status ?? "Not configured"}</span>{partner.delivery && <><p className="mt-1 max-w-64 break-all font-mono text-xs text-muted-foreground">{partner.delivery.delivery_uri}</p><p className="text-xs text-muted-foreground">{partner.delivery.region}</p>{partner.delivery.error && <p className="mt-1 max-w-64 break-words text-xs text-destructive">{partner.delivery.error}</p>}</>}</td>
                        <td className="px-4 py-4"><Switch checked={partner.status === "active"} disabled={partner.status !== "active" || deactivateMutation.isPending} onCheckedChange={() => void deactivatePartner(partner)} aria-label={`Deactivate ${partner.name}`} /></td>
                        <td className="px-4 py-4"><div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" title="Edit partner" aria-label={`Edit ${partner.name}`} onClick={() => openEdit(partner)}><Pencil size={15} /></Button>
                            {partner.delivery && <>
                                <Button variant="ghost" size="icon" title="Copy delivery URI" aria-label="Copy delivery URI" onClick={() => void navigator.clipboard.writeText(partner.delivery!.delivery_uri).then(() => toast({ title: "Delivery URI copied" })).catch(() => toast({ title: "Clipboard unavailable", variant: "destructive" }))}><Copy size={15} /></Button>
                                <Button variant="ghost" size="icon" title="Package history" aria-label={`Package history for ${partner.name}`} onClick={() => { setHistoryPartner(partner); setHistoryPage(1); }}><History size={15} /></Button>
                                <Button variant="ghost" size="icon" title="Retry provisioning and reconcile" aria-label="Retry delivery provisioning" disabled={retryDeliveryMutation.isPending} onClick={() => retryDeliveryMutation.mutate(partner.id)}><RefreshCw size={15} /></Button>
                                <Button variant="ghost" size="icon" title="Revoke content rights" aria-label="Revoke content rights" onClick={() => { takedownForm.reset({ kind: "movie", sku: "", reason: "" }); setTakedownPartner(partner); }}><Ban size={15} /></Button>
                            </>}
                        </div></td>
                    </tr>)}
                    {!loading && visiblePartners.length === 0 && <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground"><Handshake className="mx-auto mb-2 h-5 w-5" />No content partners found.</td></tr>}
                </tbody></table></div>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><form onSubmit={submit} noValidate className="space-y-4"><DialogHeader><DialogTitle>{editing ? "Edit Content Partner" : "Add Content Partner"}</DialogTitle><DialogDescription>Commercial terms and delivery settings</DialogDescription></DialogHeader>
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList aria-label="Content partner settings" className="grid w-full grid-cols-2"><TabsTrigger value="partner">Partner Details</TabsTrigger><TabsTrigger value="aws">AWS Access</TabsTrigger></TabsList>
                <TabsContent value="partner" className="space-y-4 pt-2">
                <div className="grid gap-3 sm:grid-cols-2"><Field label="Partner Name" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} required /><Field label="Legal Name" value={form.legal_name} onChange={(value) => setForm((current) => ({ ...current, legal_name: value }))} /><Field label="Contact Name" value={form.contact_name} onChange={(value) => setForm((current) => ({ ...current, contact_name: value }))} required /><Field label="Contact Email" type="email" value={form.contact_email} onChange={(value) => setForm((current) => ({ ...current, contact_email: value }))} disabled={Boolean(editing)} required /><Field label="Subscription Share (%)" type="number" value={form.subscription_share_percent} onChange={(value) => setForm((current) => ({ ...current, subscription_share_percent: value }))} required /><Field label="Rental Share (%)" type="number" value={form.rental_share_percent} onChange={(value) => setForm((current) => ({ ...current, rental_share_percent: value }))} required /><Field label="PPV Share (%)" type="number" value={form.ppv_share_percent} onChange={(value) => setForm((current) => ({ ...current, ppv_share_percent: value }))} required /><CurrencyField value={form.settlement_currency} onChange={(value) => setForm((current) => ({ ...current, settlement_currency: value }))} /></div>
                {!editing && <div className="space-y-1"><label className="flex items-center justify-between gap-4 text-sm"><span>Invite partner to the console</span><Switch checked={form.invite_account} onCheckedChange={(value) => formMethods.setValue("invite_account", value)} /></label><p className="text-xs text-muted-foreground">Optional: sends a password setup email for the partner's console account. S3 access is configured separately.</p></div>}
                </TabsContent>
                <TabsContent value="aws" className="space-y-4 pt-2">
                <fieldset className="space-y-4">
                    <label className="flex items-center justify-between gap-4 text-sm"><span>Configure S3 delivery access</span><Switch checked={form.delivery_enabled} onCheckedChange={(value) => formMethods.setValue("delivery_enabled", value)} /></label>
                    {!deliveryCapabilities.isLoading && !deliveryCapabilities.data?.enabled && <p role="status" className="text-xs text-muted-foreground">S3 provisioning is unavailable. The platform operator must deploy and enable delivery provisioning and confirm private source protection before these settings can be saved.</p>}
                    {deliveryCapabilities.data?.enabled && <p className="text-xs text-muted-foreground">Region: {deliveryCapabilities.data.region}</p>}
                    {form.delivery_enabled && <>
                        <Field label="Delivery AWS Principal ARN" value={form.principal_arn} onChange={(value) => formMethods.setValue("principal_arn", value)} required />
                        {formMethods.formState.errors.principal_arn && <p role="alert" className="text-xs text-destructive">{formMethods.formState.errors.principal_arn.message}</p>}
                        <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1.5 text-sm font-medium"><span>Delivery Method</span><select value={form.method} onChange={(event) => formMethods.setValue("method", event.target.value as "direct" | "replication")} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"><option value="direct">Direct upload</option><option value="replication">S3 replication</option></select></label><label className="space-y-1.5 text-sm font-medium"><span>Metadata Import</span><select value={form.metadata_format} onChange={(event) => formMethods.setValue("metadata_format", event.target.value as "none" | "filmhub_csv_3")} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"><option value="none">None (S3 delivery only)</option><option value="filmhub_csv_3">Filmhub CSV 3.0</option></select></label></div>
                        {form.metadata_format === "filmhub_csv_3" && <>
                        <Field label="License Timezone" value={form.rights_timezone} onChange={(value) => formMethods.setValue("rights_timezone", value)} required />
                        <label className="flex items-center justify-between gap-4 text-sm"><span>Complete rights snapshots and inclusive end dates confirmed</span><Switch checked={form.rights_snapshot_confirmed} onCheckedChange={(value) => formMethods.setValue("rights_snapshot_confirmed", value)} /></label>
                        {plansQuery.isLoading && <Skeleton className="h-10 w-full" />}
                        {!!plansQuery.data?.length && <div className="space-y-1.5 text-sm font-medium"><span id="partner-plans-label">Subscription Plans</span><Popover open={plansOpen} onOpenChange={setPlansOpen}><PopoverTrigger asChild><button type="button" role="combobox" aria-labelledby="partner-plans-label" aria-expanded={plansOpen} className="flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 py-2 text-left text-sm"><span className="min-w-0 break-words">{form.subscription_plan_ids.length ? plansQuery.data.filter((plan) => form.subscription_plan_ids.includes(plan.id)).map((plan) => plan.name).join(", ") || `${form.subscription_plan_ids.length} selected` : "All subscription plans"}</span><ChevronDown size={14} className="shrink-0" /></button></PopoverTrigger><PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-0"><Command><CommandInput placeholder="Search subscription plans..." aria-label="Search subscription plans" /><CommandList className="max-h-64"><CommandEmpty>No plans found.</CommandEmpty><CommandGroup>{plansQuery.data.map((plan) => <CommandItem key={plan.id} value={plan.id} keywords={[plan.name]} onSelect={() => formMethods.setValue("subscription_plan_ids", form.subscription_plan_ids.includes(plan.id) ? form.subscription_plan_ids.filter((id) => id !== plan.id) : [...form.subscription_plan_ids, plan.id])}><Check size={14} className={form.subscription_plan_ids.includes(plan.id) ? "opacity-100" : "opacity-0"} /><span className="min-w-0 break-words">{plan.name}</span></CommandItem>)}</CommandGroup></CommandList></Command></PopoverContent></Popover></div>}
                        {plansQuery.isError && <div role="alert" className="flex items-center gap-2 text-xs text-destructive"><span>Could not load subscription plans.</span><Button type="button" variant="outline" size="sm" onClick={() => void plansQuery.refetch()}>Retry</Button></div>}
                        <label className="flex items-center justify-between gap-4 text-sm"><span>Publish subscription titles automatically after validation</span><Switch checked={form.auto_publish} onCheckedChange={(value) => formMethods.setValue("auto_publish", value)} /></label>
                        {formMethods.formState.errors.auto_publish && <p role="alert" className="text-xs text-destructive">{formMethods.formState.errors.auto_publish.message}</p>}
                        </>}
                    </>}
                </fieldset>
                </TabsContent>
                </Tabs>
                <DialogFooter><Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button type="submit" disabled={submitting}>{submitting ? "Saving..." : editing ? "Save Changes" : "Add Partner"}</Button></DialogFooter>
            </form></DialogContent></Dialog>
            <Dialog open={Boolean(historyPartner)} onOpenChange={(open) => { if (!open) setHistoryPartner(null); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>{historyPartner?.name}: Delivery History</DialogTitle><DialogDescription>Metadata packages</DialogDescription></DialogHeader>
                {historyQuery.isLoading && <Skeleton className="h-24 w-full" />}
                {historyQuery.isError && <p role="alert" className="text-sm text-destructive">Could not load delivery history.</p>}
                {!historyQuery.isLoading && !historyQuery.isError && !historyQuery.data?.length && <p className="py-6 text-sm text-muted-foreground">No packages received.</p>}
                <div className="divide-y divide-border">{historyQuery.data?.map((ingest) => <div key={ingest.id} className="space-y-1 py-3 text-sm">
                    <div className="flex items-start justify-between gap-3"><p className="min-w-0 break-all font-mono text-xs">{ingest.metadata_key}</p><span className="shrink-0 capitalize">{ingest.status === "complete" ? "Metadata imported" : ingest.status}</span></div>
                    <p className="text-xs text-muted-foreground">{new Date(ingest.created_at).toLocaleString()} · {ingest.summary.entities ?? 0} titles · {ingest.summary.assets ?? 0} assets · {ingest.attempts} retries</p>
                    {!!ingest.summary.media?.length && <p className="text-xs">Media: {ingest.summary.media.filter((item) => item.status === "complete").length}/{ingest.summary.media.length} ready{ingest.summary.media.some((item) => item.status === "failed") && <span className="text-destructive"> · Failed</span>}</p>}
                    {ingest.summary.media?.filter((item) => item.error).map((item, index) => <p key={index} className="break-words text-xs text-destructive">{item.error}</p>)}
                    {ingest.error && <p className="break-words text-destructive">{ingest.error}</p>}{ingest.summary.skipped && <p>{ingest.summary.skipped}</p>}
                    {ingest.summary.warnings?.map((warning) => <p key={warning} className="text-xs text-amber-600">{warning}</p>)}
                    {(["failed", "retry"].includes(ingest.status) || ingest.summary.media?.some((item) => item.status === "failed")) && <Button variant="outline" size="sm" disabled={retryIngestMutation.isPending} onClick={() => retryIngestMutation.mutate({ partnerId: historyPartner!.id, ingestId: ingest.id })}><RefreshCw size={14} className="mr-2" />{ingest.status === "complete" ? "Retry Media" : "Retry Package"}</Button>}
                </div>)}</div>
                <DialogFooter><Button variant="outline" disabled={historyPage === 1} onClick={() => setHistoryPage((page) => page - 1)}>Previous</Button><Button variant="outline" disabled={(historyQuery.data?.length ?? 0) < 25} onClick={() => setHistoryPage((page) => page + 1)}>Next</Button></DialogFooter>
            </DialogContent></Dialog>
            <Dialog open={Boolean(takedownPartner)} onOpenChange={(open) => { if (!open) setTakedownPartner(null); }}><DialogContent><form className="space-y-4" onSubmit={takedownForm.handleSubmit((payload) => takedownMutation.mutate(payload))}><DialogHeader><DialogTitle>Revoke Content Rights</DialogTitle><DialogDescription>{takedownPartner?.name}</DialogDescription></DialogHeader><label className="block space-y-1.5 text-sm"><span>Content Type</span><select {...takedownForm.register("kind")} className="h-10 w-full rounded-lg border border-input bg-background px-3">{["movie", "series", "season", "episode"].map((kind) => <option key={kind} value={kind}>{kind}</option>)}</select></label><label className="block space-y-1.5 text-sm"><span>Provider SKU</span><input {...takedownForm.register("sku", { required: true })} required maxLength={255} className="h-10 w-full rounded-lg border border-input bg-background px-3" /></label><label className="block space-y-1.5 text-sm"><span>Reason</span><textarea {...takedownForm.register("reason", { required: true })} required maxLength={1000} className="min-h-24 w-full rounded-lg border border-input bg-background p-3" /></label><DialogFooter><Button type="button" variant="outline" onClick={() => setTakedownPartner(null)}>Cancel</Button><Button type="submit" variant="destructive" disabled={takedownMutation.isPending}><Ban size={15} className="mr-2" />Revoke Rights</Button></DialogFooter></form></DialogContent></Dialog>
        </div>
    );
}

function Field({ label, value, onChange, type = "text", disabled = false, required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; disabled?: boolean; required?: boolean }) {
    return <label className="space-y-1.5 text-sm font-medium"><span>{label}</span><input type={type} min={type === "number" ? "0" : undefined} max={type === "number" ? "100" : undefined} step={type === "number" ? "0.01" : undefined} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} required={required} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60" /></label>;
}

function CurrencyField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
    return <label className="space-y-1.5 text-sm font-medium"><span>Settlement Currency</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"><option value="" disabled>Select currency</option>{SUPPORTED_CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></label>;
}