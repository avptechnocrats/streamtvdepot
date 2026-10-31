"use client";

import { FormEvent, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { ChevronDown, Loader2 } from "lucide-react";
import { createContactSubmission, getPlatformContent, getPublicPage, type ContactFormField } from "@/lib/services";
import ManagedBannerSlot, { usePageBanners } from "@/components/ManagedBannerSlot";

const fieldClass = "h-11 w-full rounded-md border border-slate-300 bg-white px-3.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/15";
const staticPageTitleClass = "text-3xl font-semibold leading-tight text-slate-950 sm:text-4xl";

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
        <form onSubmit={submit} className="space-y-6 border border-slate-200 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.06)] sm:p-7 lg:p-8">
            <div className="border-b border-slate-200 pb-5">
                <p className="text-xs font-semibold uppercase tracking-widest text-primary">Contact Form</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-950">Send us a message</h2>
            </div>
            {fields.map((field) => {
                const value = values[field.id] ?? (field.type === "checkbox" ? [] : "");
                const update = (nextValue: string | string[]) => setValues((current) => ({ ...current, [field.id]: nextValue }));
                return <div key={field.id} className="space-y-2">
                    {field.type !== "checkbox" && <label className="block text-sm font-medium text-slate-800" htmlFor={field.id}>{field.label}{field.required && <span className="ml-1 text-red-600">*</span>}</label>}
                    {field.type === "textarea" && <textarea id={field.id} required={field.required} value={value as string} onChange={(event) => update(event.target.value)} placeholder={field.placeholder ?? ""} rows={5} className={`${fieldClass} h-auto min-h-32 py-3`} />}
                    {(field.type === "text" || field.type === "email") && <input id={field.id} required={field.required} type={field.type} value={value as string} onChange={(event) => update(event.target.value)} placeholder={field.placeholder ?? ""} className={fieldClass} />}
                    {field.type === "select" && <select id={field.id} required={field.required} value={value as string} onChange={(event) => update(event.target.value)} className={fieldClass}><option value="">Select an option</option>{field.options.map((option) => <option key={option} value={option}>{option}</option>)}</select>}
                    {field.type === "radio" && <div className="space-y-2">{field.options.map((option) => <label key={option} className="flex items-center gap-2.5 text-sm text-slate-700"><input required={field.required} type="radio" name={field.id} value={option} checked={value === option} onChange={() => update(option)} className="h-4 w-4 accent-primary" />{option}</label>)}</div>}
                    {field.type === "checkbox" && <label className="flex min-h-11 items-center gap-2.5 text-sm font-medium text-slate-800"><input id={field.id} required={field.required} type="checkbox" checked={(value as string[]).includes("true")} onChange={(event) => update(event.target.checked ? ["true"] : [])} className="h-4 w-4 accent-primary" />{field.label}{field.required && <span className="text-red-600">*</span>}</label>}
                </div>;
            })}
            {message && <p className="text-sm text-slate-700" role="status">{message}</p>}
            <button type="submit" disabled={submitting} className="inline-flex h-11 items-center justify-center rounded-md bg-primary bg-[image:var(--ember-gradient,none)] px-6 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">{submitting ? "Submitting..." : "Send Message"}</button>
        </form>
    );
}

