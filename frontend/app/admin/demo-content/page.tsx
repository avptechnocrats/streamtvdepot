"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    Film, Music, Tag, Plus,
    ChevronDown, X, Upload, LoaderCircle,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";
import { CategoriesTab } from "./_components/CategoriesTab";
import { ContentTab } from "./_components/ContentTab";
import {
    listDemoContent, addDemoContent, updateDemoContent, removeDemoContent,
    listDemoCategories, createDemoCategory, updateDemoCategory, deleteDemoCategory,
    uploadDemoAsset, triggerDemoContentTranscode,
    type DemoContentItem, type DemoContentType, type DemoContentCreatePayload, type DemoContentUpdatePayload,
    type DemoCategoryOut, type DemoCategoryCreate,
} from "@/lib/api";

// ─── Constants ────────────────────────────────────────────────────────────────

type Tab = "video" | "audio" | "categories";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "categories",  label: "Categories",   icon: Tag    },
    { id: "video",       label: "Videos",      icon: Film   },
    { id: "audio",       label: "Audio",        icon: Music  },
];

const CONTENT_TYPES: { value: DemoContentType; label: string }[] = [
    { value: "audio",       label: "Audio"       },
    { value: "video",       label: "Video"       },
];

const CAT_CONTENT_TYPES = [
    { value: "audio", label: "Audio" },
    { value: "video", label: "Video" },
    { value: "channel", label: "Channel" },
];
const AGE_RATINGS = ["U", "U/A 7+", "U/A 13+", "U/A 16+", "A", "S"];
const PAGE_SIZE = 20;

const LANGUAGES = ["English", "Hindi", "Tamil", "Telugu", "Kannada", "Malayalam", "Bengali", "Marathi", "Gujarati", "Punjabi", "Urdu"];
const LANGUAGE_OPTIONS = LANGUAGES.map(language => ({ value: language, label: language }));

async function getMediaDuration(file: File): Promise<number | null> {
    if (!file.type.startsWith("audio/") && !file.type.startsWith("video/")) return null;

    return new Promise(resolve => {
        const media = document.createElement(file.type.startsWith("audio/") ? "audio" : "video");
        const objectUrl = URL.createObjectURL(file);
        const cleanup = (duration: number | null) => {
            URL.revokeObjectURL(objectUrl);
            resolve(duration);
        };
        media.preload = "metadata";
        media.onloadedmetadata = () => cleanup(Number.isFinite(media.duration) ? Math.round(media.duration) : null);
        media.onerror = () => cleanup(null);
        media.src = objectUrl;
    });
}

// ─── Input style ──────────────────────────────────────────────────────────────

const INPUT = "w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary";
const LABEL = "text-xs font-medium text-muted-foreground uppercase tracking-wider";

function ModalLayer({ children, onClose, closeOnBackdrop = true }: { children: React.ReactNode; onClose: () => void; closeOnBackdrop?: boolean }) {
    return createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={closeOnBackdrop ? onClose : undefined}>
            {children}
        </div>,
        document.body,
    );
}

// ─── Category Multi-select ────────────────────────────────────────────────────

