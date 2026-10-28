"use client";

import { useEffect, useRef, useState } from "react";
import {
    AlignLeft,
    Check,
    CheckSquare,
    CircleDot,
    GripVertical,
    List,
    Loader2,
    Mail,
    Trash2,
    Type,
} from "lucide-react";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import {
    getPlatformContent,
    updateContactContent,
    type ContactContent,
    type ContactFieldType,
    type ContactFormField,
} from "@/lib/api";

const FIELD_TYPES: { value: ContactFieldType; label: string; icon: React.ElementType }[] = [
    { value: "text", label: "Text", icon: Type },
    { value: "email", label: "Email", icon: Mail },
    { value: "textarea", label: "Text Area", icon: AlignLeft },
    { value: "select", label: "Dropdown", icon: List },
    { value: "radio", label: "Radio", icon: CircleDot },
    { value: "checkbox", label: "Checkbox", icon: CheckSquare },
];

const typeMeta = (type: ContactFieldType) => FIELD_TYPES.find((item) => item.value === type)!;

const inputClass = "h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary";

type DragSource = { kind: "new"; type: ContactFieldType } | { kind: "move"; index: number };

export default function ContactUsAdminPage() {
    const [content, setContent] = useState<ContactContent>({ body: "", fields: [] });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const [source, setSource] = useState<DragSource | null>(null);
    const [overIndex, setOverIndex] = useState<number | null>(null);
    const counter = useRef(0);

    useEffect(() => {
        getPlatformContent()
            .then((data) => setContent(data.contact))
            .catch(() => setNotice("Unable to load Contact Us content."))
            .finally(() => setLoading(false));
    }, []);

    const createField = (type: ContactFieldType): ContactFormField => ({
        id: `field-${Date.now().toString(36)}-${counter.current++}`,
        label: typeMeta(type).label,
        type,
        required: false,
        placeholder: null,
        options: type === "select" || type === "radio" ? ["Option 1"] : [],
    });

    const updateField = (index: number, patch: Partial<ContactFormField>) =>
        setContent((current) => ({
            ...current,
            fields: current.fields.map((field, i) => (i === index ? { ...field, ...patch } : field)),
        }));

    const endDrag = () => { setSource(null); setOverIndex(null); };

    const insertAt = (type: ContactFieldType, at?: number) =>
        setContent((current) => {
            const fields = [...current.fields];
            fields.splice(at ?? fields.length, 0, createField(type));
            return { ...current, fields };
        });

    const handleDrop = () => {
        if (!source) return;
        const target = overIndex ?? content.fields.length;
        if (source.kind === "new") {
            insertAt(source.type, target);
        } else {
            setContent((current) => {
                const fields = [...current.fields];
                const [moved] = fields.splice(source.index, 1);
                fields.splice(source.index < target ? target - 1 : target, 0, moved);
                return { ...current, fields };
            });
        }
        endDrag();
    };

    const save = async () => {
        setSaving(true);
        setNotice(null);
        try {
            setContent(await updateContactContent(content));
            setNotice("Contact Us content saved.");
        } catch (error) {
            setNotice(error instanceof Error ? error.message : "Unable to save Contact Us content.");
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin text-muted-foreground" /></div>;

    const dropLine = <div className="h-0.5 rounded bg-primary" />;

    return (
        <div className="max-w-7xl space-y-6 p-6">
            <div>
                <h1 className="text-xl font-bold text-foreground">Contact Us</h1>
                <p className="mt-1 text-sm text-muted-foreground">Manage the storefront introduction and the fields visitors use to contact you.</p>
            </div>

            <div className="grid items-stretch gap-6 lg:grid-cols-2">
                <section className="space-y-3 rounded-xl border border-border bg-card p-5">
                    <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">Static Content</h2>
                    <RichTextEditor value={content.body ?? ""} onChange={(body) => setContent((current) => ({ ...current, body }))} placeholder="Write your Contact Us content here..." height="clamp(20rem, 55vh, 36rem)" />
                </section>

                <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
                    <div>
                        <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">Contact Form</h2>
                        <p className="mt-1 text-xs text-muted-foreground">Drag a field from the left panel onto the form, or click it to append. Drag added fields to reorder.</p>
                    </div>

                    <div className="flex flex-1 flex-col gap-4 sm:flex-row">
                        <div className="grid shrink-0 grid-cols-3 gap-2 sm:w-[5.5rem] sm:grid-cols-1 sm:self-start">
                            {FIELD_TYPES.map(({ value, label, icon: Icon }) => (
                                <button
                                    key={value}
                                    type="button"
                                    draggable
                                    onDragStart={(event) => { event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData("text/plain", value); setSource({ kind: "new", type: value }); }}
                                    onDragEnd={endDrag}
                                    onClick={() => insertAt(value)}
                                    title={`Add ${label}`}
                                    className="flex cursor-grab flex-col items-center gap-1.5 rounded-lg border border-border bg-secondary/40 px-2 py-3 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground active:cursor-grabbing"
                                >
                                    <Icon size={20} />
                                    {label}
                                </button>
                            ))}
                        </div>

                        <div
                            onDragOver={(event) => { if (!source) return; event.preventDefault(); setOverIndex(content.fields.length); }}
                            onDrop={(event) => { event.preventDefault(); handleDrop(); }}
                            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOverIndex(null); }}
                            className={`min-h-[16rem] flex-1 space-y-2 rounded-lg border-2 border-dashed p-3 transition-colors ${source ? "border-primary/50 bg-primary/5" : "border-border"}`}
                        >
                            {content.fields.length === 0 && (
                                <div className="flex h-52 items-center justify-center text-center text-sm text-muted-foreground">Drop fields here to build your form</div>
                            )}
                            {content.fields.map((field, index) => {
                                const { icon: Icon, label: typeLabel } = typeMeta(field.type);
                                return (
                                    <div key={field.id}>
                                        {overIndex === index && dropLine}
                                        <div
                                            draggable
                                            onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", field.id); setSource({ kind: "move", index }); }}
                                            onDragEnd={endDrag}
                                            onDragOver={(event) => {
                                                if (!source) return;
                                                event.preventDefault();
                                                event.stopPropagation();
                                                const rect = event.currentTarget.getBoundingClientRect();
                                                setOverIndex(event.clientY < rect.top + rect.height / 2 ? index : index + 1);
                                            }}
                                            className={`space-y-3 rounded-lg border border-border bg-background p-3 ${source?.kind === "move" && source.index === index ? "opacity-40" : ""}`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <GripVertical size={16} className="cursor-grab text-muted-foreground" />
                                                <Icon size={15} className="text-primary" />
                                                <span className="text-xs font-semibold text-foreground">{typeLabel}</span>
                                                <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                                                    <input type="checkbox" checked={field.required} onChange={(event) => updateField(index, { required: event.target.checked })} />
                                                    Required
                                                </label>
                                                <button type="button" title="Remove field" onClick={() => setContent((current) => ({ ...current, fields: current.fields.filter((_, i) => i !== index) }))} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-500">
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                            <input className={inputClass} value={field.label} onChange={(event) => updateField(index, { label: event.target.value })} placeholder="Label" aria-label="Field label" />
                                            {(field.type === "text" || field.type === "email" || field.type === "textarea") && (
                                                <input className={inputClass} value={field.placeholder ?? ""} onChange={(event) => updateField(index, { placeholder: event.target.value || null })} placeholder="Placeholder" aria-label="Field placeholder" />
                                            )}
                                            {(field.type === "select" || field.type === "radio") && (
                                                <input className={inputClass} value={field.options.join(", ")} onChange={(event) => updateField(index, { options: event.target.value.split(",").map((option) => option.trim()).filter(Boolean) })} placeholder="Options, separated by commas" aria-label="Field options" />
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                            {overIndex === content.fields.length && content.fields.length > 0 && dropLine}
                        </div>
                    </div>
                </section>
            </div>

            <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground" role="status">{notice}</p>
                <button type="button" onClick={save} disabled={saving} className="flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
                    {saving ? <Loader2 className="animate-spin" size={15} /> : <Check size={15} />}
                    {saving ? "Saving..." : "Save Contact Us"}
                </button>
            </div>
        </div>
    );
}
