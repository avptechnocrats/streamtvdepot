"use client";

import { FormEvent, useEffect, useState } from "react";
import { Handshake, Pencil, Plus, Search, UserRoundCheck } from "lucide-react";
import {
    createContentPartner,
    getApiErrorMessage,
    listContentPartners,
    updateContentPartner,
    SUPPORTED_CURRENCIES,
    type ContentPartner,
} from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

type PartnerForm = {
    name: string;
    legal_name: string;
    contact_name: string;
    contact_email: string;
    subscription_share_percent: string;
    rental_share_percent: string;
    ppv_share_percent: string;
    settlement_currency: string;
};

const EMPTY_FORM: PartnerForm = {
    name: "", legal_name: "", contact_name: "", contact_email: "",
    subscription_share_percent: "", rental_share_percent: "", ppv_share_percent: "", settlement_currency: "USD",
};

export default function ContentPartnersPage() {
    const { toast } = useToast();
    const [partners, setPartners] = useState<ContentPartner[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [form, setForm] = useState<PartnerForm>(EMPTY_FORM);
    const [editing, setEditing] = useState<ContentPartner | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const loadPartners = async () => {
        setLoading(true);
        try {
            setPartners(await listContentPartners());
        } catch (error) {
            toast({ title: "Could not load content partners", description: getApiErrorMessage(error, "Failed to load content partners"), variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void loadPartners(); }, []);

    const openCreate = () => {
        setEditing(null);
        setForm(EMPTY_FORM);
        setDialogOpen(true);
    };

    const openEdit = (partner: ContentPartner) => {
        setEditing(partner);
        setForm({
            name: partner.name, legal_name: partner.legal_name ?? "", contact_name: partner.contact_name,
            contact_email: partner.contact_email, subscription_share_percent: String(partner.subscription_share_percent),
            rental_share_percent: String(partner.rental_share_percent), ppv_share_percent: String(partner.ppv_share_percent),
            settlement_currency: partner.settlement_currency,
        });
        setDialogOpen(true);
    };

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const shares = [form.subscription_share_percent, form.rental_share_percent, form.ppv_share_percent].map(Number);
        if (!form.name.trim() || !form.contact_name.trim() || !form.contact_email.trim() || shares.some((share) => !Number.isFinite(share) || share < 0 || share > 100)) {
            toast({ title: "Enter contact details and shares between 0% and 100%", variant: "destructive" });
            return;
        }
        setSubmitting(true);
        try {
            const payload = {
                name: form.name.trim(), legal_name: form.legal_name.trim() || undefined, contact_name: form.contact_name.trim(),
                contact_email: form.contact_email.trim(), subscription_share_percent: shares[0], rental_share_percent: shares[1],
                ppv_share_percent: shares[2], settlement_currency: form.settlement_currency.trim().toUpperCase(),
            };
            const saved = editing
                ? await updateContentPartner(editing.id, {
                    name: payload.name,
                    legal_name: payload.legal_name,
                    contact_name: payload.contact_name,
                    subscription_share_percent: payload.subscription_share_percent,
                    rental_share_percent: payload.rental_share_percent,
                    ppv_share_percent: payload.ppv_share_percent,
                    settlement_currency: payload.settlement_currency,
                })
                : await createContentPartner(payload);
            setPartners((current) => editing ? current.map((partner) => partner.id === saved.id ? saved : partner) : [saved, ...current]);
            setDialogOpen(false);
            toast({ title: editing ? "Content partner updated" : "Partner invited", description: editing ? undefined : "The partner can set a password from their invitation email." });
        } catch (error) {
            toast({ title: "Could not save content partner", description: getApiErrorMessage(error, "Failed to save content partner"), variant: "destructive" });
        } finally {
            setSubmitting(false);
        }
    };

    const deactivatePartner = async (partner: ContentPartner) => {
        try {
            const saved = await updateContentPartner(partner.id, { status: "inactive" });
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
            <div className="overflow-hidden rounded-lg border border-border bg-card">
                <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b border-border bg-muted/30 text-left text-xs text-muted-foreground"><tr>
                    <th className="px-4 py-3 font-medium">Partner</th><th className="px-4 py-3 font-medium">Subscription</th><th className="px-4 py-3 font-medium">Rental</th><th className="px-4 py-3 font-medium">PPV</th><th className="px-4 py-3 font-medium">Account</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr></thead><tbody className="divide-y divide-border">
                    {loading && Array.from({ length: 4 }).map((_, index) => <tr key={index}><td className="px-4 py-4"><Skeleton className="h-4 w-40" /></td><td colSpan={6} className="px-4 py-4"><Skeleton className="h-4 w-full" /></td></tr>)}
                    {!loading && visiblePartners.map((partner) => <tr key={partner.id} className="hover:bg-muted/20"><td className="px-4 py-4"><p className="font-medium text-foreground">{partner.name}</p><p className="text-xs text-muted-foreground">{partner.contact_name} · {partner.contact_email}</p></td><td className="px-4 py-4">{partner.subscription_share_percent}%</td><td className="px-4 py-4">{partner.rental_share_percent}%</td><td className="px-4 py-4">{partner.ppv_share_percent}%</td><td className="px-4 py-4">{partner.account_invited ? <span className="inline-flex items-center gap-1 text-emerald-600"><UserRoundCheck size={14} /> {partner.status === "pending" ? "Invitation pending" : "Active"}</span> : "Not created"}</td><td className="px-4 py-4"><Switch checked={partner.status === "active"} disabled={partner.status !== "active"} onCheckedChange={() => void deactivatePartner(partner)} aria-label={`Deactivate ${partner.name}`} /></td><td className="px-4 py-4 text-right"><button onClick={() => openEdit(partner)} title="Edit partner" className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil size={15} /></button></td></tr>)}
                    {!loading && visiblePartners.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground"><Handshake className="mx-auto mb-2 h-5 w-5" />No content partners found.</td></tr>}
                </tbody></table></div>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent><form onSubmit={submit} className="space-y-4"><DialogHeader><DialogTitle>{editing ? "Edit Content Partner" : "Add Content Partner"}</DialogTitle><DialogDescription>{editing ? "Update the commercial terms for this partner." : "An upload-only account invitation will be sent to this contact."}</DialogDescription></DialogHeader>
                <div className="grid gap-3 sm:grid-cols-2"><Field label="Partner Name" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} required /><Field label="Legal Name" value={form.legal_name} onChange={(value) => setForm((current) => ({ ...current, legal_name: value }))} /><Field label="Contact Name" value={form.contact_name} onChange={(value) => setForm((current) => ({ ...current, contact_name: value }))} required /><Field label="Contact Email" type="email" value={form.contact_email} onChange={(value) => setForm((current) => ({ ...current, contact_email: value }))} disabled={Boolean(editing)} required /><Field label="Subscription Share (%)" type="number" value={form.subscription_share_percent} onChange={(value) => setForm((current) => ({ ...current, subscription_share_percent: value }))} required /><Field label="Rental Share (%)" type="number" value={form.rental_share_percent} onChange={(value) => setForm((current) => ({ ...current, rental_share_percent: value }))} required /><Field label="PPV Share (%)" type="number" value={form.ppv_share_percent} onChange={(value) => setForm((current) => ({ ...current, ppv_share_percent: value }))} required /><CurrencyField value={form.settlement_currency} onChange={(value) => setForm((current) => ({ ...current, settlement_currency: value }))} /></div>
                <DialogFooter><Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button type="submit" disabled={submitting}>{submitting ? "Saving..." : editing ? "Save Changes" : "Invite Partner"}</Button></DialogFooter>
            </form></DialogContent></Dialog>
        </div>
    );
}

function Field({ label, value, onChange, type = "text", disabled = false, required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; disabled?: boolean; required?: boolean }) {
    return <label className="space-y-1.5 text-sm font-medium"><span>{label}</span><input type={type} min={type === "number" ? "0" : undefined} max={type === "number" ? "100" : undefined} step={type === "number" ? "0.01" : undefined} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} required={required} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60" /></label>;
}

function CurrencyField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
    return <label className="space-y-1.5 text-sm font-medium"><span>Settlement Currency</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"><option value="" disabled>Select currency</option>{SUPPORTED_CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></label>;
}