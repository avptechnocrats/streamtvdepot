"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Upload, Loader2, Check, X, Eye, EyeOff, ChevronDown, Settings, Pencil } from "lucide-react";
import {
    fetchSiteSettings,
    saveSiteSettings,
    testSiteSmtpConnection,
    presignLogoUpload,
    type SiteSettingsOut,
    type GeneralSettingsIn,
    type EmailSettingsIn,
    type SocialAuthSettingsIn,
    type GoogleOAuthSettingsIn,
} from "@/lib/api";
import {
    fetchSuperadminSettings,
    saveSuperadminSettings,
    testSuperadminSmtpConnection,
    type SuperadminSettingsOut,
    type SuperadminGeneralSettingsIn,
    type SuperadminEmailSettingsIn,
} from "@/lib/api/services/superadmin";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { LabeledSwitch } from "@/components/ui/labeled-switch";

// ─── Language options ─────────────────────────────────────────────────────────

const LANGUAGES = [
    { code: "en", label: "English" },
    { code: "es", label: "Spanish" },
    { code: "fr", label: "French" },
    { code: "hi", label: "Hindi" },
    { code: "ur", label: "Urdu" },
    { code: "ru", label: "Russian" },
    { code: "ar", label: "Arabic" },
    { code: "zh", label: "Chinese (Simplified)" },
    { code: "pt", label: "Portuguese" },
    { code: "de", label: "German" },
    { code: "ja", label: "Japanese" },
    { code: "ko", label: "Korean" },
    { code: "it", label: "Italian" },
    { code: "tr", label: "Turkish" },
    { code: "nl", label: "Dutch" },
    { code: "pl", label: "Polish" },
    { code: "bn", label: "Bengali" },
    { code: "id", label: "Indonesian" },
    { code: "vi", label: "Vietnamese" },
    { code: "fa", label: "Persian" },
];

type SmtpDebug = {
    credential_source?: {
        mail_server?: string;
        mail_port?: string;
        mail_login?: string;
        mail_password?: string;
        from_email?: string;
    };
    used_db_stored_credentials?: boolean;
    used_env_fallback?: boolean;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email: string): boolean {
    return EMAIL_REGEX.test(email.trim());
}

function parseApiError(error: unknown): { message: string; debug?: SmtpDebug } {
    const fallback = "Request failed. Please try again.";
    if (!error || typeof error !== "object") return { message: fallback };

    const maybeResponse = (error as { response?: { data?: { detail?: unknown; message?: string } } }).response;
    const detail = maybeResponse?.data?.detail;
    if (typeof detail === "string") return { message: detail };
    if (detail && typeof detail === "object") {
        const d = detail as { message?: string; debug?: SmtpDebug };
        return { message: d.message || fallback, debug: d.debug };
    }

    const msg = maybeResponse?.data?.message;
    if (typeof msg === "string" && msg.trim()) return { message: msg };
    return { message: fallback };
}

function SourceBadge({ source }: { source?: string }) {
    const token = source || "missing";
    const cls = token === "db"
        ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
        : token === "env"
            ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
            : token === "payload"
                ? "bg-sky-500/10 text-sky-300 border-sky-500/20"
                : "bg-muted text-muted-foreground border-border";
    return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>{token}</span>;
}

function SmtpDebugPanel({ debug }: { debug: SmtpDebug | null }) {
    if (!debug) return null;
    const src = debug.credential_source || {};
    return (
        <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-2">
            <div className="flex flex-wrap gap-2 text-[11px]">
                <span className="text-muted-foreground">DB credentials used:</span>
                <SourceBadge source={debug.used_db_stored_credentials ? "db" : "no"} />
                <span className="text-muted-foreground ml-2">ENV fallback used:</span>
                <SourceBadge source={debug.used_env_fallback ? "env" : "no"} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div className="flex items-center justify-between rounded border border-border px-2 py-1"><span className="text-muted-foreground">Mail server</span><SourceBadge source={src.mail_server} /></div>
                <div className="flex items-center justify-between rounded border border-border px-2 py-1"><span className="text-muted-foreground">Port</span><SourceBadge source={src.mail_port} /></div>
                <div className="flex items-center justify-between rounded border border-border px-2 py-1"><span className="text-muted-foreground">Login</span><SourceBadge source={src.mail_login} /></div>
                <div className="flex items-center justify-between rounded border border-border px-2 py-1"><span className="text-muted-foreground">Password</span><SourceBadge source={src.mail_password} /></div>
                <div className="sm:col-span-2 flex items-center justify-between rounded border border-border px-2 py-1"><span className="text-muted-foreground">From email</span><SourceBadge source={src.from_email} /></div>
            </div>
        </div>
    );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

type ToastType = "success" | "error";
interface Toast { id: number; message: string; type: ToastType }
let _toastId = 0;

function useToast() {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const push = useCallback((message: string, type: ToastType = "success") => {
        const id = ++_toastId;
        setToasts((p) => [...p, { id, message, type }]);
        setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3500);
    }, []);
    const dismiss = useCallback((id: number) => setToasts((p) => p.filter((t) => t.id !== id)), []);
    return { toasts, push, dismiss };
}

