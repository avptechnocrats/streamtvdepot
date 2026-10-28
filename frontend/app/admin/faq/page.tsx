"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { getPlatformContent, updateFAQContent, type FAQContent } from "@/lib/api";

const inputClass = "w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary";

export default function FAQAdminPage() {
    const [content, setContent] = useState<FAQContent>({ body: "", items: [] });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);

    useEffect(() => {
        getPlatformContent().then((data) => setContent(data.faq)).catch(() => setNotice("Unable to load FAQ content.")).finally(() => setLoading(false));
    }, []);

    const save = async () => {
        setSaving(true); setNotice(null);
        try { setContent(await updateFAQContent(content)); setNotice("FAQ content saved."); }
        catch (error) { setNotice(error instanceof Error ? error.message : "Unable to save FAQ content."); }
        finally { setSaving(false); }
    };

    if (loading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin text-muted-foreground" /></div>;

    return (
        <div className="max-w-6xl space-y-6 p-6">
            <div><h1 className="text-xl font-bold text-foreground">FAQ</h1><p className="mt-1 text-sm text-muted-foreground">Add introduction content and the questions shown in the storefront accordion.</p></div>
            <section className="space-y-3 rounded-xl border border-border bg-card p-5"><h2 className="text-sm font-bold uppercase tracking-wide text-foreground">Static Content</h2><RichTextEditor value={content.body ?? ""} onChange={(body) => setContent((current) => ({ ...current, body }))} placeholder="Write your FAQ introduction here..." height="24rem" /></section>
            <section className="space-y-4 rounded-xl border border-border bg-card p-5">
                <div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-bold uppercase tracking-wide text-foreground">Questions & Answers</h2><p className="mt-1 text-xs text-muted-foreground">Add as many FAQs as your storefront needs.</p></div><button type="button" onClick={() => setContent((current) => ({ ...current, items: [...current.items, { question: "", answer: "" }] }))} className="flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm hover:bg-secondary"><Plus size={15} /> Add More</button></div>
                <div className="space-y-4">{content.items.map((item, index) => <div key={index} className="space-y-3 rounded-lg border border-border bg-secondary/30 p-4"><div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold text-muted-foreground">FAQ {index + 1}</span><button type="button" title="Remove FAQ" onClick={() => setContent((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }))} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-500"><Trash2 size={15} /></button></div><input className={inputClass} value={item.question} onChange={(event) => setContent((current) => ({ ...current, items: current.items.map((entry, itemIndex) => itemIndex === index ? { ...entry, question: event.target.value } : entry) }))} placeholder="Question" /><textarea className={inputClass} rows={4} value={item.answer} onChange={(event) => setContent((current) => ({ ...current, items: current.items.map((entry, itemIndex) => itemIndex === index ? { ...entry, answer: event.target.value } : entry) }))} placeholder="Answer" /></div>)}</div>
            </section>
            <div className="flex items-center justify-between gap-4"><p className="text-sm text-muted-foreground" role="status">{notice}</p><button type="button" onClick={save} disabled={saving} className="flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">{saving ? <Loader2 className="animate-spin" size={15} /> : <Check size={15} />}{saving ? "Saving..." : "Save FAQ"}</button></div>
        </div>
    );
}