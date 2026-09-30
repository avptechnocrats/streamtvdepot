"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Check, ChevronRight, ImagePlus, Loader2, LockKeyhole, Mail, MapPin, Sparkles } from "lucide-react";
import {
    fetchSiteSettings,
    presignLogoUpload,
    saveSiteSettings,
    type SiteSettingsOut,
} from "@/lib/api";

type Step = 1 | 2 | 3;

const steps = [
    { number: 1 as Step, title: "Basic Info", icon: Sparkles },
    { number: 2 as Step, title: "Contact Info", icon: MapPin },
    { number: 3 as Step, title: "Mail Settings", icon: Mail },
];

const inputClass = "w-full rounded-lg border border-white/10 bg-white/[0.045] px-3.5 py-2.5 text-sm text-white placeholder:text-white/25 outline-none transition focus:border-[hsl(217_100%_51%/0.6)] focus:ring-2 focus:ring-[hsl(217_100%_51%/0.15)]";
const LOGO_ASPECT = 480 / 145;

function apiError(error: unknown, fallback: string): string {
    const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
    return typeof detail === "string" ? detail : fallback;
}

export default function SetupPage() {
    const router = useRouter();
    const logoInputRef = useRef<HTMLInputElement>(null);
    const logoImageRef = useRef<HTMLImageElement>(null);
    const [step, setStep] = useState<Step>(1);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [error, setError] = useState("");
    const [siteTitle, setSiteTitle] = useState("");
    const [tagline, setTagline] = useState("");
    const [siteUrl, setSiteUrl] = useState("");
    const [logoUrl, setLogoUrl] = useState<string | null>(null);
    const [address1, setAddress1] = useState("");
    const [address2, setAddress2] = useState("");
    const [phone, setPhone] = useState("");
    const [contactEmail, setContactEmail] = useState("");
    const [adminEmail, setAdminEmail] = useState("");
    const [mailServer, setMailServer] = useState("");
    const [mailPort, setMailPort] = useState("");
    const [mailLogin, setMailLogin] = useState("");
    const [mailPassword, setMailPassword] = useState("");
    const [cropSource, setCropSource] = useState<string | null>(null);
    const [cropFile, setCropFile] = useState<File | null>(null);
    const [crop, setCrop] = useState<Crop>();
    const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);

    useEffect(() => {
        const load = async () => {
            try {
                const settings = await fetchSiteSettings();
                if (settings.onboarding_completed) {
                    router.replace("/admin");
                    return;
                }
                hydrate(settings);
            } catch {
                router.replace("/login");
                return;
            } finally {
                setLoading(false);
            }
        };
        void load();
    // The setup page only loads settings once when the session is established.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [router]);

    const hydrate = (settings: SiteSettingsOut) => {
        setSiteTitle(settings.general.site_title ?? settings.client_name ?? "");
        setTagline(settings.general.tagline ?? "");
        setSiteUrl(settings.general.site_url ?? "");
        setLogoUrl(settings.general.logo_url);
        setAddress1(settings.general.address1 ?? "");
        setAddress2(settings.general.address2 ?? "");
        setPhone(settings.general.phone ?? "");
        setContactEmail(settings.general.contact_email ?? "");
        setAdminEmail(settings.email.admin_email ?? "");
        setMailServer(settings.email.mail_server ?? "");
        setMailPort(settings.email.mail_port?.toString() ?? "");
        setMailLogin(settings.email.mail_login ?? "");
    };

    const saveBasic = async (): Promise<boolean> => {
        if (!siteTitle.trim() || !siteUrl.trim()) {
            setError("Site title and site URL are required.");
            return false;
        }
        await saveSiteSettings({
            general: {
                site_title: siteTitle.trim(),
                tagline: tagline.trim() || null,
                site_url: siteUrl.trim(),
            },
        });
        return true;
    };

    const saveContact = async () => {
        await saveSiteSettings({
            general: {
                address1: address1.trim() || null,
                address2: address2.trim() || null,
                phone: phone.trim() || null,
                contact_email: contactEmail.trim() || null,
            },
        });
    };

    const saveMail = async () => {
        const parsedPort = mailPort ? Number(mailPort) : null;
        if (mailPort && (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535)) {
            throw new Error("Mail port must be a number between 1 and 65535.");
        }
        await saveSiteSettings({
            email: {
                admin_email: adminEmail.trim() || null,
                mail_server: mailServer.trim() || null,
                mail_port: parsedPort,
                mail_login: mailLogin.trim() || null,
                ...(mailPassword ? { mail_password: mailPassword } : {}),
            },
        });
    };

    const advance = async () => {
        setError("");
        setSaving(true);
        try {
            if (step === 1) {
                if (await saveBasic()) setStep(2);
            } else if (step === 2) {
                await saveContact();
                setStep(3);
            } else {
                await saveMail();
                await saveSiteSettings({ onboarding_completed: true });
                router.replace("/admin");
            }
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : apiError(caught, "Could not save your settings. Please try again."));
        } finally {
            setSaving(false);
        }
    };

    const skip = async () => {
        setError("");
        setSaving(true);
        try {
            if (step === 2) setStep(3);
            if (step === 3) {
                await saveSiteSettings({ onboarding_completed: true });
                router.replace("/admin");
            }
        } finally {
            setSaving(false);
        }
    };

    const openLogoCrop = (file: File) => {
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) {
            setError("Choose a JPEG, PNG, or WebP logo under 10 MB.");
            return;
        }
        setError("");
        setCropSource(URL.createObjectURL(file));
        setCropFile(file);
        setCrop(undefined);
        setCompletedCrop(null);
    };

    const cancelLogoCrop = () => {
        if (cropSource) URL.revokeObjectURL(cropSource);
        setCropSource(null);
        setCropFile(null);
        setCrop(undefined);
        setCompletedCrop(null);
    };

    const initializeLogoCrop = (image: HTMLImageElement) => {
        const { naturalWidth, naturalHeight } = image;
        setCrop(centerCrop(
            makeAspectCrop({ unit: "%", width: 90 }, LOGO_ASPECT, naturalWidth, naturalHeight),
            naturalWidth,
            naturalHeight,
        ));
    };

    const uploadCroppedLogo = async (blob: Blob, filename: string) => {
        setUploadingLogo(true);
        try {
            const { upload_url, s3_key } = await presignLogoUpload({
                filename,
                content_type: "image/png",
                file_size: blob.size,
            });
            const response = await fetch(upload_url, {
                method: "PUT",
                headers: { "Content-Type": "image/png" },
                body: blob,
            });
            if (!response.ok) throw new Error("Logo upload failed.");
            const saved = await saveSiteSettings({ general: { logo_s3_key: s3_key } });
            setLogoUrl(saved.general.logo_url);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Logo upload failed. Please try again.");
        } finally {
            setUploadingLogo(false);
        }
    };

    const confirmLogoCrop = async () => {
        if (!completedCrop?.width || !logoImageRef.current || !cropFile) return;
        const canvas = document.createElement("canvas");
        canvas.width = 480;
        canvas.height = 145;
        const context = canvas.getContext("2d");
        if (!context) return;

        const image = logoImageRef.current;
        const scaleX = image.naturalWidth / image.width;
        const scaleY = image.naturalHeight / image.height;
        context.drawImage(
            image,
            completedCrop.x * scaleX,
            completedCrop.y * scaleY,
            completedCrop.width * scaleX,
            completedCrop.height * scaleY,
            0,
            0,
            480,
            145,
        );
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
        if (!blob) {
            setError("Unable to prepare the cropped logo.");
            return;
        }

        const filename = cropFile.name.replace(/\.[^.]+$/, ".png");
        cancelLogoCrop();
        await uploadCroppedLogo(blob, filename);
    };

    if (loading) {
        return <div className="min-h-screen bg-[#08090f] flex items-center justify-center"><Loader2 className="animate-spin text-[hsl(217_100%_51%)]" size={28} /></div>;
    }

    return (
        <main className="min-h-screen bg-[#08090f] px-5 py-10 text-white sm:px-8 lg:py-16">
            <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[340px_minmax(0,1fr)] lg:gap-12">
                <aside
                    className="rounded-lg border border-white/5 px-6 py-8 lg:px-9 lg:py-10"
                    style={{ background: "radial-gradient(ellipse at 30% 60%, hsl(217 100% 51% / 0.12) 0%, transparent 65%), #0d0f1a" }}
                >
                    <div className="mb-8 flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[hsl(217_100%_51%)] text-base font-black">S</div>
                        <span className="font-semibold tracking-wide">StreamTVDepot</span>
                    </div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(217_100%_70%)]">Platform setup</p>
                    <h1 className="mt-3 text-3xl font-bold leading-tight">Make it yours.</h1>
                    <p className="mt-3 text-sm leading-6 text-white/45">A few essentials now, then refine everything anytime from Settings.</p>
                    <nav className="mt-9 flex gap-2 lg:block lg:space-y-3" aria-label="Setup steps">
                        {steps.map(({ number, title, icon: Icon }) => (
                            <button key={number} type="button" onClick={() => setStep(number)} className={`flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-left transition lg:w-full ${step === number ? "bg-white/10 text-white" : "text-white/40 hover:bg-white/[0.04] hover:text-white/70"}`}>
                                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${step > number ? "bg-emerald-500/20 text-emerald-300" : step === number ? "bg-[hsl(217_100%_51%)] text-white" : "bg-white/10"}`}>
                                    {step > number ? <Check size={14} /> : number}
                                </span>
                                <span className="hidden text-sm font-medium sm:inline">{title}</span>
                                <Icon className="ml-auto hidden lg:block" size={15} />
                            </button>
                        ))}
                    </nav>
                </aside>

                <section className="rounded-lg border border-white/10 bg-white/[0.035] p-6 shadow-2xl sm:p-10">
                    <div className="mb-8 border-b border-white/10 pb-6">
                        <p className="text-xs font-medium text-[hsl(217_100%_70%)]">Step {step} of 3</p>
                        <h2 className="mt-2 text-2xl font-bold">{steps[step - 1].title}</h2>
                    </div>

                    {step === 1 && (
                        <div className="space-y-5">
                            <Field label="Site Title" required><input value={siteTitle} onChange={(event) => setSiteTitle(event.target.value)} className={inputClass} placeholder="Acme Streaming" /></Field>
                            <Field label="Tagline" optional><input value={tagline} onChange={(event) => setTagline(event.target.value)} className={inputClass} placeholder="Stream anything, anywhere." /></Field>
                            <Field label="Site URL" required><input type="url" value={siteUrl} onChange={(event) => setSiteUrl(event.target.value)} className={inputClass} placeholder="https://stream.acme.com" /></Field>
                            <div>
                                <div className="mb-2 flex items-baseline gap-2"><label className="text-sm font-medium text-white/80">Site Logo</label><span className="text-xs text-white/35">Optional</span></div>
                                <button type="button" onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo} className="flex min-h-28 w-full items-center gap-4 rounded-lg border border-dashed border-white/20 bg-white/[0.02] px-5 text-left transition hover:border-[hsl(217_100%_51%/0.5)] hover:bg-[hsl(217_100%_51%/0.04)] disabled:opacity-60">
                                    {logoUrl ? <img src={logoUrl} alt="Uploaded logo" className="h-14 max-w-44 object-contain" /> : <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/10 text-[hsl(217_100%_70%)]"><ImagePlus size={20} /></span>}
                                    <span><span className="block text-sm font-medium">{uploadingLogo ? "Uploading logo..." : logoUrl ? "Replace logo" : "Upload a logo"}</span><span className="mt-1 block text-xs text-white/40">PNG, JPEG, or WebP up to 10 MB</span></span>
                                </button>
                                <input ref={logoInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) openLogoCrop(file); event.target.value = ""; }} />
                            </div>
                        </div>
                    )}

                    {step === 2 && <div className="grid gap-5 sm:grid-cols-2"><Field label="Address 1"><input value={address1} onChange={(event) => setAddress1(event.target.value)} className={inputClass} placeholder="123 Main Street" /></Field><Field label="Address 2"><input value={address2} onChange={(event) => setAddress2(event.target.value)} className={inputClass} placeholder="Suite 100" /></Field><Field label="Phone"><input value={phone} onChange={(event) => setPhone(event.target.value)} className={inputClass} placeholder="+1 555 000 0000" /></Field><Field label="Email"><input type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} className={inputClass} placeholder="hello@example.com" /></Field></div>}

                    {step === 3 && <div className="grid gap-5 sm:grid-cols-2"><Field label="Administration Email Address"><input type="email" value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} className={inputClass} placeholder="admin@example.com" /></Field><Field label="Mail Server"><input value={mailServer} onChange={(event) => setMailServer(event.target.value)} className={inputClass} placeholder="smtp.example.com" /></Field><Field label="Port"><input type="number" min={1} max={65535} value={mailPort} onChange={(event) => setMailPort(event.target.value)} className={inputClass} placeholder="587" /></Field><Field label="Login Name"><input value={mailLogin} onChange={(event) => setMailLogin(event.target.value)} className={inputClass} placeholder="you@example.com" /></Field><div className="sm:col-span-2"><Field label="Password"><input type="password" value={mailPassword} onChange={(event) => setMailPassword(event.target.value)} className={inputClass} placeholder="SMTP password" autoComplete="new-password" /></Field></div></div>}

                    {error && <p className="mt-6 rounded-lg border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>}
                    <div className="mt-9 flex items-center justify-between border-t border-white/10 pt-6">
                        {step > 1 ? <button type="button" onClick={() => setStep((step - 1) as Step)} disabled={saving} className="text-sm font-medium text-white/50 transition hover:text-white">Back</button> : <span />}
                        <div className="flex gap-3">
                            {step > 1 && <button type="button" onClick={() => void skip()} disabled={saving} className="rounded-lg px-4 py-2.5 text-sm font-medium text-white/55 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-50">Skip</button>}
                            <button type="button" onClick={() => void advance()} disabled={saving || uploadingLogo} className="inline-flex items-center gap-2 rounded-lg bg-[hsl(217_100%_51%)] px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
                                {saving ? <Loader2 size={16} className="animate-spin" /> : step === 3 ? <Check size={16} /> : <ChevronRight size={16} />}
                                {saving ? "Saving..." : step === 3 ? "Finish" : "Next"}
                            </button>
                        </div>
                    </div>
                    <p className="mt-5 flex items-center justify-center gap-2 text-center text-xs text-white/30"><LockKeyhole size={12} /> Your settings remain private to your platform administrators.</p>
                </section>
            </div>
            {cropSource && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
                    <div className="w-full max-w-2xl space-y-4 rounded-lg border border-white/10 bg-[#0d0f1a] p-6 shadow-2xl">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(217_100%_70%)]">Site logo</p>
                            <h3 className="mt-1 text-xl font-bold">Crop your logo</h3>
                            <p className="mt-1 text-sm text-white/45">Position the image within the 480 × 145 logo area.</p>
                        </div>
                        <div className="max-h-[60vh] overflow-auto rounded-lg bg-black/25 p-2">
                            <ReactCrop crop={crop} onChange={(nextCrop) => setCrop(nextCrop)} onComplete={(nextCrop) => setCompletedCrop(nextCrop)} aspect={LOGO_ASPECT} minWidth={100}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img ref={logoImageRef} src={cropSource} alt="Crop logo" onLoad={(event) => initializeLogoCrop(event.currentTarget)} style={{ display: "block", maxWidth: "100%" }} />
                            </ReactCrop>
                        </div>
                        <div className="flex justify-end gap-3 border-t border-white/10 pt-4">
                            <button type="button" onClick={cancelLogoCrop} disabled={uploadingLogo} className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-white/70 transition hover:bg-white/[0.06] disabled:opacity-50">Cancel</button>
                            <button type="button" onClick={() => void confirmLogoCrop()} disabled={uploadingLogo || !completedCrop?.width} className="inline-flex items-center gap-2 rounded-lg bg-[hsl(217_100%_51%)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50">
                                {uploadingLogo ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                                {uploadingLogo ? "Uploading..." : "Crop & Upload"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}

function Field({ label, required, optional, children }: { label: string; required?: boolean; optional?: boolean; children: React.ReactNode }) {
    return <div><div className="mb-2 flex items-baseline gap-2"><label className="text-sm font-medium text-white/80">{label}</label>{required && <span className="text-xs text-[hsl(217_100%_70%)]">Required</span>}{optional && <span className="text-xs text-white/35">Optional</span>}</div>{children}</div>;
}