function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
            {toasts.map((t) => (
                <div key={t.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg text-sm font-medium pointer-events-auto transition-all ${t.type === "success" ? "bg-card border-green-500/30 text-foreground" : "bg-card border-destructive/30 text-destructive"}`}>
                    {t.type === "success" ? <Check size={14} className="text-green-500 shrink-0" /> : <X size={14} className="text-destructive shrink-0" />}
                    {t.message}
                    <button onClick={() => onDismiss(t.id)} className="ml-auto text-muted-foreground hover:text-foreground transition-colors"><X size={12} /></button>
                </div>
            ))}
        </div>
    );
}

// ─── Shared UI helpers ────────────────────────────────────────────────────────

function SectionCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return <section className={`rounded-2xl border border-border bg-card p-6 space-y-5 ${className}`}>{children}</section>;
}

function SectionHeading({ children }: { children: React.ReactNode }) {
    return <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">{children}</h3>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1">
            <label className="block text-xs font-semibold text-muted-foreground">{label}</label>
            {children}
            {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
        </div>
    );
}

function FormField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1.5">
            <label className="block text-sm font-medium text-foreground">{label}</label>
            {children}
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
    );
}

const inputCls = "w-full h-9 rounded-lg bg-secondary border border-border px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors disabled:opacity-50";

function TextInput({ value, onChange, placeholder, disabled }: { value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }) {
    return <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} className={inputCls} />;
}

function SecretInput({ value, onChange, placeholder, isSet }: { value: string; onChange: (v: string) => void; placeholder?: string; isSet: boolean }) {
    const [editing, setEditing] = useState(!isSet);
    const [visible, setVisible] = useState(false);

    useEffect(() => { if (isSet) { setEditing(false); setVisible(false); } }, [isSet]);

    const cancelEditing = () => { onChange(""); setEditing(false); setVisible(false); };

    if (!isSet || editing) {
        return (
            <div className="space-y-1.5">
                <div className="relative">
                    <input type={visible ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus={isSet && editing} className={`${inputCls} pr-10`} />
                    <button type="button" tabIndex={-1} onClick={() => setVisible((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                        {visible ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                </div>
                {isSet && (
                    <button type="button" onClick={cancelEditing} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                        <X size={11} /> Cancel
                    </button>
                )}
                {!isSet && (
                    <p className="text-xs text-muted-foreground">Ensure before saving</p>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-1.5">
            <div className="w-full h-9 rounded-lg bg-secondary border border-border px-3 text-sm flex items-center gap-2 cursor-default select-none">
                <span className="text-muted-foreground tracking-widest text-base leading-none">••••••••••••</span>
                <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">
                    <Check size={10} /> Saved
                </span>
            </div>
            <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                <Pencil size={11} /> Edit
            </button>
        </div>
    );
}

function ModeSelect({ value, options, onChange }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
    return (
        <div className="relative">
            <select value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} appearance-none pr-8 cursor-pointer`}>
                {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENT ADMIN SETTINGS (2 tabs: General with Branding + Email)
// ═══════════════════════════════════════════════════════════════════════════════

const LOGO_ASPECT = 480 / 145;

function ClientGeneralTab({ data, onSaved, pushToast }: { data: SiteSettingsOut["general"]; onSaved: (u: SiteSettingsOut["general"]) => void; pushToast: (msg: string, type?: ToastType) => void }) {
    const [siteTitle, setSiteTitle] = useState(data.site_title ?? "");
    const [siteUrl, setSiteUrl] = useState(data.site_url ?? "");
    const [tagline, setTagline] = useState(data.tagline ?? "");
    const [language, setLanguage] = useState(data.site_language ?? "en");
    const [copyrightText, setCopyrightText] = useState(data.copyright_text ?? "");
    const [address1, setAddress1] = useState(data.address1 ?? "");
    const [address2, setAddress2] = useState(data.address2 ?? "");
    const [phone, setPhone] = useState(data.phone ?? "");
    const [contactEmail, setContactEmail] = useState(data.contact_email ?? "");
    const [youtubeUrl, setYoutubeUrl] = useState(data.youtube_url ?? "");
    const [instagramUrl, setInstagramUrl] = useState(data.instagram_url ?? "");
    const [facebookUrl, setFacebookUrl] = useState(data.facebook_url ?? "");
    const [logoUrl, setLogoUrl] = useState<string | null>(data.logo_url);
    const [logoS3Key, setLogoS3Key] = useState<string | null>(data.logo_s3_key);
    const [faviconUrl, setFaviconUrl] = useState<string | null>(data.favicon_url);
    const [faviconS3Key, setFaviconS3Key] = useState<string | null>(data.favicon_s3_key);
    const [faviconUploading, setFaviconUploading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [cropSrc, setCropSrc] = useState<string | null>(null);
    const [cropFile, setCropFile] = useState<File | null>(null);
    const [crop, setCrop] = useState<Crop>();
    const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
    const [saving, setSaving] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);

    useEffect(() => {
        setSiteTitle(data.site_title ?? ""); setSiteUrl(data.site_url ?? ""); setTagline(data.tagline ?? ""); setLanguage(data.site_language ?? "en");
        setCopyrightText(data.copyright_text ?? ""); setAddress1(data.address1 ?? ""); setAddress2(data.address2 ?? "");
        setPhone(data.phone ?? ""); setContactEmail(data.contact_email ?? ""); setYoutubeUrl(data.youtube_url ?? "");
        setInstagramUrl(data.instagram_url ?? ""); setFacebookUrl(data.facebook_url ?? "");
        setLogoUrl(data.logo_url); setLogoS3Key(data.logo_s3_key);
        setFaviconUrl(data.favicon_url); setFaviconS3Key(data.favicon_s3_key);
    }, [data]);

    const openCropModal = useCallback((file: File) => {
        if (!file.type.startsWith("image/")) { pushToast("Please select an image file (JPEG, PNG, or WebP).", "error"); return; }
        if (file.size > 10 * 1024 * 1024) { pushToast("Logo must be under 10 MB.", "error"); return; }
        setCropSrc(URL.createObjectURL(file)); setCropFile(file); setCrop(undefined); setCompletedCrop(null);
    }, [pushToast]);

    const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
        const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
        setCrop(centerCrop(makeAspectCrop({ unit: "%", width: 90 }, LOGO_ASPECT, w, h), w, h));
    }, []);

    const handleCropCancel = useCallback(() => {
        if (cropSrc) URL.revokeObjectURL(cropSrc);
        setCropSrc(null); setCropFile(null); setCrop(undefined); setCompletedCrop(null);
    }, [cropSrc]);

    const handleCropConfirm = useCallback(async () => {
        if (!completedCrop?.width || !imgRef.current || !cropFile) return;
        const canvas = document.createElement("canvas");
        canvas.width = 480; canvas.height = 145;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const img = imgRef.current;
        const scaleX = img.naturalWidth / img.width;
        const scaleY = img.naturalHeight / img.height;
        ctx.drawImage(img, completedCrop.x * scaleX, completedCrop.y * scaleY, completedCrop.width * scaleX, completedCrop.height * scaleY, 0, 0, 480, 145);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
        if (!blob) { pushToast("Failed to process image.", "error"); return; }
        const capturedSrc = cropSrc; const capturedName = cropFile.name.replace(/\.[^.]+$/, ".png");
        if (capturedSrc) URL.revokeObjectURL(capturedSrc);
        setCropSrc(null); setCropFile(null); setCrop(undefined); setCompletedCrop(null);
        setUploading(true);
        try {
            const { upload_url, s3_key } = await presignLogoUpload({ filename: capturedName, content_type: "image/png", file_size: blob.size });
            const putRes = await fetch(upload_url, { method: "PUT", headers: { "Content-Type": "image/png" }, body: blob });
            if (!putRes.ok) throw new Error("S3 upload failed");
            const saved = await saveSiteSettings({ general: { logo_s3_key: s3_key } });
            setLogoS3Key(s3_key); setLogoUrl(saved.general.logo_url); onSaved(saved.general);
            pushToast("Logo uploaded successfully.");
        } catch { pushToast("Logo upload failed. Please try again.", "error"); }
        finally { setUploading(false); }
    }, [completedCrop, cropFile, cropSrc, onSaved, pushToast]);

    const handleRemoveLogo = useCallback(() => {
        setLogoUrl(null); setLogoS3Key(null);
        saveSiteSettings({ general: { clear_logo: true } }).then((s) => onSaved(s.general)).catch(() => pushToast("Failed to remove logo.", "error"));
    }, [onSaved, pushToast]);

    const handleFaviconUpload = useCallback(async (file: File) => {
        if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) {
            pushToast("Favicon must be an image smaller than 2 MB.", "error");
            return;
        }
        setFaviconUploading(true);
        try {
            const { upload_url, s3_key } = await presignLogoUpload({ filename: file.name, content_type: file.type, file_size: file.size, asset_type: "favicon" });
            const upload = await fetch(upload_url, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
            if (!upload.ok) throw new Error("Favicon upload failed");
            const saved = await saveSiteSettings({ general: { favicon_s3_key: s3_key } });
            setFaviconUrl(saved.general.favicon_url); setFaviconS3Key(saved.general.favicon_s3_key); onSaved(saved.general);
            pushToast("Favicon uploaded successfully.");
        } catch { pushToast("Favicon upload failed. Please try again.", "error"); }
        finally { setFaviconUploading(false); }
    }, [onSaved, pushToast]);

    const handleRemoveFavicon = useCallback(() => {
        setFaviconUrl(null); setFaviconS3Key(null);
        saveSiteSettings({ general: { clear_favicon: true } }).then((s) => onSaved(s.general)).catch(() => pushToast("Failed to remove favicon.", "error"));
    }, [onSaved, pushToast]);

    const handleSave = useCallback(async () => {
        setSaving(true);
        try {
            const payload: GeneralSettingsIn = { site_title: siteTitle || null, site_url: siteUrl || null, tagline: tagline || null, site_language: language, copyright_text: copyrightText || null, address1: address1 || null, address2: address2 || null, phone: phone || null, contact_email: contactEmail || null, youtube_url: youtubeUrl || null, instagram_url: instagramUrl || null, facebook_url: facebookUrl || null };
            const saved = await saveSiteSettings({ general: payload });
            onSaved(saved.general); pushToast("General settings saved.");
        } catch { pushToast("Failed to save settings.", "error"); }
        finally { setSaving(false); }
    }, [siteTitle, siteUrl, tagline, language, copyrightText, address1, address2, phone, contactEmail, youtubeUrl, instagramUrl, facebookUrl, onSaved, pushToast]);

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-stretch">
                <SectionCard>
                    <SectionHeading>Branding</SectionHeading>
                    <Field label="Site Logo (480 × 145 px)" hint="JPEG, PNG, or WebP · Max 10 MB · Will be cropped to 480 × 145 px">
                        <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
                            onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) openCropModal(f); }}
                            onClick={() => !uploading && fileRef.current?.click()}
                            className={`relative rounded-xl border-2 overflow-hidden transition-colors cursor-pointer ${dragOver ? "border-primary bg-primary/5" : logoUrl ? "border-border" : "border-dashed border-border hover:border-primary/50 group"}`}>
                            {logoUrl ? (
                                <div className="relative aspect-[480/145]">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={logoUrl} alt="Site logo" className="w-full h-full object-contain bg-secondary" />
                                    {uploading ? (
                                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center"><Loader2 size={20} className="animate-spin text-white" /></div>
                                    ) : (
                                        <div className="absolute inset-0 bg-black/0 hover:bg-black/50 transition-colors flex items-center justify-center gap-2 group">
                                            <button type="button" onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }} className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/70 text-white text-xs font-medium transition-opacity"><Upload size={12} /> Replace</button>
                                            <button type="button" onClick={(e) => { e.stopPropagation(); handleRemoveLogo(); }} className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2 py-1.5 rounded-lg bg-red-500/80 text-white text-xs font-medium transition-opacity"><X size={12} /></button>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="aspect-[480/145] flex flex-col items-center justify-center gap-2 text-muted-foreground group-hover:text-foreground transition-colors">
                                    {uploading ? <Loader2 size={20} className="animate-spin text-primary" /> : <><Upload size={20} /><p className="text-xs font-medium">Click or drag image here</p></>}
                                </div>
                            )}
                        </div>
                        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) openCropModal(f); e.target.value = ""; }} />
                    </Field>
                    <Field label="Favicon" hint="Optional square PNG, JPEG, or WebP · Max 2 MB. Falls back to the first brand letter when not set.">
                        <div className="flex items-center gap-3">
                            <label className="flex h-14 w-14 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-border bg-secondary hover:border-primary/50">
                                {faviconUrl ? <img src={faviconUrl} alt="Favicon preview" className="h-full w-full object-contain" /> : <span className="text-xl font-bold text-primary">{siteTitle.trim().charAt(0).toUpperCase() || "S"}</span>}
                                <input type="file" accept="image/png,image/jpeg,image/webp,image/x-icon" className="hidden" disabled={faviconUploading} onChange={(e) => { const file = e.target.files?.[0]; if (file) void handleFaviconUpload(file); e.target.value = ""; }} />
                            </label>
                            {faviconS3Key && <button type="button" onClick={handleRemoveFavicon} className="text-xs text-muted-foreground hover:text-foreground">Remove</button>}
                            {faviconUploading && <Loader2 size={14} className="animate-spin text-primary" />}
                        </div>
                    </Field>
                    <Field label="Site Title" hint="Displayed in the browser tab and SEO.">
                        <input type="text" value={siteTitle} onChange={(e) => setSiteTitle(e.target.value)} placeholder="My Streaming Platform" className={inputCls} />
                    </Field>
                    <Field label="Site URL" hint="Your public storefront URL. Required for Cashfree payment return URLs.">
                        <input type="url" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} placeholder="https://example.com" className={inputCls} />
                    </Field>
                    <Field label="Tagline" hint="Short description shown on the homepage.">
                        <input type="text" value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Stream anything, anywhere." className={inputCls} />
                    </Field>
                    <Field label="Site Language" hint="Primary language of the platform UI.">
                        <div className="relative">
                            <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full h-9 rounded-lg bg-secondary border border-border px-3 pr-8 text-sm text-foreground appearance-none focus:outline-none focus:ring-1 focus:ring-primary transition-colors">
                                {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                            </select>
                            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                        </div>
                    </Field>
                    <Field label="Copyright Text" hint="Shown in the site footer.">
                        <input type="text" value={copyrightText} onChange={(e) => setCopyrightText(e.target.value)} placeholder="© 2025 My Platform. All rights reserved." className={inputCls} />
                    </Field>
                </SectionCard>

                <div className="flex h-full flex-col gap-6">
                    <SectionCard className="flex-1">
                        <SectionHeading>Contact</SectionHeading>
                        <Field label="Address 1"><input type="text" value={address1} onChange={(e) => setAddress1(e.target.value)} placeholder="123 Main Street" className={inputCls} /></Field>
                        <Field label="Address 2"><input type="text" value={address2} onChange={(e) => setAddress2(e.target.value)} placeholder="Suite 100, Building A" className={inputCls} /></Field>
                        <div className="grid grid-cols-2 gap-4">
                            <Field label="Phone"><input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 (555) 000-0000" className={inputCls} /></Field>
                            <Field label="Email"><input type="text" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="contact@example.com" className={inputCls} /></Field>
                        </div>
                    </SectionCard>
                    <SectionCard className="flex-1">
                        <SectionHeading>Social Links</SectionHeading>
                        <Field label="YouTube URL"><input type="text" value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} placeholder="https://youtube.com/@channel" className={inputCls} /></Field>
                        <Field label="Instagram URL"><input type="text" value={instagramUrl} onChange={(e) => setInstagramUrl(e.target.value)} placeholder="https://instagram.com/handle" className={inputCls} /></Field>
                        <Field label="Facebook URL"><input type="text" value={facebookUrl} onChange={(e) => setFacebookUrl(e.target.value)} placeholder="https://facebook.com/page" className={inputCls} /></Field>
                    </SectionCard>
                </div>
            </div>

            <div className="flex justify-end pt-2">
                <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    {saving ? "Saving…" : "Save General Settings"}
                </button>
            </div>

            {cropSrc && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                    <div className="w-full max-w-2xl space-y-4 rounded-2xl border border-border bg-card p-6 shadow-xl">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">Crop Logo</h3>
                            <button type="button" onClick={handleCropCancel} className="text-muted-foreground transition-colors hover:text-foreground"><X size={18} /></button>
                        </div>
                        <p className="text-[11px] text-muted-foreground">Adjust the crop area to fit the 480 × 145 logo dimensions.</p>
                        <div className="overflow-auto rounded-xl bg-secondary p-2" style={{ maxHeight: "60vh" }}>
                            <ReactCrop crop={crop} onChange={(c) => setCrop(c)} onComplete={(c) => setCompletedCrop(c)} aspect={LOGO_ASPECT} minWidth={100}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img ref={imgRef} src={cropSrc} alt="Crop preview" onLoad={onImageLoad} style={{ maxWidth: "100%", display: "block" }} />
                            </ReactCrop>
                        </div>
                        <div className="flex justify-end gap-3 border-t border-border pt-4">
                            <button type="button" onClick={handleCropCancel} className="h-9 rounded-lg border border-border px-4 text-sm text-foreground transition-colors hover:bg-secondary">Cancel</button>
                            <button type="button" onClick={handleCropConfirm} disabled={uploading || !completedCrop?.width} className="flex items-center gap-2 h-9 rounded-lg bg-primary px-4 text-sm text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
                                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                {uploading ? "Uploading…" : "Crop & Upload"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function ClientEmailTab({ data, onSaved, pushToast }: { data: SiteSettingsOut["email"]; onSaved: (u: SiteSettingsOut["email"]) => void; pushToast: (msg: string, type?: ToastType) => void }) {
    const [adminEmail, setAdminEmail] = useState(data.admin_email ?? "");
    const [mailServer, setMailServer] = useState(data.mail_server ?? "");
    const [mailPort, setMailPort] = useState(data.mail_port?.toString() ?? "");
    const [mailLogin, setMailLogin] = useState(data.mail_login ?? "");
    const [mailPassword, setMailPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [saving, setSaving] = useState(false);
    const [testToEmail, setTestToEmail] = useState("");
    const [testSubject, setTestSubject] = useState("SMTP configuration test");
    const [testMessage, setTestMessage] = useState("This is a test email from StreamTVDepot SMTP settings.");
    const [testing, setTesting] = useState(false);
    const [lastTestDebug, setLastTestDebug] = useState<SmtpDebug | null>(null);

    useEffect(() => {
        setAdminEmail(data.admin_email ?? ""); setMailServer(data.mail_server ?? "");
        setMailPort(data.mail_port?.toString() ?? ""); setMailLogin(data.mail_login ?? "");
    }, [data]);

    const adminEmailError = adminEmail.trim() && !isValidEmail(adminEmail) ? "Enter a valid administration email." : "";
    const parsedPort = mailPort ? Number(mailPort) : null;
    const portError = mailPort && (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535)
        ? "Port must be an integer between 1 and 65535."
        : "";
    const canSave = !saving && !adminEmailError && !portError;

    const testEmailError = !testToEmail.trim() ? "Recipient email is required." : (!isValidEmail(testToEmail) ? "Enter a valid recipient email." : "");
    const testSubjectError = !testSubject.trim() ? "Subject is required." : "";
    const testMessageError = !testMessage.trim() ? "Message is required." : "";
    const canTest = !testing && !testEmailError && !testSubjectError && !testMessageError;

    const handleSave = useCallback(async () => {
        if (adminEmailError || portError) {
            pushToast(adminEmailError || portError, "error");
            return;
        }
        setSaving(true);
        try {
            const payload: EmailSettingsIn = { admin_email: adminEmail || null, mail_server: mailServer || null, mail_port: mailPort ? parseInt(mailPort, 10) : null, mail_login: mailLogin || null };
            if (mailPassword) payload.mail_password = mailPassword;
            const saved = await saveSiteSettings({ email: payload });
            onSaved(saved.email); setMailPassword(""); pushToast("Email settings saved.");
        } catch (error) {
            pushToast(parseApiError(error).message || "Failed to save settings.", "error");
        }
        finally { setSaving(false); }
    }, [adminEmail, adminEmailError, portError, mailServer, mailPort, mailLogin, mailPassword, onSaved, pushToast]);

    const handleTest = useCallback(async () => {
        if (testEmailError || testSubjectError || testMessageError) {
            pushToast(testEmailError || testSubjectError || testMessageError, "error");
            return;
        }
        setLastTestDebug(null);
        setTesting(true);
        try {
            const res = await testSiteSmtpConnection({
                to_email: testToEmail.trim(),
                subject: testSubject.trim(),
                message: testMessage.trim(),
                mail_server: mailServer.trim() || undefined,
                mail_port: mailPort ? parseInt(mailPort, 10) : undefined,
                mail_login: mailLogin.trim() || undefined,
                mail_password: mailPassword || undefined,
            });
            setLastTestDebug(res.debug || null);
            pushToast(res.message || "Test email sent successfully.");
        } catch (error) {
            const parsed = parseApiError(error);
            setLastTestDebug(parsed.debug || null);
            pushToast(parsed.message || "SMTP test failed. Please verify server, port, login and password.", "error");
        } finally {
            setTesting(false);
        }
    }, [testEmailError, testSubjectError, testMessageError, testToEmail, testSubject, testMessage, mailServer, mailPort, mailLogin, mailPassword, pushToast]);

    const isBrevo = mailServer.trim().toLowerCase() === "smtp-relay.brevo.com";
    const loginLooksInvalid = isBrevo && mailLogin.trim() !== "" && !mailLogin.includes("@");

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
                <SectionCard>
                    <SectionHeading>Email Settings</SectionHeading>
                    {isBrevo && (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 space-y-1">
                            <p className="text-xs font-semibold text-amber-400">Brevo SMTP detected</p>
                            <ul className="text-[11px] text-muted-foreground space-y-0.5 list-disc list-inside">
                                <li><span className="font-medium text-foreground">Login</span>: your Brevo <span className="font-medium text-foreground">account email address</span> (e.g. you@company.com) — <em>not</em> the SMTP key name</li>
                                <li><span className="font-medium text-foreground">Password</span>: the SMTP key <span className="font-medium text-foreground">value</span> starting with <code className="text-amber-300">xsmtpsib-</code></li>
                            </ul>
                        </div>
                    )}
                    <div className="space-y-4">
                        <FormField label="Administration Email Address" hint="System notifications and alerts are sent to this address.">
                            <TextInput value={adminEmail} onChange={setAdminEmail} placeholder="admin@example.com" />
                            {adminEmailError && <p className="text-xs text-destructive">{adminEmailError}</p>}
                        </FormField>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormField label="Mail Server" hint="Hostname of your SMTP server."><TextInput value={mailServer} onChange={setMailServer} placeholder="smtp.example.com" /></FormField>
                            <FormField label="Port" hint="Usually 587 (STARTTLS) or 465 (SSL).">
                                <input type="number" value={mailPort} onChange={(e) => setMailPort(e.target.value)} placeholder="587" min={1} max={65535} className={inputCls} />
                                {portError && <p className="text-xs text-destructive">{portError}</p>}
                            </FormField>
                            <FormField label="Login Name" hint="SMTP username / email address.">
                                <TextInput value={mailLogin} onChange={setMailLogin} placeholder="you@company.com" />
                                {loginLooksInvalid && <p className="text-xs text-amber-400">Brevo login must be your account email address, not a name like &quot;{mailLogin}&quot;.</p>}
                            </FormField>
                            <FormField label="Password" hint={data.mail_password_set ? "A password is saved. Enter a new value to replace it." : "Leave blank to keep the current password."}>
                                <div className="relative">
                                    <input type={showPassword ? "text" : "password"} value={mailPassword} onChange={(e) => setMailPassword(e.target.value)} placeholder={data.mail_password_set ? "••••••••" : "Enter password"} className={`${inputCls} pr-10`} />
                                    <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                                        {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                                    </button>
                                </div>
                            </FormField>
                        </div>
                    </div>
                </SectionCard>

                <SectionCard>
                    <SectionHeading>SMTP Connection Test</SectionHeading>
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormField label="Test Recipient Email" hint="Where the test email should be sent.">
                                <TextInput value={testToEmail} onChange={setTestToEmail} placeholder="you@example.com" />
                                {testEmailError && <p className="text-xs text-destructive">{testEmailError}</p>}
                            </FormField>
                            <FormField label="Subject" hint="Required subject for test delivery.">
                                <TextInput value={testSubject} onChange={setTestSubject} placeholder="SMTP configuration test" />
                                {testSubjectError && <p className="text-xs text-destructive">{testSubjectError}</p>}
                            </FormField>
                            <div className="md:col-span-2">
                                <FormField label="Message" hint="Write any text to verify outgoing mail works.">
                                    <textarea value={testMessage} onChange={(e) => setTestMessage(e.target.value)} rows={4} className="w-full rounded-lg bg-secondary border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors resize-y" placeholder="This is a test email from StreamTVDepot SMTP settings." />
                                    {testMessageError && <p className="text-xs text-destructive">{testMessageError}</p>}
                                </FormField>
                            </div>
                        </div>
                        <SmtpDebugPanel debug={lastTestDebug} />
                        <div className="flex justify-end">
                            <button type="button" onClick={handleTest} disabled={!canTest} className="flex items-center gap-2 px-5 py-2 rounded-lg border border-border bg-secondary text-foreground text-sm font-medium hover:bg-secondary/80 transition-colors disabled:opacity-50">
                                {testing ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                {testing ? "Testing…" : "Test Connection"}
                            </button>
                        </div>
                    </div>
                </SectionCard>
            </div>

            <div className="flex justify-end pt-2">
                <button onClick={handleSave} disabled={!canSave} className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    {saving ? "Saving…" : "Save Email Settings"}
                </button>
            </div>
        </div>
    );
}

// ─── Social Auth Tab ──────────────────────────────────────────────────────────

function ClientSocialAuthTab({ data, onSaved, pushToast }: { data: SiteSettingsOut["social_auth"]; onSaved: (u: SiteSettingsOut["social_auth"]) => void; pushToast: (msg: string, type?: ToastType) => void }) {
    const googleData = data?.google ?? { enabled: false, client_id: null, redirect_uri: null, client_secret_set: false };
    const [googleEnabled, setGoogleEnabled] = useState(googleData.enabled ?? false);
    const [googleClientId, setGoogleClientId] = useState(googleData.client_id ?? "");
    const [googleClientSecret, setGoogleClientSecret] = useState("");
    const [googleRedirectUri, setGoogleRedirectUri] = useState(googleData.redirect_uri ?? "");
    const [showSecret, setShowSecret] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setGoogleEnabled(data?.google?.enabled ?? false);
        setGoogleClientId(data?.google?.client_id ?? "");
        setGoogleRedirectUri(data?.google?.redirect_uri ?? "");
    }, [data?.google?.enabled, data?.google?.client_id, data?.google?.redirect_uri]);

    const canSave = !saving;

    const handleSave = useCallback(async () => {
        const hasGoogleCredentials = Boolean(
            googleClientId.trim()
            && googleRedirectUri.trim()
            && (googleClientSecret.trim() || googleData.client_secret_set),
        );
        if (googleEnabled && !hasGoogleCredentials) {
            pushToast("Enter the Google Client ID, Client Secret, and Redirect URI before enabling Google Sign-In.", "error");
            return;
        }

        setSaving(true);
        try {
            const payload: SocialAuthSettingsIn = {
                google: {
                    enabled: googleEnabled,
                    client_id: googleClientId.trim() || null,
                    client_secret: googleClientSecret.trim() || null,
                    redirect_uri: googleRedirectUri.trim() || null,
                } as GoogleOAuthSettingsIn,
            };
            const saved = await saveSiteSettings({ social_auth: payload });
            onSaved(saved.social_auth);
            setGoogleClientSecret("");
            pushToast("Social auth settings saved.");
        } catch (error) {
            pushToast(parseApiError(error).message || "Failed to save settings.", "error");
        } finally {
            setSaving(false);
        }
    }, [googleData.client_secret_set, googleEnabled, googleClientId, googleClientSecret, googleRedirectUri, onSaved, pushToast]);

    return (
        <div className="space-y-6">
            <SectionCard>
                <div className="flex items-center justify-between gap-4 mb-4">
                    <div>
                        <p className="text-sm font-bold text-foreground uppercase tracking-wide">Google OAuth2</p>
                        <p className="text-xs text-muted-foreground">Allow users to sign in with their Google account</p>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${googleEnabled ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-muted text-muted-foreground border border-border"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${googleEnabled ? "bg-emerald-400" : "bg-muted-foreground"}`} />
                        {googleEnabled ? "Enabled" : "Disabled"}
                    </span>
                </div>
                <div className="border-t border-border mb-4" />
                <LabeledSwitch checked={googleEnabled} onCheckedChange={setGoogleEnabled} label="Enable Google Sign-In" />

                {googleEnabled && (
                    <div className="mt-6 space-y-4">
                        <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 px-4 py-3 space-y-2">
                            <p className="text-xs font-semibold text-blue-400">Google OAuth2 Setup</p>
                            <ol className="text-[11px] text-muted-foreground space-y-1 list-decimal list-inside">
                                <li>Go to <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">Google Cloud Console</a></li>
                                <li>Create or select your project</li>
                                <li>Enable the Google+ API</li>
                                <li>Create OAuth2 credentials (Web Application type)</li>
                                <li>Add your Redirect URI to authorized URIs in Google Cloud Console</li>
                                <li>Copy Client ID and Client Secret below</li>
                            </ol>
                        </div>

                        <FormField label="Client ID" hint="OAuth2 Client ID from Google Cloud Console">
                            <TextInput value={googleClientId} onChange={setGoogleClientId} placeholder="YOUR_CLIENT_ID.apps.googleusercontent.com" />
                        </FormField>

                        <FormField label="Client Secret" hint={googleData.client_secret_set ? "A secret is saved. Enter a new value to replace it." : "Leave blank to keep the current secret."}>
                            <div className="relative">
                                <input
                                    type={showSecret ? "text" : "password"}
                                    value={googleClientSecret}
                                    onChange={(e) => setGoogleClientSecret(e.target.value)}
                                    placeholder={googleData.client_secret_set ? "••••••••" : "Enter client secret"}
                                    className={`${inputCls} pr-10`}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowSecret((v) => !v)}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                    tabIndex={-1}
                                >
                                    {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                            </div>
                        </FormField>

                        <FormField label="Redirect URI" hint="The callback URL where users return after authentication">
                            <TextInput value={googleRedirectUri} onChange={setGoogleRedirectUri} placeholder="https://yourdomain.com/auth/callback" />
                        </FormField>
                    </div>
                )}
            </SectionCard>

            <div className="flex justify-end pt-2">
                <button onClick={handleSave} disabled={!canSave} className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    {saving ? "Saving…" : "Save Social Auth Settings"}
                </button>
            </div>
        </div>
    );
}

function ClientAdminSettings() {
    const [activeTab, setActiveTab] = useState<"General" | "Email" | "Social Auth">("General");
    const [settings, setSettings] = useState<SiteSettingsOut | null>(null);
    const [loading, setLoading] = useState(true);
    const { toasts, push: pushToast, dismiss } = useToast();

    const load = useCallback(async () => {
        setLoading(true);
        try { setSettings(await fetchSiteSettings()); }
        catch { pushToast("Failed to load settings.", "error"); }
        finally { setLoading(false); }
    }, [pushToast]);

    useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

    return (
        <div className="p-6 md:p-8 space-y-6 max-w-4xl">
            <div className="space-y-1">
                <h1 className="text-2xl font-display font-bold text-foreground">Settings</h1>
                <p className="text-sm text-muted-foreground">Configure your platform's identity, branding, and email delivery.</p>
            </div>
            <div className="flex gap-1 border-b border-border">
                {(["General", "Email", "Social Auth"] as const).map((tab) => (
                    <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{tab}</button>
                ))}
            </div>
            <div className="pt-2">
                {loading || !settings ? (
                    <div className="space-y-5">{[...Array(4)].map((_, i) => (<div key={i} className="space-y-2"><div className="h-4 w-28 rounded bg-muted animate-pulse" /><div className="h-10 rounded-lg bg-muted animate-pulse" /></div>))}</div>
                ) : (
                    <>
                        {activeTab === "General" && <ClientGeneralTab data={settings.general} onSaved={(general) => setSettings((p) => p ? { ...p, general } : p)} pushToast={pushToast} />}
                        {activeTab === "Email" && <ClientEmailTab data={settings.email} onSaved={(email) => setSettings((p) => p ? { ...p, email } : p)} pushToast={pushToast} />}
                        {activeTab === "Social Auth" && <ClientSocialAuthTab data={settings.social_auth} onSaved={(social_auth) => setSettings((p) => p ? { ...p, social_auth } : p)} pushToast={pushToast} />}
                    </>
                )}
            </div>
            <ToastStack toasts={toasts} onDismiss={dismiss} />
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUPERADMIN SETTINGS (3 tabs: General + Email + Payment Gateway)
// ═══════════════════════════════════════════════════════════════════════════════

function SAGeneralTab({ data, onSaved, pushToast }: { data: SuperadminSettingsOut["general"]; onSaved: (u: SuperadminSettingsOut["general"]) => void; pushToast: (msg: string, type?: ToastType) => void }) {
    const [companyName, setCompanyName] = useState(data.company_name ?? "");
    const [contactEmail, setContactEmail] = useState(data.contact_email ?? "");
    const [phone, setPhone] = useState(data.phone ?? "");
    const [address1, setAddress1] = useState(data.address1 ?? "");
    const [address2, setAddress2] = useState(data.address2 ?? "");
    const [youtubeUrl, setYoutubeUrl] = useState(data.youtube_url ?? "");
    const [instagramUrl, setInstagramUrl] = useState(data.instagram_url ?? "");
    const [facebookUrl, setFacebookUrl] = useState(data.facebook_url ?? "");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setCompanyName(data.company_name ?? ""); setContactEmail(data.contact_email ?? ""); setPhone(data.phone ?? "");
        setAddress1(data.address1 ?? ""); setAddress2(data.address2 ?? ""); setYoutubeUrl(data.youtube_url ?? "");
        setInstagramUrl(data.instagram_url ?? ""); setFacebookUrl(data.facebook_url ?? "");
    }, [data]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault(); setSaving(true);
        try {
            const payload: SuperadminGeneralSettingsIn = { company_name: companyName || null, contact_email: contactEmail || null, phone: phone || null, address1: address1 || null, address2: address2 || null, youtube_url: youtubeUrl || null, instagram_url: instagramUrl || null, facebook_url: facebookUrl || null };
            const saved = await saveSuperadminSettings({ general: payload });
            onSaved(saved.general); pushToast("General settings saved.");
        } catch { pushToast("Failed to save settings.", "error"); }
        finally { setSaving(false); }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
                <SectionCard>
                    <SectionHeading>Contact</SectionHeading>
                    <Field label="Company Name"><input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Mitiz Technologies" className={inputCls} /></Field>
                    <Field label="Address Line 1"><input type="text" value={address1} onChange={(e) => setAddress1(e.target.value)} placeholder="123 Main Street" className={inputCls} /></Field>
                    <Field label="Address Line 2"><input type="text" value={address2} onChange={(e) => setAddress2(e.target.value)} placeholder="Suite 100, Building A" className={inputCls} /></Field>
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Phone"><input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 (555) 000-0000" className={inputCls} /></Field>
                        <Field label="Contact Email"><input type="text" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="admin@example.com" className={inputCls} /></Field>
                    </div>
                </SectionCard>
                <SectionCard>
                    <SectionHeading>Social Links</SectionHeading>
                    <Field label="YouTube URL"><input type="text" value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} placeholder="https://youtube.com/@channel" className={inputCls} /></Field>
                    <Field label="Instagram URL"><input type="text" value={instagramUrl} onChange={(e) => setInstagramUrl(e.target.value)} placeholder="https://instagram.com/handle" className={inputCls} /></Field>
                    <Field label="Facebook URL"><input type="text" value={facebookUrl} onChange={(e) => setFacebookUrl(e.target.value)} placeholder="https://facebook.com/page" className={inputCls} /></Field>
                </SectionCard>
            </div>
            <div className="flex justify-end pt-2">
                <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    {saving ? "Saving…" : "Save General Settings"}
                </button>
            </div>
        </form>
    );
}

function SAEmailTab({ data, onSaved, pushToast }: { data: SuperadminSettingsOut["email"]; onSaved: (u: SuperadminSettingsOut["email"]) => void; pushToast: (msg: string, type?: ToastType) => void }) {
    const [adminEmail, setAdminEmail] = useState(data.admin_email ?? "");
    const [mailServer, setMailServer] = useState(data.mail_server ?? "");
    const [mailPort, setMailPort] = useState(data.mail_port?.toString() ?? "");
    const [mailLogin, setMailLogin] = useState(data.mail_login ?? "");
    const [mailPassword, setMailPassword] = useState("");
    const [saving, setSaving] = useState(false);
    const [testToEmail, setTestToEmail] = useState("");
    const [testSubject, setTestSubject] = useState("SMTP configuration test");
    const [testMessage, setTestMessage] = useState("This is a test email from StreamTVDepot SMTP settings.");
    const [testing, setTesting] = useState(false);
    const [lastTestDebug, setLastTestDebug] = useState<SmtpDebug | null>(null);

    useEffect(() => {
        setAdminEmail(data.admin_email ?? ""); setMailServer(data.mail_server ?? "");
        setMailPort(data.mail_port?.toString() ?? ""); setMailLogin(data.mail_login ?? "");
    }, [data]);

    const adminEmailError = adminEmail.trim() && !isValidEmail(adminEmail) ? "Enter a valid administration email." : "";
    const parsedPort = mailPort ? Number(mailPort) : null;
    const portError = mailPort && (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535)
        ? "Port must be an integer between 1 and 65535."
        : "";
    const canSave = !saving && !adminEmailError && !portError;

    const testEmailError = !testToEmail.trim() ? "Recipient email is required." : (!isValidEmail(testToEmail) ? "Enter a valid recipient email." : "");
    const testSubjectError = !testSubject.trim() ? "Subject is required." : "";
    const testMessageError = !testMessage.trim() ? "Message is required." : "";
    const canTest = !testing && !testEmailError && !testSubjectError && !testMessageError;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault(); setSaving(true);
        if (adminEmailError || portError) {
            pushToast(adminEmailError || portError, "error");
            setSaving(false);
            return;
        }
        try {
            const payload: SuperadminEmailSettingsIn = { admin_email: adminEmail || null, mail_server: mailServer || null, mail_port: mailPort ? parseInt(mailPort, 10) : null, mail_login: mailLogin || null };
            if (mailPassword) payload.mail_password = mailPassword;
            const saved = await saveSuperadminSettings({ email: payload });
            onSaved(saved.email); setMailPassword(""); pushToast("Email settings saved.");
        } catch (error) {
            pushToast(parseApiError(error).message || "Failed to save settings.", "error");
        }
        finally { setSaving(false); }
    };

    const handleTest = async () => {
        if (testEmailError || testSubjectError || testMessageError) {
            pushToast(testEmailError || testSubjectError || testMessageError, "error");
            return;
        }
        setLastTestDebug(null);
        setTesting(true);
        try {
            const res = await testSuperadminSmtpConnection({
                to_email: testToEmail.trim(),
                subject: testSubject.trim(),
                message: testMessage.trim(),
                mail_server: mailServer.trim() || undefined,
                mail_port: mailPort ? parseInt(mailPort, 10) : undefined,
                mail_login: mailLogin.trim() || undefined,
                mail_password: mailPassword || undefined,
            });
            setLastTestDebug(res.debug || null);
            pushToast(res.message || "Test email sent successfully.");
        } catch (error) {
            const parsed = parseApiError(error);
            setLastTestDebug(parsed.debug || null);
            pushToast(parsed.message || "SMTP test failed. Please verify server, port, login and password.", "error");
        } finally {
            setTesting(false);
        }
    };

    const isBrevo = mailServer.trim().toLowerCase() === "smtp-relay.brevo.com";
    const loginLooksInvalid = isBrevo && mailLogin.trim() !== "" && !mailLogin.includes("@");

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
                <SectionCard>
                    <SectionHeading>Email Settings</SectionHeading>
                    {isBrevo && (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 space-y-1">
                            <p className="text-xs font-semibold text-amber-400">Brevo SMTP detected</p>
                            <ul className="text-[11px] text-muted-foreground space-y-0.5 list-disc list-inside">
                                <li><span className="font-medium text-foreground">Login</span>: your Brevo <span className="font-medium text-foreground">account email address</span> (e.g. you@company.com) — <em>not</em> the SMTP key name</li>
                                <li><span className="font-medium text-foreground">Password</span>: the SMTP key <span className="font-medium text-foreground">value</span> starting with <code className="text-amber-300">xsmtpsib-</code></li>
                            </ul>
                        </div>
                    )}
                    <div className="space-y-4">
                        <Field label="Administration Email" hint="System notifications are sent to this address.">
                            <input type="text" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="admin@example.com" className={inputCls} />
                            {adminEmailError && <p className="text-xs text-destructive">{adminEmailError}</p>}
                        </Field>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Field label="Mail Server" hint="Hostname of your SMTP server."><input type="text" value={mailServer} onChange={(e) => setMailServer(e.target.value)} placeholder="smtp.example.com" className={inputCls} /></Field>
                            <Field label="Port" hint="Usually 587 (STARTTLS) or 465 (SSL)."><input type="number" value={mailPort} onChange={(e) => setMailPort(e.target.value)} placeholder="587" min={1} max={65535} className={inputCls} />{portError && <p className="text-xs text-destructive">{portError}</p>}</Field>
                            <Field label="Login / Username" hint={isBrevo ? "Your SMTP username / account email." : undefined}><input type="text" value={mailLogin} onChange={(e) => setMailLogin(e.target.value)} placeholder="you@company.com" className={inputCls} />{loginLooksInvalid && <p className="text-xs text-amber-400">Brevo login must be your account email, not a name like &quot;{mailLogin}&quot;.</p>}</Field>
                            <Field label="Password" hint={data.mail_password_set ? "A password is saved — enter a new value to replace it." : undefined}>
                                <SecretInput value={mailPassword} onChange={setMailPassword} placeholder={data.mail_password_set ? "••••••••" : "Enter password"} isSet={data.mail_password_set} />
                            </Field>
                        </div>
                    </div>
                </SectionCard>

                <SectionCard>
                    <SectionHeading>SMTP Connection Test</SectionHeading>
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Field label="Test Recipient Email" hint="Where the test email should be sent.">
                                <input type="text" value={testToEmail} onChange={(e) => setTestToEmail(e.target.value)} placeholder="you@example.com" className={inputCls} />
                                {testEmailError && <p className="text-xs text-destructive">{testEmailError}</p>}
                            </Field>
                            <Field label="Subject" hint="Required subject for test delivery.">
                                <input type="text" value={testSubject} onChange={(e) => setTestSubject(e.target.value)} placeholder="SMTP configuration test" className={inputCls} />
                                {testSubjectError && <p className="text-xs text-destructive">{testSubjectError}</p>}
                            </Field>
                            <div className="md:col-span-2 space-y-1">
                                <label className="block text-xs font-semibold text-muted-foreground">Message</label>
                                <textarea value={testMessage} onChange={(e) => setTestMessage(e.target.value)} rows={4} className="w-full rounded-lg bg-secondary border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors resize-y" placeholder="This is a test email from StreamTVDepot SMTP settings." />
                                {testMessageError && <p className="text-xs text-destructive">{testMessageError}</p>}
                                <p className="text-[11px] text-muted-foreground">Write any text to verify outgoing mail works.</p>
                            </div>
                        </div>
                        <SmtpDebugPanel debug={lastTestDebug} />
                        <div className="flex justify-end">
                            <button type="button" onClick={handleTest} disabled={!canTest} className="flex items-center gap-2 px-5 py-2 rounded-lg border border-border bg-secondary text-foreground text-sm font-medium hover:bg-secondary/80 transition-colors disabled:opacity-50">
                                {testing ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                {testing ? "Testing…" : "Test Connection"}
                            </button>
                        </div>
                    </div>
                </SectionCard>
            </div>

            <div className="flex justify-end pt-2">
                <button type="submit" disabled={!canSave} className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    {saving ? "Saving…" : "Save Email Settings"}
                </button>
            </div>
        </form>
    );
}

function SuperAdminSettings() {
    const [activeTab, setActiveTab] = useState<"General" | "Email">("General");
    const [settings, setSettings] = useState<SuperadminSettingsOut | null>(null);
    const [loading, setLoading] = useState(true);
    const { toasts, push: pushToast, dismiss } = useToast();

    useEffect(() => {
        fetchSuperadminSettings().then(setSettings).catch(() => pushToast("Failed to load settings.", "error")).finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="p-6 md:p-8 space-y-6">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><Settings size={18} className="text-primary" /></div>
                <div>
                    <h1 className="text-xl font-display font-bold text-foreground">Settings</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Manage platform-wide configuration exclusively for the superadmin.</p>
                </div>
            </div>
            <div className="flex gap-1 border-b border-border">
                {(["General", "Email"] as const).map((tab) => (
                    <button key={tab} onClick={() => setActiveTab(tab)} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                        {tab}
                    </button>
                ))}
            </div>
            <div className="pt-2">
                {loading || !settings ? (
                    <div className="space-y-5">{[...Array(3)].map((_, i) => (<div key={i} className="space-y-2"><div className="h-4 w-28 rounded bg-muted animate-pulse" /><div className="h-10 rounded-lg bg-muted animate-pulse" /></div>))}</div>
                ) : (
                    <>
                        {activeTab === "General" && <SAGeneralTab data={settings.general} onSaved={(general) => setSettings((p) => p ? { ...p, general } : p)} pushToast={pushToast} />}
                        {activeTab === "Email" && <SAEmailTab data={settings.email} onSaved={(email) => setSettings((p) => p ? { ...p, email } : p)} pushToast={pushToast} />}
                    </>
                )}
            </div>
            <ToastStack toasts={toasts} onDismiss={dismiss} />
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENTRY POINT — role-aware router
// ═══════════════════════════════════════════════════════════════════════════════

export default function AdminSettingsPage() {
    const { role } = useAdminAuth();
    if (role === "superadmin") return <SuperAdminSettings />;
    return <ClientAdminSettings />;
}