function CategoryPicker({ categories, selected, onChange }: {
    categories: DemoCategoryOut[];
    selected: string[];
    onChange: (ids: string[]) => void;
}) {
    const toggle = (id: string) =>
        onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
    const publishedCategories = categories.filter(c => c.status === "published");
    return (
        <div className="space-y-1.5">
            {selected.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {selected.map(id => {
                        const category = publishedCategories.find(item => item.id === id);
                        return (
                            <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/15 text-primary text-xs font-medium">
                                {category?.name ?? id}
                                <button type="button" onClick={() => toggle(id)} className="hover:text-red-400 transition-colors" aria-label={`Remove ${category?.name ?? id}`}>
                                    <X size={11} />
                                </button>
                            </span>
                        );
                    })}
                </div>
            )}
            <div className="relative">
                <select value="" onChange={event => { if (event.target.value) toggle(event.target.value); }} className={`${INPUT} appearance-none pr-8`}>
                    <option value="">+ Add category...</option>
                    {publishedCategories.filter(category => !selected.includes(category.id)).map(category => (
                        <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                </select>
                <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
        </div>
    );
}

function CheckboxDropdown({ selected, onChange, placeholder, options }: {
    selected: string[];
    onChange: (values: string[]) => void;
    placeholder: string;
    options: { value: string; label: string }[];
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const close = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setOpen(false);
                setSearch("");
            }
        };
        document.addEventListener("mousedown", close);
        return () => document.removeEventListener("mousedown", close);
    }, []);

    const toggle = (value: string) => onChange(selected.includes(value)
        ? selected.filter(item => item !== value)
        : [...selected, value]);
    const filteredOptions = search.trim()
        ? options.filter(option => option.label.toLowerCase().includes(search.toLowerCase()))
        : options;

    return (
        <div ref={containerRef} className="space-y-1.5">
            {selected.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {selected.map(value => {
                        const option = options.find(item => item.value === value);
                        return (
                            <span key={value} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium border border-primary/20">
                                {option?.label ?? value}
                                <button type="button" onClick={() => toggle(value)} className="hover:text-primary/60" aria-label={`Remove ${option?.label ?? value}`}>
                                    <X size={10} />
                                </button>
                            </span>
                        );
                    })}
                </div>
            )}
            <div className="relative">
                <button type="button" onClick={() => setOpen(value => !value)} className={`${INPUT} flex items-center justify-between pr-8 text-left text-muted-foreground`}>
                    <span className="truncate">{placeholder}</span>
                </button>
                <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                {open && (
                    <div className="absolute z-50 mt-1 w-full min-w-[240px] rounded-xl border border-border bg-card shadow-xl p-3 space-y-2">
                        <input type="text" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search..." className="w-full h-8 rounded-lg bg-secondary border border-border px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" autoFocus />
                        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 overflow-y-auto max-h-48">
                            {filteredOptions.map(option => (
                                <label key={option.value} className="flex items-center gap-1.5 cursor-pointer group py-1">
                                    <input type="checkbox" checked={selected.includes(option.value)} onChange={() => toggle(option.value)} className="h-3.5 w-3.5 shrink-0 rounded border-border accent-primary" />
                                    <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors truncate">{option.label}</span>
                                </label>
                            ))}
                        </div>
                        {selected.length > 0 && <button type="button" onClick={() => onChange([])} className="w-full text-[11px] text-muted-foreground hover:text-foreground text-center pt-1 border-t border-border">Clear all</button>}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Content Form (Add / Edit) ────────────────────────────────────────────────

interface ContentFormProps {
    mode: "add" | "edit";
    defaultType: DemoContentType;
    initial?: DemoContentItem;
    categories: DemoCategoryOut[];
    onClose: () => void;
    onSaved: (item: DemoContentItem) => void;
    onDraftSaved: (item: DemoContentItem) => void;
}

function ContentForm({ mode, defaultType, initial, categories, onClose, onSaved, onDraftSaved }: ContentFormProps) {
    const [type, setType] = useState<DemoContentType>(initial?.content_type ?? defaultType);
    const [title, setTitle] = useState(initial?.title ?? "");
    const [streamUrl, setStreamUrl] = useState(initial?.stream_url ?? "");
    const [streamS3Key, setStreamS3Key] = useState(initial?.stream_s3_key ?? "");
    const [thumbUrl, setThumbUrl] = useState(initial?.thumbnail_url ?? "");
    const [thumbS3Key, setThumbS3Key] = useState(initial?.thumbnail_s3_key ?? "");
    const [draftId, setDraftId] = useState(initial?.id);
    const [desc, setDesc] = useState(initial?.description ?? "");
    const [shortDesc, setShortDesc] = useState(initial?.short_description ?? "");
    const [duration, setDuration] = useState(initial?.duration_seconds?.toString() ?? "");
    const [genre] = useState(initial?.genre ?? "");
    const [languages, setLanguages] = useState<string[]>(initial?.language?.split(", ").filter(Boolean) ?? []);
    const [artist, setArtist] = useState(initial?.artist ?? "");
    const [album, setAlbum] = useState(initial?.album ?? "");
    const [ageRating, setAgeRating] = useState(initial?.age_rating ?? "");
    const [isFeatured, setIsFeatured] = useState(initial?.is_featured ?? false);
    const [catIds, setCatIds] = useState<string[]>(initial?.categories.map(c => c.id) ?? []);
    const [saving, setSaving] = useState(false);
    const [uploadingAsset, setUploadingAsset] = useState<"stream" | "thumbnail" | null>(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const streamInputRef = useRef<HTMLInputElement>(null);
    const thumbnailInputRef = useRef<HTMLInputElement>(null);
    const canUploadAsset = Boolean(title.trim()) && uploadingAsset === null;

    const contentPayload = (assets: { streamUrl: string; streamS3Key: string; thumbnailUrl: string; thumbnailS3Key: string }, detectedDuration?: number | null): DemoContentCreatePayload => ({
        title: title.trim(), content_type: type,
        stream_url: assets.streamUrl.trim() || null,
        stream_s3_key: assets.streamS3Key || null,
        thumbnail_url: assets.thumbnailUrl.trim() || null,
        thumbnail_s3_key: assets.thumbnailS3Key || null,
        description: desc.trim() || null,
        short_description: shortDesc.trim() || null,
        duration_seconds: detectedDuration ?? (duration ? Number(duration) : null),
        genre: genre.trim() || null, language: languages.join(", ") || null,
        artist: artist.trim() || null, album: album.trim() || null,
        age_rating: ageRating || null,
        is_featured: isFeatured,
        extra_data: {},
        category_ids: catIds,
    });

    async function handleAssetUpload(file: File, target: "stream" | "thumbnail") {
        if (!title.trim()) return;
        setUploadingAsset(target);
        setUploadProgress(0);
        setError(null);
        try {
            const asset = await uploadDemoAsset(
                file,
                target === "thumbnail" ? "thumbnail" : "media",
                setUploadProgress,
            );
            const assets = target === "stream"
                ? { streamUrl: asset.display_url, streamS3Key: asset.s3_key, thumbnailUrl: thumbUrl, thumbnailS3Key: thumbS3Key }
                : { streamUrl, streamS3Key, thumbnailUrl: asset.display_url, thumbnailS3Key: asset.s3_key };
            if (target === "stream") { setStreamUrl(asset.display_url); setStreamS3Key(asset.s3_key); }
            else { setThumbUrl(asset.display_url); setThumbS3Key(asset.s3_key); }
            const detectedDuration = target === "stream" ? await getMediaDuration(file) : null;
            if (detectedDuration !== null) setDuration(String(detectedDuration));
            const saved = draftId
                ? await updateDemoContent(draftId, contentPayload(assets, detectedDuration))
                : await addDemoContent({ ...contentPayload(assets, detectedDuration), status: "draft" });
            setDraftId(saved.id);
            onDraftSaved(saved);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to upload file.");
        } finally {
            setUploadingAsset(null);
        }
    }

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        if (!title.trim()) return setError("Title is required.");
        if (!streamUrl.trim()) return setError("Stream URL is required.");
        setSaving(true); setError(null);
        try {
            const payload: DemoContentCreatePayload = {
                ...contentPayload({ streamUrl, streamS3Key, thumbnailUrl: thumbUrl, thumbnailS3Key: thumbS3Key }),
                status: "published",
            };
            const saved = draftId
                ? await updateDemoContent(draftId, payload as DemoContentUpdatePayload)
                : await addDemoContent(payload);
            onSaved(saved);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to save.");
        } finally { setSaving(false); }
    }

    return (
        <ModalLayer onClose={onClose} closeOnBackdrop={false}>
            <div className="bg-card border border-border rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b border-border flex items-center justify-between">
                    <h2 className="text-lg font-display font-semibold text-foreground">
                        {mode === "add" ? "Add Demo Content" : `Edit — ${initial?.title}`}
                    </h2>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
                </div>
                <form onSubmit={handleSave} className="p-6 space-y-4">
                    {/* Type selector (only when adding) */}
                    {mode === "add" && (
                        <div className="space-y-1.5">
                            <label className={LABEL}>Content Type *</label>
                            <div className="flex gap-2 flex-wrap">
                                {CONTENT_TYPES.map(ct => (
                                    <button key={ct.value} type="button"
                                        onClick={() => setType(ct.value)}
                                        className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${type === ct.value ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                                        {ct.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="space-y-4">
                        <div className="space-y-1.5 md:col-span-2">
                            <label className={LABEL}>Title *</label>
                            <input className={INPUT} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Big Buck Bunny" />
                        </div>
                        <div className="space-y-1.5">
                            <label className={LABEL}>Short Description</label>
                            <input className={INPUT} value={shortDesc} onChange={e => setShortDesc(e.target.value)} placeholder="One-liner…" />
                        </div>
                        <div className="space-y-1.5">
                            <label className={LABEL}>Description</label>
                            <textarea rows={3} className={`${INPUT} resize-none`} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Full description…" />
                        </div>
                        <div className="space-y-1.5">
                                <label className={LABEL}>Content URL *</label>
                                <div className="flex items-start gap-3">
                                    <input className={`${INPUT} flex-1`} value={streamUrl} onChange={e => { setStreamUrl(e.target.value); setStreamS3Key(""); }} placeholder="https://..." />
                                    <div className="w-32 shrink-0 space-y-1">
                                        <input ref={streamInputRef} type="file" className="sr-only" disabled={!canUploadAsset} accept="video/*,audio/*" onChange={e => {
                                            const file = e.target.files?.[0];
                                            if (file) void handleAssetUpload(file, "stream");
                                            e.currentTarget.value = "";
                                        }} />
                                        <button type="button" disabled={!canUploadAsset} onClick={() => streamInputRef.current?.click()} title={canUploadAsset ? "Upload file" : "Enter a title before uploading"}
                                            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-border text-primary hover:bg-surface-hover disabled:text-muted-foreground disabled:cursor-not-allowed transition-colors">
                                            {uploadingAsset === "stream" ? <LoaderCircle size={13} className="animate-spin" /> : <Upload size={13} />}
                                            {uploadingAsset === "stream" ? "Uploading" : "Upload file"}
                                        </button>
                                        {uploadingAsset === "stream" && <>
                                            <div className="h-1 overflow-hidden rounded-full bg-surface-hover"><div className="h-full bg-primary transition-[width]" style={{ width: `${uploadProgress}%` }} /></div>
                                            <p className="text-center text-[10px] text-muted-foreground">{uploadProgress}%</p>
                                        </>}
                                    </div>
                                </div>
                                {streamS3Key && <p className="text-[11px] text-muted-foreground truncate">Shared asset: {streamS3Key}</p>}
                        </div>
                        <div className="space-y-1.5">
                            <label className={LABEL}>Thumbnail URL</label>
                            <div className="flex items-start gap-3">
                                <input className={`${INPUT} flex-1`} value={thumbUrl} onChange={e => { setThumbUrl(e.target.value); setThumbS3Key(""); }} placeholder="https://..." />
                                <div className="w-32 shrink-0 space-y-1">
                                    <input ref={thumbnailInputRef} type="file" className="sr-only" disabled={!canUploadAsset} accept="image/jpeg,image/png,image/webp,image/gif" onChange={e => {
                                        const file = e.target.files?.[0];
                                        if (file) void handleAssetUpload(file, "thumbnail");
                                        e.currentTarget.value = "";
                                    }} />
                                    <button type="button" disabled={!canUploadAsset} onClick={() => thumbnailInputRef.current?.click()} title={canUploadAsset ? "Upload image" : "Enter a title before uploading"}
                                        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-border text-primary hover:bg-surface-hover disabled:text-muted-foreground disabled:cursor-not-allowed transition-colors">
                                        {uploadingAsset === "thumbnail" ? <LoaderCircle size={13} className="animate-spin" /> : <Upload size={13} />}
                                        {uploadingAsset === "thumbnail" ? "Uploading" : "Upload image"}
                                    </button>
                                    {uploadingAsset === "thumbnail" && <>
                                        <div className="h-1 overflow-hidden rounded-full bg-surface-hover"><div className="h-full bg-primary transition-[width]" style={{ width: `${uploadProgress}%` }} /></div>
                                        <p className="text-center text-[10px] text-muted-foreground">{uploadProgress}%</p>
                                    </>}
                                </div>
                            </div>
                            {thumbS3Key && <p className="text-[11px] text-muted-foreground truncate">Shared asset: {thumbS3Key}</p>}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className={LABEL}>Categories</label>
                                <CategoryPicker categories={categories} selected={catIds} onChange={setCatIds} />
                            </div>
                            <div className="space-y-1.5">
                                <label className={LABEL}>Languages</label>
                                <CheckboxDropdown selected={languages} onChange={setLanguages} placeholder="+ Select languages" options={LANGUAGE_OPTIONS} />
                            </div>
                            {type === "video" && (
                                <div className="space-y-1.5">
                                    <label className={LABEL}>Age Rating</label>
                                    <select className={INPUT} value={ageRating} onChange={e => setAgeRating(e.target.value)}>
                                        <option value="">— Select —</option>
                                        {AGE_RATINGS.map(rating => <option key={rating} value={rating}>{rating}</option>)}
                                    </select>
                                </div>
                            )}
                            <div className="space-y-1.5">
                                    <label className={LABEL}>Duration (seconds)</label>
                                    <input className={INPUT} type="number" min={0} value={duration} onChange={e => setDuration(e.target.value)} placeholder="Calculated after upload" />
                            </div>
                            {type === "audio" && <>
                                <div className="space-y-1.5">
                                    <label className={LABEL}>Artist</label>
                                    <input className={INPUT} value={artist} onChange={e => setArtist(e.target.value)} placeholder="Artist name" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className={LABEL}>Album</label>
                                    <input className={INPUT} value={album} onChange={e => setAlbum(e.target.value)} placeholder="Album name" />
                                </div>
                            </>}
                        </div>
                    </div>

                    {/* Featured toggle */}
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                        <input type="checkbox" checked={isFeatured} onChange={e => setIsFeatured(e.target.checked)}
                            className="w-4 h-4 rounded accent-primary" />
                        <span className="text-sm text-foreground">Mark as Featured</span>
                    </label>

                    {error && <p className="text-sm text-red-500">{error}</p>}

                    <div className="flex items-center justify-end gap-3 pt-2">
                        <button type="button" onClick={onClose}
                            className="px-4 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors">
                            Cancel
                        </button>
                        <button type="submit" disabled={saving}
                            className="px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
                            {saving ? "Saving…" : mode === "edit" ? "Save Changes" : "Add Content"}
                        </button>
                    </div>
                </form>
            </div>
        </ModalLayer>
    );
}

// ─── Category Form ────────────────────────────────────────────────────────────

function CategoryForm({ mode, initial, onClose, onSaved, onDraftSaved }: {
    mode: "add" | "edit"; initial?: DemoCategoryOut;
    onClose: () => void; onSaved: (cat: DemoCategoryOut) => void; onDraftSaved: (cat: DemoCategoryOut) => void;
}) {
    const [name, setName] = useState(initial?.name ?? "");
    const [slug, setSlug] = useState(initial?.slug ?? "");
    const [desc, setDesc] = useState(initial?.description ?? "");
    const [contentType, setContentType] = useState(initial?.content_type ?? "");
    const [thumbUrl, setThumbUrl] = useState(initial?.thumbnail_url ?? "");
    const [thumbS3Key, setThumbS3Key] = useState(initial?.thumbnail_s3_key ?? "");
    const [draftId, setDraftId] = useState(initial?.id);
    const [sortOrder, setSortOrder] = useState(initial?.sort_order ?? 0);
    const [saving, setSaving] = useState(false);
    const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Auto-slug from name
    const autoSlug = (v: string) => v.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").trim();
    const canUploadThumbnail = Boolean(name.trim()) && !uploadingThumbnail;

    const categoryPayload = (thumbnail: { url: string; s3Key: string }) => ({
        name: name.trim(), slug: slug.trim(),
        description: desc.trim() || null,
        content_type: contentType || null,
        thumbnail_url: thumbnail.url || null,
        thumbnail_s3_key: thumbnail.s3Key || null,
        sort_order: sortOrder,
    });

    async function handleThumbnailUpload(file: File) {
        if (!name.trim()) return;
        setUploadingThumbnail(true);
        setError(null);
        try {
            const asset = await uploadDemoAsset(file, "thumbnail");
            setThumbUrl(asset.display_url);
            setThumbS3Key(asset.s3_key);
            const payload = categoryPayload({ url: asset.display_url, s3Key: asset.s3_key });
            const saved = draftId
                ? await updateDemoCategory(draftId, payload)
                : await createDemoCategory({ ...payload, status: "draft" });
            setDraftId(saved.id);
            onDraftSaved(saved);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to upload thumbnail.");
        } finally {
            setUploadingThumbnail(false);
        }
    }

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        if (!name.trim() || !slug.trim()) return setError("Name and slug are required.");
        setSaving(true); setError(null);
        try {
            const payload: DemoCategoryCreate = {
                ...categoryPayload({ url: thumbUrl.trim(), s3Key: thumbS3Key }),
                status: "published",
            };
            const saved = draftId
                ? await updateDemoCategory(draftId, payload)
                : await createDemoCategory(payload);
            onSaved(saved);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to save.");
        } finally { setSaving(false); }
    }

    return (
        <ModalLayer onClose={onClose} closeOnBackdrop={false}>
            <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl"
                onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b border-border flex items-center justify-between">
                    <h2 className="text-base font-semibold text-foreground">
                        {mode === "add" ? "Add Demo Category" : "Edit Category"}
                    </h2>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
                </div>
                <form onSubmit={handleSave} className="p-5 space-y-3">
                    <div className="space-y-1.5">
                        <label className={LABEL}>Name *</label>
                        <input className={INPUT} value={name}
                            onChange={e => { setName(e.target.value); if (mode === "add") setSlug(autoSlug(e.target.value)); }} />
                    </div>
                    <div className="space-y-1.5">
                        <label className={LABEL}>Slug *</label>
                        <input className={INPUT} value={slug} onChange={e => setSlug(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                        <label className={LABEL}>Content Type</label>
                        <select className={INPUT} value={contentType} onChange={e => setContentType(e.target.value)}>
                            <option value="">— Any —</option>
                            {CAT_CONTENT_TYPES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-3">
                            <label className={LABEL}>Thumbnail URL</label>
                            <label title={canUploadThumbnail ? "Upload image" : "Enter a category name before uploading"}
                                className={`flex items-center gap-1.5 text-xs font-medium ${canUploadThumbnail ? "text-primary cursor-pointer" : "text-muted-foreground cursor-not-allowed"}`}>
                                {uploadingThumbnail ? <LoaderCircle size={13} className="animate-spin" /> : <Upload size={13} />}
                                {uploadingThumbnail ? "Uploading..." : "Upload image"}
                                <input type="file" className="sr-only" disabled={!canUploadThumbnail}
                                    accept="image/jpeg,image/png,image/webp,image/gif" onChange={e => {
                                        const file = e.target.files?.[0];
                                        if (file) void handleThumbnailUpload(file);
                                        e.currentTarget.value = "";
                                    }} />
                            </label>
                        </div>
                        <input className={INPUT} value={thumbUrl} onChange={e => { setThumbUrl(e.target.value); setThumbS3Key(""); }} placeholder="https://..." />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <label className={LABEL}>Sort Order</label>
                            <input className={INPUT} type="number" value={sortOrder} onChange={e => setSortOrder(Number(e.target.value))} />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className={LABEL}>Description</label>
                        <textarea rows={2} className={`${INPUT} resize-none`} value={desc} onChange={e => setDesc(e.target.value)} />
                    </div>
                    {error && <p className="text-sm text-red-500">{error}</p>}
                    <div className="flex items-center justify-end gap-3 pt-1">
                        <button type="button" onClick={onClose}
                            className="px-4 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors">
                            Cancel
                        </button>
                        <button type="submit" disabled={saving}
                            className="px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
                            {saving ? "Saving…" : mode === "edit" ? "Save" : "Add Category"}
                        </button>
                    </div>
                </form>
            </div>
        </ModalLayer>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DemoContentPage() {
    const [activeTab, setActiveTab] = useState<Tab>("categories");
    const [items, setItems] = useState<DemoContentItem[]>([]);
    const [categories, setCategories] = useState<DemoCategoryOut[]>([]);
    const [contentPage, setContentPage] = useState(1);
    const [contentTotal, setContentTotal] = useState(0);
    const [contentCounts, setContentCounts] = useState<Record<DemoContentType, number | null>>({
        video: null,
        audio: null,
    });
    const [hasMoreContent, setHasMoreContent] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const [loading, setLoading] = useState(true);
    const [showContentForm, setShowContentForm] = useState(false);
    const [editItem, setEditItem] = useState<DemoContentItem | undefined>();
    const [showCatForm, setShowCatForm] = useState(false);
    const [editCat, setEditCat] = useState<DemoCategoryOut | undefined>();
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            setLoading(true);
            setLoadError(null);
            try {
                const [loadedCategories, videoContent, audioContent] = await Promise.all([
                    listDemoCategories(),
                    listDemoContent({
                        content_type: "video",
                        page: activeTab === "video" ? contentPage : 1,
                        page_size: activeTab === "video" ? PAGE_SIZE : 1,
                    }),
                    listDemoContent({
                        content_type: "audio",
                        page: activeTab === "audio" ? contentPage : 1,
                        page_size: activeTab === "audio" ? PAGE_SIZE : 1,
                    }),
                ]);
                if (!cancelled) {
                    setCategories(loadedCategories);
                    setContentCounts({ video: videoContent.total, audio: audioContent.total });
                    if (activeTab !== "categories") {
                        const content = activeTab === "video" ? videoContent : audioContent;
                        setItems(content.items);
                        setContentTotal(content.total);
                        setHasMoreContent(content.has_more);
                    }
                }
            } catch (err: unknown) {
                if (!cancelled) setLoadError(err instanceof Error ? err.message : "Could not load demo content.");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [activeTab, contentPage, refreshKey]);

    const hasActiveTranscode = activeTab === "video" && items.some(item =>
        item.transcode_status === "pending" || item.transcode_status === "processing"
    );

    useEffect(() => {
        if (!hasActiveTranscode) return;

        const refreshTranscodeStatus = async () => {
            try {
                const content = await listDemoContent({
                    content_type: "video",
                    page: contentPage,
                    page_size: PAGE_SIZE,
                });
                setItems(content.items);
                setContentTotal(content.total);
                setHasMoreContent(content.has_more);
            } catch {
                // The main load state already surfaces API failures to the user.
            }
        };

        const pollId = window.setInterval(() => { void refreshTranscodeStatus(); }, 5_000);
        return () => window.clearInterval(pollId);
    }, [contentPage, hasActiveTranscode]);

    function refreshActiveTab() {
        setRefreshKey(current => current + 1);
    }

    async function handleDeleteItem(id: string) {
        if (!confirm("Remove this demo content item?")) return;
        setDeletingId(id);
        try {
            await removeDemoContent(id);
            if (items.length === 1 && contentPage > 1) setContentPage(page => page - 1);
            else refreshActiveTab();
        }
        finally { setDeletingId(null); }
    }

    async function handleTranscode(item: DemoContentItem) {
        if (item.transcode_status === "complete" && !window.confirm("This video has already been transcoded. Restart transcoding from the beginning?")) {
            return;
        }
        try {
            const saved = await triggerDemoContentTranscode(item.id);
            setItems(previous => previous.map(current => current.id === saved.id ? saved : current));
        } catch (err: unknown) {
            window.alert(err instanceof Error ? err.message : "Could not start demo video transcoding.");
        }
    }

    async function handleDeleteCat(id: string) {
        if (!confirm("Delete this category? Content assignments will be removed.")) return;
        setDeletingId(id);
        try { await deleteDemoCategory(id); setCategories(p => p.filter(c => c.id !== id)); }
        finally { setDeletingId(null); }
    }

    async function handleReorderCategories(reordered: DemoCategoryOut[]) {
        const previous = categories;
        setCategories(reordered);
        try {
            await Promise.all(reordered.map(category => updateDemoCategory(category.id, {
                sort_order: category.sort_order,
            })));
        } catch (err) {
            setCategories(previous);
            throw err;
        }
    }

    return (
        <div className="p-8 space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-display font-bold text-foreground">Demo Content</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Manage default sample content and categories cloned to every new client account.
                    </p>
                </div>
                <button
                    onClick={() => { setEditItem(undefined); setEditCat(undefined); activeTab === "categories" ? setShowCatForm(true) : setShowContentForm(true); }}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shrink-0">
                    <Plus size={15} />
                    {activeTab === "categories" ? "Add Category" : "Add Content"}
                </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 p-1 rounded-xl bg-surface-hover/50 border border-border w-fit">
                {TABS.map(({ id, label, icon: Icon }) => (
                    <button key={id} onClick={() => { setActiveTab(id); setContentPage(1); }}
                        className={`flex items-center gap-2 px-3 py-0.5 rounded-lg text-sm font-medium transition-colors ${activeTab === id ? "bg-card text-foreground shadow-sm border border-border/50" : "text-muted-foreground hover:text-foreground"}`}>
                        <Icon size={14} />
                        {label}
                        {(id === "categories" || contentCounts[id] !== null) && (
                            <span className="text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                                {id === "categories" ? categories.length : contentCounts[id]}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Active tab */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
                {loading ? (
                    <div className="p-5 space-y-3">
                        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
                    </div>
                ) : loadError ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
                        <p className="text-sm">Could not load demo content.</p>
                        <p className="text-xs">{loadError}</p>
                        <button type="button" onClick={() => window.location.reload()} className="text-sm text-primary hover:underline">Retry</button>
                    </div>
                ) : activeTab === "categories" ? (
                    <CategoriesTab
                        categories={categories}
                        deletingId={deletingId}
                        onAdd={() => { setEditCat(undefined); setShowCatForm(true); }}
                        onEdit={category => { setEditCat(category); setShowCatForm(true); }}
                        onDelete={handleDeleteCat}
                        onReorder={handleReorderCategories}
                    />
                ) : (
                    <ContentTab
                        contentType={activeTab}
                        items={items}
                        deletingId={deletingId}
                        onAdd={() => { setEditItem(undefined); setShowContentForm(true); }}
                        onEdit={item => { setEditItem(item); setShowContentForm(true); }}
                        onDelete={handleDeleteItem}
                        onTranscode={item => { void handleTranscode(item); }}
                    />
                )}
            </div>

            {activeTab !== "categories" && !loading && !loadError && (contentPage > 1 || hasMoreContent) && (
                <div className="flex items-center justify-between px-1">
                    <span className="text-xs text-muted-foreground">{contentTotal} {activeTab === "video" ? "videos" : "audio tracks"}</span>
                    <Pagination className="mx-0 w-auto">
                        <PaginationContent>
                            <PaginationItem>
                                <PaginationPrevious
                                    href="#"
                                    onClick={event => { event.preventDefault(); if (contentPage > 1) setContentPage(page => page - 1); }}
                                    aria-disabled={contentPage === 1}
                                    className={contentPage === 1 ? "pointer-events-none opacity-50" : ""}
                                />
                            </PaginationItem>
                            <PaginationItem>
                                <PaginationNext
                                    href="#"
                                    onClick={event => { event.preventDefault(); if (hasMoreContent) setContentPage(page => page + 1); }}
                                    aria-disabled={!hasMoreContent}
                                    className={!hasMoreContent ? "pointer-events-none opacity-50" : ""}
                                />
                            </PaginationItem>
                        </PaginationContent>
                    </Pagination>
                </div>
            )}

            {/* Modals */}
            {showContentForm && (
                <ContentForm
                    mode={editItem ? "edit" : "add"}
                    defaultType={activeTab as DemoContentType}
                    initial={editItem}
                    categories={categories}
                    onClose={() => { setShowContentForm(false); setEditItem(undefined); }}
                    onSaved={saved => {
                        setShowContentForm(false); setEditItem(undefined);
                        refreshActiveTab();
                    }}
                    onDraftSaved={() => refreshActiveTab()}
                />
            )}
            {showCatForm && (
                <CategoryForm
                    mode={editCat ? "edit" : "add"}
                    initial={editCat}
                    onClose={() => { setShowCatForm(false); setEditCat(undefined); }}
                    onSaved={saved => {
                        setCategories(prev => prev.some(c => c.id === saved.id)
                            ? prev.map(c => c.id === saved.id ? saved : c)
                            : [...prev, saved]);
                        setShowCatForm(false); setEditCat(undefined);
                    }}
                    onDraftSaved={saved => setCategories(prev => prev.some(c => c.id === saved.id)
                        ? prev.map(c => c.id === saved.id ? saved : c)
                        : [...prev, saved])}
                />
            )}
        </div>
    );
}
