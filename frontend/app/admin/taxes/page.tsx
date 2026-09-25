"use client";

import { FormEvent, useEffect, useState } from "react";
import { AlertTriangle, Pencil, Plus, Search, Trash2 } from "lucide-react";
import {
    createTax,
    deleteTax,
    getApiErrorMessage,
    listTaxes,
    updateTax,
    type ClientTax,
} from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

type TaxForm = {
    name: string;
    tax_type: "percentage" | "flat";
    percentage: string;
    flat_amount: string;
};

const emptyForm: TaxForm = { name: "", tax_type: "percentage", percentage: "", flat_amount: "" };

export default function TaxesPage() {
    const { toast } = useToast();
    const [taxes, setTaxes] = useState<ClientTax[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingTax, setEditingTax] = useState<ClientTax | null>(null);
    const [taxToDelete, setTaxToDelete] = useState<ClientTax | null>(null);
    const [form, setForm] = useState<TaxForm>(emptyForm);
    const [submitting, setSubmitting] = useState(false);

    const loadTaxes = async () => {
        setLoading(true);
        try {
            setTaxes(await listTaxes());
        } catch (error) {
            toast({ title: "Could not load taxes", description: getApiErrorMessage(error, "Failed to load taxes"), variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadTaxes();
    }, []);

    const openCreate = () => {
        setEditingTax(null);
        setForm(emptyForm);
        setDialogOpen(true);
    };

    const openEdit = (tax: ClientTax) => {
        setEditingTax(tax);
        setForm({
            name: tax.name,
            tax_type: tax.tax_type,
            percentage: tax.tax_type === "percentage" ? String(tax.percentage) : "",
            flat_amount: tax.tax_type === "flat" ? String(tax.flat_amount ?? "") : "",
        });
        setDialogOpen(true);
    };

    const saveTax = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const value = Number(form.tax_type === "percentage" ? form.percentage : form.flat_amount);
        if (!form.name.trim() || !Number.isFinite(value) || value <= 0 || (form.tax_type === "percentage" && value > 100)) {
            toast({ title: form.tax_type === "percentage" ? "Enter a tax name and percentage between 0 and 100" : "Enter a tax name and flat amount greater than 0", variant: "destructive" });
            return;
        }
        const payload = form.tax_type === "percentage"
            ? { name: form.name.trim(), tax_type: "percentage" as const, percentage: value }
            : { name: form.name.trim(), tax_type: "flat" as const, flat_amount: value };
        setSubmitting(true);
        try {
            if (editingTax) {
                const updatedTax = await updateTax(editingTax.id, payload);
                setTaxes((current) => current.map((tax) => tax.id === updatedTax.id ? updatedTax : tax));
                toast({ title: "Tax updated" });
            } else {
                const createdTax = await createTax(payload);
                setTaxes((current) => [createdTax, ...current]);
                toast({ title: "Tax added" });
            }
            setDialogOpen(false);
        } catch (error) {
            toast({ title: "Could not save tax", description: getApiErrorMessage(error, "Failed to save tax"), variant: "destructive" });
        } finally {
            setSubmitting(false);
        }
    };

    const toggleTax = async (tax: ClientTax, isActive: boolean) => {
        setTaxes((current) => current.map((item) => item.id === tax.id ? { ...item, is_active: isActive } : item));
        try {
            const updatedTax = await updateTax(tax.id, { is_active: isActive });
            setTaxes((current) => current.map((item) => item.id === updatedTax.id ? updatedTax : item));
        } catch (error) {
            setTaxes((current) => current.map((item) => item.id === tax.id ? tax : item));
            toast({ title: "Could not update tax status", description: getApiErrorMessage(error, "Failed to update tax status"), variant: "destructive" });
        }
    };

    const confirmDelete = async () => {
        if (!taxToDelete) return;
        try {
            await deleteTax(taxToDelete.id);
            setTaxes((current) => current.filter((tax) => tax.id !== taxToDelete.id));
            toast({ title: "Tax deleted" });
        } catch (error) {
            toast({ title: "Could not delete tax", description: getApiErrorMessage(error, "Failed to delete tax"), variant: "destructive" });
        } finally {
            setTaxToDelete(null);
        }
    };

    const filteredTaxes = taxes.filter((tax) => tax.name.toLowerCase().includes(search.trim().toLowerCase()));

    return (
        <div className="space-y-6 p-6">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-foreground">Taxation &amp; Fee</h1>
                    <p className="mt-0.5 text-sm text-muted-foreground">Manage percentage taxes and flat fees for your platform.</p>
                </div>
                <Button onClick={openCreate} className="gap-2"><Plus size={16} />Add New Tax</Button>
            </div>

            <div className="relative max-w-sm">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search taxes"
                    className="h-9 w-full rounded-lg border border-border bg-secondary pl-9 pr-3 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary" />
            </div>

            <div className="overflow-hidden rounded-lg border border-border bg-card">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="border-b border-border bg-muted/30 text-left text-xs text-muted-foreground">
                            <tr>
                                <th className="px-4 py-3 font-medium">Name</th>
                                <th className="px-4 py-3 font-medium">Rate</th>
                                <th className="px-4 py-3 font-medium">Added On</th>
                                <th className="px-4 py-3 font-medium">Status</th>
                                <th className="px-4 py-3 text-right font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {loading &&
                                Array.from({ length: 5 }).map((_, index) => (
                                    <tr key={index}>
                                        <td className="px-4 py-4"><Skeleton className="h-4 w-36" /></td>
                                        <td className="px-4 py-4"><Skeleton className="h-4 w-16" /></td>
                                        <td className="px-4 py-4"><Skeleton className="h-4 w-24" /></td>
                                        <td className="px-4 py-4"><Skeleton className="h-6 w-11 rounded-full" /></td>
                                        <td className="px-4 py-4"><Skeleton className="ml-auto h-7 w-16" /></td>
                                    </tr>
                                ))}
                            {!loading &&
                                filteredTaxes.map((tax) => (
                                    <tr key={tax.id} className="hover:bg-muted/20">
                                        <td className="px-4 py-4 font-medium text-foreground">{tax.name}</td>
                                        <td className="px-4 py-4 text-foreground">{tax.tax_type === "flat" ? tax.flat_amount?.toFixed(2) : `${tax.percentage}%`}</td>
                                        <td className="px-4 py-4 text-muted-foreground">
                                            {new Date(tax.created_at).toLocaleDateString("en-US", {
                                                year: "numeric",
                                                month: "short",
                                                day: "numeric",
                                            })}
                                        </td>
                                        <td className="px-4 py-4">
                                            <Switch
                                                checked={tax.is_active}
                                                onCheckedChange={(checked) => void toggleTax(tax, checked)}
                                                aria-label={`Set ${tax.name} ${tax.is_active ? "inactive" : "active"}`}
                                            />
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="flex justify-end gap-1">
                                                <button
                                                    onClick={() => openEdit(tax)}
                                                    className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                                                    title="Edit tax"
                                                >
                                                    <Pencil size={15} color="#2a83e9" />
                                                </button>
                                                <button
                                                    onClick={() => setTaxToDelete(tax)}
                                                    title="Delete tax"
                                                    className="rounded-md p-2 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
                                                >
                                                    <Trash2 size={15} color="#fa4b4b" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            {!loading && filteredTaxes.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                                        No taxes found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent>
                    <form onSubmit={saveTax} className="space-y-5">
                        <DialogHeader>
                            <DialogTitle>{editingTax ? "Edit Tax" : "Add New Tax"}</DialogTitle>
                            <DialogDescription>Set a percentage rate or flat fee.</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-2">
                            <label htmlFor="tax-name" className="text-sm font-medium">Tax Name</label>
                            <input
                                id="tax-name"
                                value={form.name}
                                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                                autoFocus
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="tax-type" className="text-sm font-medium">Type</label>
                            <select
                                id="tax-type"
                                value={form.tax_type}
                                onChange={(event) => setForm((current) => ({ ...current, tax_type: event.target.value as "percentage" | "flat", percentage: "", flat_amount: "" }))}
                                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                            >
                                <option value="percentage">Percentage</option>
                                <option value="flat">Flat fee</option>
                            </select>
                        </div>
                        {form.tax_type === "percentage" ? (
                            <div className="space-y-2">
                                <label htmlFor="tax-percentage" className="text-sm font-medium">Percentage</label>
                                <input
                                    id="tax-percentage"
                                    type="number"
                                    min="0.01"
                                    max="100"
                                    step="0.01"
                                    value={form.percentage}
                                    onChange={(event) => setForm((current) => ({ ...current, percentage: event.target.value }))}
                                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                                    required
                                />
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <label htmlFor="tax-flat-amount" className="text-sm font-medium">Flat Amount</label>
                                <input
                                    id="tax-flat-amount"
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    value={form.flat_amount}
                                    onChange={(event) => setForm((current) => ({ ...current, flat_amount: event.target.value }))}
                                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                                    required
                                />
                            </div>
                        )}
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={submitting}>
                                {submitting ? "Saving..." : editingTax ? "Save Changes" : "Add Tax"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <AlertDialog open={Boolean(taxToDelete)} onOpenChange={(open) => !open && setTaxToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                                <AlertTriangle size={16} />
                            </span>
                            Delete tax?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            This permanently removes {taxToDelete?.name}. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmDelete}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}