function PlatformContentPage({ slug }: { slug: string }) {
    const isContact = slug === "contact-us";
    const { data, isLoading, isError } = useQuery({ queryKey: ["platform-content"], queryFn: getPlatformContent });
    if (isLoading) return <main className="min-h-[60vh] flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></main>;
    if (isError || !data) return <main className="min-h-[60vh] flex items-center justify-center px-6 text-center"><p className="text-sm text-muted-foreground">This page is unavailable.</p></main>;
    const content = isContact ? data.contact : data.faq;
    return (
        <main className="min-h-[60vh] w-full bg-white px-6 py-12 sm:py-16 lg:px-14 lg:py-20">
            <article className={`mx-auto bg-white p-2 sm:p-6 ${isContact ? "max-w-7xl" : "max-w-7xl"}`}>
                <header className="border-b border-slate-200 pb-6">
                    <h1 className={staticPageTitleClass}>{isContact ? "Contact Us" : "FAQ"}</h1>
                </header>

                {isContact ? (
                    <div className="mt-10 grid items-start gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14">
                        <div className="min-w-0">
                            {content.body && (
                                <div
                                    className="prose prose-sm max-w-none prose-headings:font-semibold prose-headings:text-slate-950 prose-p:leading-7 prose-p:text-slate-600 prose-a:font-medium prose-a:text-primary prose-strong:text-slate-900 sm:prose-base"
                                    dangerouslySetInnerHTML={{ __html: content.body }}
                                />
                            )}
                        </div>
                        <div className="min-w-0">
                            <ContactForm fields={data.contact.fields} />
                        </div>
                    </div>
                ) : (
                    <>
                        {content.body && (
                            <div
                                className="prose prose-sm mt-8 max-w-none prose-headings:text-slate-950 prose-p:text-slate-700 prose-a:text-blue-700 sm:prose-base"
                                dangerouslySetInnerHTML={{ __html: content.body }}
                            />
                        )}
                    <div className="mt-12 space-y-10">
                        {data.faq.groups.map((group, groupIndex) => (
                            <section key={`${group.label}-${groupIndex}`}>
                                {group.label.trim() && (
                                    <div className="mb-3 flex items-center gap-3">
                                        <span className="h-6 w-1 shrink-0 rounded-full bg-primary" />
                                        <h2 className="text-sm font-bold uppercase tracking-widest text-slate-900 sm:text-base">
                                            {group.label}
                                        </h2>
                                    </div>
                                )}
                                <div className="divide-y divide-slate-200 border-y border-slate-200">
                                    {group.items.map((item, itemIndex) => (
                                        <details key={`${item.question}-${itemIndex}`} className="group">
                                            <summary className="flex cursor-pointer list-none items-center justify-between gap-5 py-5 text-left text-sm font-semibold text-slate-900 transition-colors hover:text-primary sm:text-base [&::-webkit-details-marker]:hidden">
                                                <span>{item.question}</span>
                                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-all group-open:rotate-180 group-open:border-primary/30 group-open:bg-primary/5 group-open:text-primary">
                                                    <ChevronDown className="h-4 w-4" />
                                                </span>
                                            </summary>
                                            <div className="mb-4 rounded-lg border-l-2 border-primary/50 bg-slate-50 px-4 py-3 sm:px-5">
                                                <div
                                                    className="prose prose-sm max-w-none leading-6 text-slate-700 prose-p:my-2 prose-a:text-primary prose-strong:text-slate-900"
                                                    dangerouslySetInnerHTML={{ __html: item.answer }}
                                                />
                                            </div>
                                        </details>
                                    ))}
                                </div>
                            </section>
                        ))}
                    </div>
                    </>
                )}
            </article>
        </main>
    );
}

export default function PublicPage() {
    const { slug } = useParams<{ slug: string }>();
    const isSeries = slug === "series";
    const { data: seriesBanners = [], isError: seriesBannerError } = usePageBanners(isSeries ? "/series" : undefined);
    const hasSeriesBanners = !seriesBannerError && seriesBanners.some(banner => banner.page === "/series" && Object.keys(banner.images).length > 0);
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
        if (isSeries && hasSeriesBanners) return <main className="min-h-[60vh] pt-28"><header className="px-6 lg:px-14"><h1 className="text-3xl font-semibold">Series</h1></header><ManagedBannerSlot page="/series" position="top" /><p className="px-6 py-10 text-sm text-muted-foreground lg:px-14">Series content is not available yet.</p><ManagedBannerSlot page="/series" position="middle_1" /><ManagedBannerSlot page="/series" position="middle_2" /><ManagedBannerSlot page="/series" position="bottom" /></main>;
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
        <main className="min-h-[60vh] w-full bg-white px-6 py-12 sm:py-16 lg:px-14 lg:py-20">
            <article className="mx-auto max-w-7xl bg-white p-2 sm:p-6">
                <header className="border-b border-slate-200 pb-7">
                    <h1 className={staticPageTitleClass}>{page.title}</h1>
                    {page.short_description && (
                        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">{page.short_description}</p>
                    )}
                </header>
                {isSeries && <ManagedBannerSlot page="/series" position="top" inset />}
                {isSeries && <ManagedBannerSlot page="/series" position="middle_1" inset />}
                {page.body && (
                    <div
                        className="prose prose-base mt-8 max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-slate-950 prose-h2:mt-12 prose-h2:border-b prose-h2:border-slate-200 prose-h2:pb-3 prose-h3:mt-8 prose-h3:text-lg sm:prose-h3:text-xl sm:prose-h3:leading-8 prose-p:my-4 prose-p:leading-7 prose-p:text-slate-600 prose-a:font-medium prose-strong:text-slate-900 prose-li:my-2 prose-li:leading-7 prose-li:text-slate-600 prose-blockquote:border-primary/40 prose-blockquote:text-slate-600 prose-hr:border-slate-200 sm:prose-lg"
                        dangerouslySetInnerHTML={{ __html: page.body }}
                    />
                )}
                {isSeries && <ManagedBannerSlot page="/series" position="middle_2" inset />}
                {isSeries && <ManagedBannerSlot page="/series" position="bottom" inset />}
            </article>
        </main>
    );
}