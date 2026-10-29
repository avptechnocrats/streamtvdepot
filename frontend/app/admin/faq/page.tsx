"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, Loader2, Plus, Trash2 } from "lucide-react";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { getPlatformContent, updateFAQContent, type FAQContent } from "@/lib/api";

const inputClass = "w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary";

export default function FAQAdminPage() {
    const [content, setContent] = useState<FAQContent>({ body: "", groups: [] });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(new Set());

    useEffect(() => {
        getPlatformContent()
            .then((data) => {
                setContent(data.faq);
                setCollapsedGroups(new Set());
            })
            .catch(() => setNotice("Unable to load FAQ content."))
            .finally(() => setLoading(false));
    }, []);

    const save = async () => {
        if (content.groups.some((group) => !group.label.trim())) {
            setNotice("Add a label to each FAQ group before saving.");
            return;
        }
        if (content.groups.some((group) => group.items.some((item) => !item.question.trim() || !item.answer.trim()))) {
            setNotice("Complete each question and answer before saving.");
            return;
        }
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
                <div className="flex items-center justify-between gap-3">
                    <div><h2 className="text-sm font-bold uppercase tracking-wide text-foreground">Questions & Answers</h2><p className="mt-1 text-xs text-muted-foreground">Organize questions into labeled groups.</p></div>
                    <button type="button" onClick={() => setContent((current) => ({ ...current, groups: [...current.groups, { label: "", items: [] }] }))} className="flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm hover:bg-secondary"><Plus size={15} /> Add Group</button>
                </div>
                <div className="space-y-5">
                    {content.groups.map((group, groupIndex) => (
                        <div key={groupIndex} className="space-y-4 rounded-lg border border-border bg-secondary/20 p-4">
                            <div className="flex items-center gap-3">
                                <input
                                    className={`${inputClass} font-semibold`}
                                    value={group.label}
                                    onChange={(event) => setContent((current) => ({ ...current, groups: current.groups.map((entry, index) => index === groupIndex ? { ...entry, label: event.target.value } : entry) }))}
                                    placeholder="Group heading, e.g. General Questions About Kalingo TV"
                                    aria-label={`FAQ group ${groupIndex + 1} heading`}
                                />
                                <button
                                    type="button"
                                    title={collapsedGroups.has(groupIndex) ? "Expand group" : "Collapse group"}
                                    aria-label={collapsedGroups.has(groupIndex) ? `Expand ${group.label || `FAQ group ${groupIndex + 1}`}` : `Collapse ${group.label || `FAQ group ${groupIndex + 1}`}`}
                                    aria-expanded={!collapsedGroups.has(groupIndex)}
                                    onClick={() => setCollapsedGroups((current) => {
                                        const next = new Set(current);
                                        if (next.has(groupIndex)) next.delete(groupIndex);
                                        else next.add(groupIndex);
                                        return next;
                                    })}
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
                                >
                                    <ChevronDown size={16} className={`transition-transform ${collapsedGroups.has(groupIndex) ? "-rotate-90" : ""}`} />
                                </button>
                                <button type="button" title="Remove group" onClick={() => setContent((current) => ({ ...current, groups: current.groups.filter((_, index) => index !== groupIndex) }))} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-500"><Trash2 size={15} /></button>
                            </div>
                            {!collapsedGroups.has(groupIndex) && <div className="space-y-3">
                                {group.items.map((item, itemIndex) => (
                                    <div key={itemIndex} className="space-y-3 rounded-lg border border-border bg-card p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="text-xs font-semibold text-muted-foreground">Question {itemIndex + 1}</span>
                                            <button type="button" title="Remove question" onClick={() => setContent((current) => ({ ...current, groups: current.groups.map((entry, index) => index === groupIndex ? { ...entry, items: entry.items.filter((_, questionIndex) => questionIndex !== itemIndex) } : entry) }))} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-500"><Trash2 size={15} /></button>
                                        </div>
                                        <input className={inputClass} value={item.question} onChange={(event) => setContent((current) => ({ ...current, groups: current.groups.map((entry, index) => index === groupIndex ? { ...entry, items: entry.items.map((question, questionIndex) => questionIndex === itemIndex ? { ...question, question: event.target.value } : question) } : entry) }))} placeholder="Question" />
                                        <RichTextEditor
                                            value={item.answer}
                                            onChange={(answer) => setContent((current) => ({ ...current, groups: current.groups.map((entry, index) => index === groupIndex ? { ...entry, items: entry.items.map((question, questionIndex) => questionIndex === itemIndex ? { ...question, answer } : question) } : entry) }))}
                                            placeholder="Write the answer..."
                                            minHeight={140}
                                        />
                                    </div>
                                ))}
                                <button type="button" onClick={() => setContent((current) => ({ ...current, groups: current.groups.map((entry, index) => index === groupIndex ? { ...entry, items: [...entry.items, { question: "", answer: "" }] } : entry) }))} className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs hover:bg-secondary"><Plus size={14} /> Add Question</button>
                            </div>}
                        </div>
                    ))}
                    {content.groups.length === 0 && <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">Add a group to start organizing FAQs.</p>}
                </div>
            </section>
            <div className="flex items-center justify-between gap-4"><p className="text-sm text-muted-foreground" role="status">{notice}</p><button type="button" onClick={save} disabled={saving} className="flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">{saving ? <Loader2 className="animate-spin" size={15} /> : <Check size={15} />}{saving ? "Saving..." : "Save FAQ"}</button></div>
        </div>
    );
}