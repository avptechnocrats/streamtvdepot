"use client";

import { FormEvent, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { ChevronDown, Loader2 } from "lucide-react";
import { createContactSubmission, getPlatformContent, getPublicPage, type ContactFormField } from "@/lib/services";

const fieldClass = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-primary focus:ring-1 focus:ring-primary";

function ContactForm({ fields }: { fields: ContactFormField[] }) {
    const [values, setValues] = useState<Record<string, string | string[]>>({});
    const [submitting, setSubmitting] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSubmitting(true); setMessage(null);
        try {
            const result = await createContactSubmission({ form_data: values });
            setValues({}); setMessage(result.message);
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Unable to submit your message. Please try again.");
        } finally { setSubmitting(false); }
    };

    if (fields.length === 0) return null;

    return (
        <form onSubmit={submit} className="mt-10 space-y-5 rounded-lg border border-slate-200 bg-slate-50 p-5 sm:p-7">
            {fields.map((field) => {
                const value = values[field.id] ?? (field.type === "checkbox" ? [] : "");
                const update = (nextValue: string | string[]) => setValues((current) => ({ ...current, [field.id]: nextValue }));
                return <div key={field.id} className="space-y-2">
                    {field.type !== "checkbox" && <label className="block text-sm font-medium text-slate-800" htmlFor={field.id}>{field.label}{field.required && <span className="ml-1 text-red-600">*</span>}</label>}
                    {field.type === "textarea" && <textarea id={field.id} required={field.required} value={value as string} onChange={(event) => update(event.target.value)} placeholder={field.placeholder ?? ""} rows={5} className={fieldClass} />}
                    {(field.type === "text" || field.type === "email") && <input id={field.id} required={field.required} type={field.type} value={value as string} onChange={(event) => update(event.target.value)} placeholder={field.placeholder ?? ""} className={fieldClass} />}
                    {field.type === "select" && <select id={field.id} required={field.required} value={value as string} onChange={(event) => update(event.target.value)} className={fieldClass}><option value="">Select an option</option>{field.options.map((option) => <option key={option} value={option}>{option}</option>)}</select>}
                    {field.type === "radio" && <div className="space-y-2">{field.options.map((option) => <label key={option} className="flex items-center gap-2 text-sm text-slate-700"><input required={field.required} type="radio" name={field.id} value={option} checked={value === option} onChange={() => update(option)} />{option}</label>)}</div>}
                    {field.type === "checkbox" && <label className="flex items-center gap-2 text-sm font-medium text-slate-800"><input id={field.id} required={field.required} type="checkbox" checked={(value as string[]).includes("true")} onChange={(event) => update(event.target.checked ? ["true"] : [])} />{field.label}{field.required && <span className="text-red-600">*</span>}</label>}
                </div>;
            })}
            {message && <p className="text-sm text-slate-700" role="status">{message}</p>}
            <button type="submit" disabled={submitting} className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50">{submitting ? "Submitting..." : "Submit"}</button>
        </form>
    );
}

function PlatformContentPage({ slug }: { slug: string }) {
    const isContact = slug === "contact-us";
    const { data, isLoading, isError } = useQuery({ queryKey: ["platform-content"], queryFn: getPlatformContent });
    if (isLoading) return <main className="min-h-[60vh] flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></main>;
    if (isError || !data) return <main className="min-h-[60vh] flex items-center justify-center px-6 text-center"><p className="text-sm text-muted-foreground">This page is unavailable.</p></main>;
    const content = isContact ? data.contact : data.faq;
    return <main className="min-h-[60vh] w-full bg-white px-6 py-16 lg:px-14 lg:py-20"><article className="bg-white p-2 sm:p-6"><header className="border-b border-slate-200 pb-6"><h1 className="text-2xl font-semibold text-slate-950 sm:text-3xl">{isContact ? "Contact Us" : "FAQ"}</h1></header>{content.body && <div className="prose prose-sm mt-8 max-w-none prose-headings:text-slate-950 prose-p:text-slate-700 prose-a:text-blue-700 sm:prose-base" dangerouslySetInnerHTML={{ __html: content.body }} />}{isContact ? <ContactForm fields={data.contact.fields} /> : <div className="mt-10 divide-y divide-slate-200 border-y border-slate-200">{data.faq.items.map((item, index) => <details key={`${item.question}-${index}`} className="group py-4"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-base font-medium text-slate-900">{item.question}<ChevronDown className="h-5 w-5 shrink-0 text-slate-500 transition group-open:rotate-180" /></summary><p className="mt-3 pr-9 text-sm leading-6 text-slate-700 whitespace-pre-wrap">{item.answer}</p></details>)}</div>}</article></main>;
}

export default function PublicPage() {
    const { slug } = useParams<{ slug: string }>();
    const isPlatformPage = slug === "contact-us" || slug === "faq";
    const { data: page, isLoading, isError } = useQuery({
        queryKey: ["public-page", slug],
        queryFn: () => getPublicPage(slug),
        enabled: Boolean(slug) && !isPlatformPage,
    });

    if (isPlatformPage) return <PlatformContentPage slug={slug} />;

    if (isLoading) {
        return (
            <main className="min-h-[60vh] flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </main>
        );
    }

    if (isError || !page) {
        return (
            <main className="min-h-[60vh] flex items-center justify-center px-6 text-center">
                <div>
                    <h1 className="text-3xl font-semibold text-foreground">Page not found</h1>
                    <p className="mt-2 text-sm text-muted-foreground">This page is unavailable or has not been published.</p>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-[60vh] w-full bg-white px-6 py-16 lg:px-14 lg:py-20">
            <article className="rounded-lg  bg-white p-6 sm:p-10">
                <header className="border-b border-slate-200 pb-6">
                    <h1 className="text-2xl font-semibold text-slate-950 sm:text-3xl">{page.title}</h1>
                    {page.short_description && (
                        <p className="mt-3 text-base text-slate-600">{page.short_description}</p>
                    )}
                </header>
                {page.body && (
                    <div
                        className="prose prose-sm mt-8 max-w-none prose-headings:text-slate-950 prose-p:my-[0.25em] prose-p:text-slate-700 prose-a:text-blue-700 prose-strong:text-slate-950 prose-li:text-slate-700 prose-blockquote:border-slate-300 prose-blockquote:text-slate-600 sm:prose-base"
                        dangerouslySetInnerHTML={{ __html: page.body }}
                    />
                )}
            </article>
        </main>
    );
}