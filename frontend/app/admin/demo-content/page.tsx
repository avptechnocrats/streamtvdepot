"use client";

import { useEffect, useState } from "react";
import {
    Film, Music, Tv, Radio, Tag, Plus, Pencil, Trash2,
    ChevronDown, X, Check,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
    listDemoContent, addDemoContent, updateDemoContent, removeDemoContent,
    listDemoCategories, createDemoCategory, updateDemoCategory, deleteDemoCategory,
    type DemoContentItem, type DemoContentType, type DemoContentCreatePayload, type DemoContentUpdatePayload,
    type DemoCategoryOut, type DemoCategoryCreate,
} from "@/lib/api";

// ─── Constants ────────────────────────────────────────────────────────────────

type Tab = "video" | "audio" | "series" | "live_stream" | "categories";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "video",       label: "Videos",      icon: Film   },
    { id: "audio",       label: "Audio",        icon: Music  },
    { id: "series",      label: "Series",       icon: Tv     },
    { id: "live_stream", label: "Live Streams", icon: Radio  },
    { id: "categories",  label: "Categories",   icon: Tag    },
];

const CONTENT_TYPES: { value: DemoContentType; label: string }[] = [
    { value: "video",       label: "Video"       },
    { value: "audio",       label: "Audio"       },
    { value: "series",      label: "Series"      },
    { value: "live_stream", label: "Live Stream" },
];

const CAT_CONTENT_TYPES = ["video", "audio", "series", "live_stream", "general"];
const AGE_RATINGS = ["U", "U/A 7+", "U/A 13+", "U/A 16+", "A", "S"];
const GENRES = ["Action", "Animation", "Comedy", "Crime", "Documentary", "Drama",
                "Fantasy", "Horror", "Kids", "Music", "Romance", "Sci-Fi",
                "Sports", "Thriller", "Ambient", "Classical", "Electronic", "Jazz",
                "Pop", "Devotional", "Live TV", "News"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(s: number | null) {
    if (!s) return "—";
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h > 0
        ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
        : `${m}:${String(sec).padStart(2, "0")}`;
}

function Thumb({ url, title }: { url: string | null; title: string }) {
    return url
        ? <img src={url} alt={title} className="w-14 h-9 object-cover rounded border border-border" />
        : <div className="w-14 h-9 rounded border border-border bg-surface-hover flex items-center justify-center">
            <Film size={12} className="text-muted-foreground" />
          </div>;
}

// ─── Category badge ───────────────────────────────────────────────────────────

function CatBadges({ cats }: { cats: DemoContentItem["categories"] }) {
    if (!cats.length) return <span className="text-muted-foreground text-xs">—</span>;
    return (
        <div className="flex flex-wrap gap-1">
            {cats.map(c => (
                <span key={c.id} className="px-1.5 py-0.5 text-[10px] rounded border border-border bg-surface-hover text-muted-foreground">
                    {c.name}
                </span>
            ))}
        </div>
    );
}

// ─── Episode mini-editor ──────────────────────────────────────────────────────

interface EpisodeRow { title: string; season_number: number; episode_number: number; stream_url: string; thumbnail_url: string; duration_seconds: string; description: string }
const EMPTY_EP = (): EpisodeRow => ({ title: "", season_number: 1, episode_number: 1, stream_url: "", thumbnail_url: "", duration_seconds: "", description: "" });

function EpisodesEditor({ value, onChange }: { value: EpisodeRow[]; onChange: (v: EpisodeRow[]) => void }) {
    const set = (i: number, k: keyof EpisodeRow, v: string | number) =>
        onChange(value.map((ep, j) => j === i ? { ...ep, [k]: v } : ep));
    return (
        <div className="space-y-3">
            {value.map((ep, i) => (
                <div key={i} className="rounded-lg border border-border p-3 space-y-2 bg-background/50">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground">Episode {i + 1}</span>
                        <button onClick={() => onChange(value.filter((_, j) => j !== i))}
                            className="text-muted-foreground hover:text-red-500 transition-colors">
                            <X size={12} />
                        </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <input className={INPUT} placeholder="Title *" value={ep.title} onChange={e => set(i, "title", e.target.value)} />
                        <input className={INPUT} placeholder="Stream URL *" value={ep.stream_url} onChange={e => set(i, "stream_url", e.target.value)} />
                        <input className={INPUT} type="number" min={1} placeholder="Season #" value={ep.season_number} onChange={e => set(i, "season_number", Number(e.target.value))} />
                        <input className={INPUT} type="number" min={1} placeholder="Episode #" value={ep.episode_number} onChange={e => set(i, "episode_number", Number(e.target.value))} />
                        <input className={INPUT} placeholder="Thumbnail URL" value={ep.thumbnail_url} onChange={e => set(i, "thumbnail_url", e.target.value)} />
                        <input className={INPUT} type="number" min={0} placeholder="Duration (sec)" value={ep.duration_seconds} onChange={e => set(i, "duration_seconds", e.target.value)} />
                        <input className={`${INPUT} col-span-2`} placeholder="Description" value={ep.description} onChange={e => set(i, "description", e.target.value)} />
                    </div>
                </div>
            ))}
            <button onClick={() => onChange([...value, EMPTY_EP()])}
                className="text-xs text-primary hover:underline flex items-center gap-1">
                <Plus size={12} /> Add Episode
            </button>
        </div>
    );
}

// ─── Input style ──────────────────────────────────────────────────────────────

const INPUT = "w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary";
const LABEL = "text-xs font-medium text-muted-foreground uppercase tracking-wider";

// ─── Category Multi-select ────────────────────────────────────────────────────

function CategoryPicker({ categories, selected, onChange }: {
    categories: DemoCategoryOut[];
    selected: string[];
    onChange: (ids: string[]) => void;
}) {
    const [open, setOpen] = useState(false);
    const toggle = (id: string) =>
        onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
    const names = categories.filter(c => selected.includes(c.id)).map(c => c.name);
    return (
        <div className="relative">
            <button type="button" onClick={() => setOpen(o => !o)}
                className={`${INPUT} flex items-center justify-between text-left`}>
                <span className={selected.length ? "text-foreground" : "text-muted-foreground"}>
                    {names.length ? names.join(", ") : "Select categories…"}
                </span>
                <ChevronDown size={14} className="text-muted-foreground shrink-0" />
            </button>
            {open && (
                <div className="absolute z-50 mt-1 w-full bg-card border border-border rounded-lg shadow-xl max-h-52 overflow-y-auto">
                    {categories.length === 0
                        ? <p className="px-3 py-2 text-xs text-muted-foreground">No categories yet</p>
                        : categories.map(c => (
                            <button key={c.id} type="button"
                                onClick={() => toggle(c.id)}
                                className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-surface-hover transition-colors">
                                <span>{c.name}</span>
                                {selected.includes(c.id) && <Check size={12} className="text-primary" />}
                            </button>
                        ))
                    }
                </div>
            )}
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
}

function ContentForm({ mode, defaultType, initial, categories, onClose, onSaved }: ContentFormProps) {
    const [type, setType] = useState<DemoContentType>(initial?.content_type ?? defaultType);
    const [title, setTitle] = useState(initial?.title ?? "");
    const [streamUrl, setStreamUrl] = useState(initial?.stream_url ?? "");
    const [thumbUrl, setThumbUrl] = useState(initial?.thumbnail_url ?? "");
    const [desc, setDesc] = useState(initial?.description ?? "");
    const [shortDesc, setShortDesc] = useState(initial?.short_description ?? "");
    const [duration, setDuration] = useState(initial?.duration_seconds?.toString() ?? "");
    const [genre, setGenre] = useState(initial?.genre ?? "");
    const [language, setLanguage] = useState(initial?.language ?? "");
    const [artist, setArtist] = useState(initial?.artist ?? "");
    const [album, setAlbum] = useState(initial?.album ?? "");
    const [ageRating, setAgeRating] = useState(initial?.age_rating ?? "");
    const [isFeatured, setIsFeatured] = useState(initial?.is_featured ?? false);
    const [catIds, setCatIds] = useState<string[]>(initial?.categories.map(c => c.id) ?? []);
    const rawEps: EpisodeRow[] = ((initial?.extra_data?.episodes ?? []) as Record<string, unknown>[]).map(e => ({
        title: String(e.title ?? ""), season_number: Number(e.season_number ?? 1),
        episode_number: Number(e.episode_number ?? 1), stream_url: String(e.stream_url ?? ""),
        thumbnail_url: String(e.thumbnail_url ?? ""), duration_seconds: String(e.duration_seconds ?? ""),
        description: String(e.description ?? ""),
    }));
    const [episodes, setEpisodes] = useState<EpisodeRow[]>(rawEps);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        if (!title.trim()) return setError("Title is required.");
        if (type !== "series" && !streamUrl.trim()) return setError("Stream URL is required.");
        setSaving(true); setError(null);
        try {
            const payload: DemoContentCreatePayload = {
                title: title.trim(), content_type: type,
                stream_url: type !== "series" ? streamUrl.trim() : null,
                thumbnail_url: thumbUrl.trim() || null,
                description: desc.trim() || null,
                short_description: shortDesc.trim() || null,
                duration_seconds: duration ? Number(duration) : null,
                genre: genre.trim() || null, language: language.trim() || null,
                artist: artist.trim() || null, album: album.trim() || null,
                age_rating: ageRating || null,
                is_featured: isFeatured,
                extra_data: type === "series"
                    ? { episodes: episodes.map(ep => ({ ...ep, thumbnail_url: ep.thumbnail_url || null, duration_seconds: ep.duration_seconds ? Number(ep.duration_seconds) : null, description: ep.description || null })) }
                    : type === "live_stream" ? { source: "external" } : {},
                category_ids: catIds,
            };
            const saved = mode === "edit" && initial
                ? await updateDemoContent(initial.id, payload as DemoContentUpdatePayload)
                : await addDemoContent(payload);
            onSaved(saved);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to save.");
        } finally { setSaving(false); }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
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

                    {/* Common fields */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5 md:col-span-2">
                            <label className={LABEL}>Title *</label>
                            <input className={INPUT} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Big Buck Bunny" />
                        </div>
                        {type !== "series" && (
                            <div className="space-y-1.5 md:col-span-2">
                                <label className={LABEL}>Stream URL *</label>
                                <input className={INPUT} value={streamUrl} onChange={e => setStreamUrl(e.target.value)} placeholder="https://..." />
                            </div>
                        )}
                        <div className="space-y-1.5 md:col-span-2">
                            <label className={LABEL}>Thumbnail URL</label>
                            <input className={INPUT} value={thumbUrl} onChange={e => setThumbUrl(e.target.value)} placeholder="https://..." />
                        </div>
                        <div className="space-y-1.5">
                            <label className={LABEL}>Short Description</label>
                            <input className={INPUT} value={shortDesc} onChange={e => setShortDesc(e.target.value)} placeholder="One-liner…" />
                        </div>
                        <div className="space-y-1.5">
                            <label className={LABEL}>Genre</label>
                            <select className={INPUT} value={genre} onChange={e => setGenre(e.target.value)}>
                                <option value="">— Select —</option>
                                {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className={LABEL}>Language</label>
                            <input className={INPUT} value={language} onChange={e => setLanguage(e.target.value)} placeholder="English" />
                        </div>
                        {type !== "series" && (
                            <div className="space-y-1.5">
                                <label className={LABEL}>Duration (seconds)</label>
                                <input className={INPUT} type="number" min={0} value={duration} onChange={e => setDuration(e.target.value)} placeholder="e.g. 5400" />
                            </div>
                        )}
                        {type === "video" && (
                            <div className="space-y-1.5">
                                <label className={LABEL}>Age Rating</label>
                                <select className={INPUT} value={ageRating} onChange={e => setAgeRating(e.target.value)}>
                                    <option value="">— Select —</option>
                                    {AGE_RATINGS.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                            </div>
                        )}
                        {type === "audio" && (
                            <>
                                <div className="space-y-1.5">
                                    <label className={LABEL}>Artist</label>
                                    <input className={INPUT} value={artist} onChange={e => setArtist(e.target.value)} placeholder="Artist name" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className={LABEL}>Album</label>
                                    <input className={INPUT} value={album} onChange={e => setAlbum(e.target.value)} placeholder="Album name" />
                                </div>
                            </>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <label className={LABEL}>Description</label>
                        <textarea rows={3} className={`${INPUT} resize-none`} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Full description…" />
                    </div>

                    {/* Categories */}
                    <div className="space-y-1.5">
                        <label className={LABEL}>Categories</label>
                        <CategoryPicker categories={categories} selected={catIds} onChange={setCatIds} />
                    </div>

                    {/* Featured toggle */}
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                        <input type="checkbox" checked={isFeatured} onChange={e => setIsFeatured(e.target.checked)}
                            className="w-4 h-4 rounded accent-primary" />
                        <span className="text-sm text-foreground">Mark as Featured</span>
                    </label>

                    {/* Episodes (series) */}
                    {type === "series" && (
                        <div className="space-y-2">
                            <label className={LABEL}>Episodes</label>
                            <EpisodesEditor value={episodes} onChange={setEpisodes} />
                        </div>
                    )}

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
        </div>
    );
}

// ─── Category Form ────────────────────────────────────────────────────────────

function CategoryForm({ mode, initial, onClose, onSaved }: {
    mode: "add" | "edit"; initial?: DemoCategoryOut;
    onClose: () => void; onSaved: (cat: DemoCategoryOut) => void;
}) {
    const [name, setName] = useState(initial?.name ?? "");
    const [slug, setSlug] = useState(initial?.slug ?? "");
    const [desc, setDesc] = useState(initial?.description ?? "");
    const [contentType, setContentType] = useState(initial?.content_type ?? "");
    const [thumbUrl, setThumbUrl] = useState(initial?.thumbnail_url ?? "");
    const [sortOrder, setSortOrder] = useState(initial?.sort_order ?? 0);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Auto-slug from name
    const autoSlug = (v: string) => v.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").trim();

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        if (!name.trim() || !slug.trim()) return setError("Name and slug are required.");
        setSaving(true); setError(null);
        try {
            const payload: DemoCategoryCreate = {
                name: name.trim(), slug: slug.trim(),
                description: desc.trim() || null,
                content_type: contentType || null,
                thumbnail_url: thumbUrl.trim() || null,
                sort_order: sortOrder,
            };
            const saved = mode === "edit" && initial
                ? await updateDemoCategory(initial.id, payload)
                : await createDemoCategory(payload);
            onSaved(saved);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to save.");
        } finally { setSaving(false); }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
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
                            {CAT_CONTENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <label className={LABEL}>Thumbnail URL</label>
                        <input className={INPUT} value={thumbUrl} onChange={e => setThumbUrl(e.target.value)} placeholder="https://..." />
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
        </div>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DemoContentPage() {
    const [activeTab, setActiveTab] = useState<Tab>("video");
    const [items, setItems] = useState<DemoContentItem[]>([]);
    const [categories, setCategories] = useState<DemoCategoryOut[]>([]);
    const [loading, setLoading] = useState(true);
    const [showContentForm, setShowContentForm] = useState(false);
    const [editItem, setEditItem] = useState<DemoContentItem | undefined>();
    const [showCatForm, setShowCatForm] = useState(false);
    const [editCat, setEditCat] = useState<DemoCategoryOut | undefined>();
    const [deletingId, setDeletingId] = useState<string | null>(null);

    useEffect(() => {
        void (async () => {
            setLoading(true);
            try {
                const [c, d] = await Promise.all([listDemoCategories(), listDemoContent()]);
                setCategories(c);
                setItems(d);
            } finally { setLoading(false); }
        })();
    }, []);

    const tabItems = activeTab === "categories"
        ? []
        : items.filter(i => i.content_type === activeTab);

    async function handleDeleteItem(id: string) {
        if (!confirm("Remove this demo content item?")) return;
        setDeletingId(id);
        try { await removeDemoContent(id); setItems(p => p.filter(i => i.id !== id)); }
        finally { setDeletingId(null); }
    }

    async function handleDeleteCat(id: string) {
        if (!confirm("Delete this category? Content assignments will be removed.")) return;
        setDeletingId(id);
        try { await deleteDemoCategory(id); setCategories(p => p.filter(c => c.id !== id)); }
        finally { setDeletingId(null); }
    }

    const catIcon = (type: string | null) => {
        switch (type) {
            case "video": return <Film size={13} className="text-blue-400" />;
            case "audio": return <Music size={13} className="text-green-400" />;
            case "series": return <Tv size={13} className="text-purple-400" />;
            case "live_stream": return <Radio size={13} className="text-red-400" />;
            default: return <Tag size={13} className="text-muted-foreground" />;
        }
    };

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
                    <button key={id} onClick={() => setActiveTab(id)}
                        className={`flex items-center gap-2 px-3 py-0.5 rounded-lg text-sm font-medium transition-colors ${activeTab === id ? "bg-card text-foreground shadow-sm border border-border/50" : "text-muted-foreground hover:text-foreground"}`}>
                        <Icon size={14} />
                        {label}
                        {id !== "categories" && (
                            <span className="text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                                {items.filter(i => i.content_type === id).length}
                            </span>
                        )}
                        {id === "categories" && (
                            <span className="text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                                {categories.length}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Content table */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
                {loading ? (
                    <div className="p-5 space-y-3">
                        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
                    </div>
                ) : activeTab !== "categories" ? (
                    tabItems.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                            <Film size={36} className="opacity-20" />
                            <p className="text-sm">No {activeTab.replace("_", " ")} content yet.</p>
                            <button onClick={() => { setEditItem(undefined); setShowContentForm(true); }}
                                className="text-sm text-primary hover:underline">Add the first item</button>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-border text-left">
                                        {["", "Title", "Genre", "Language", "Duration", "Categories", "Featured", ""].map((h, i) => (
                                            <th key={i} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {tabItems.map(item => (
                                        <tr key={item.id} className="border-b border-border/50 hover:bg-surface-hover/30 transition-colors">
                                            <td className="px-4 py-3"><Thumb url={item.thumbnail_url} title={item.title} /></td>
                                            <td className="px-4 py-3">
                                                <p className="font-medium text-foreground">{item.title}</p>
                                                {item.short_description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{item.short_description}</p>}
                                                {item.content_type === "series" && (
                                                    <p className="text-xs text-primary mt-0.5">
                                                        {((item.extra_data?.episodes ?? []) as unknown[]).length} episodes
                                                    </p>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-muted-foreground">{item.genre ?? "—"}</td>
                                            <td className="px-4 py-3 text-muted-foreground">{item.language ?? "—"}</td>
                                            <td className="px-4 py-3 text-muted-foreground">{formatDuration(item.duration_seconds)}</td>
                                            <td className="px-4 py-3"><CatBadges cats={item.categories} /></td>
                                            <td className="px-4 py-3">
                                                {item.is_featured
                                                    ? <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">Featured</span>
                                                    : <span className="text-muted-foreground text-xs">—</span>}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <button onClick={() => { setEditItem(item); setShowContentForm(true); }}
                                                        className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors">
                                                        <Pencil size={13} />
                                                    </button>
                                                    <button onClick={() => handleDeleteItem(item.id)}
                                                        disabled={deletingId === item.id}
                                                        className="p-1.5 rounded text-muted-foreground hover:text-red-500 hover:bg-red-500/10 disabled:opacity-40 transition-colors">
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )
                ) : (
                    categories.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                            <Tag size={36} className="opacity-20" />
                            <p className="text-sm">No demo categories yet.</p>
                            <button onClick={() => { setEditCat(undefined); setShowCatForm(true); }}
                                className="text-sm text-primary hover:underline">Add the first category</button>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-border text-left">
                                        {["Name", "Slug", "Type", "Sort", "Description", ""].map((h, i) => (
                                            <th key={i} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...categories].sort((a, b) => a.sort_order - b.sort_order).map(cat => (
                                        <tr key={cat.id} className="border-b border-border/50 hover:bg-surface-hover/30 transition-colors">
                                            <td className="px-4 py-3 font-medium text-foreground">
                                                <div className="flex items-center gap-2">
                                                    {catIcon(cat.content_type)}
                                                    {cat.name}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{cat.slug}</td>
                                            <td className="px-4 py-3 text-muted-foreground">{cat.content_type ?? "—"}</td>
                                            <td className="px-4 py-3 text-muted-foreground">{cat.sort_order}</td>
                                            <td className="px-4 py-3 text-muted-foreground text-xs max-w-xs truncate">{cat.description ?? "—"}</td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <button onClick={() => { setEditCat(cat); setShowCatForm(true); }}
                                                        className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors">
                                                        <Pencil size={13} />
                                                    </button>
                                                    <button onClick={() => handleDeleteCat(cat.id)}
                                                        disabled={deletingId === cat.id}
                                                        className="p-1.5 rounded text-muted-foreground hover:text-red-500 hover:bg-red-500/10 disabled:opacity-40 transition-colors">
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )
                )}
            </div>

            {/* Modals */}
            {showContentForm && (
                <ContentForm
                    mode={editItem ? "edit" : "add"}
                    defaultType={activeTab as DemoContentType}
                    initial={editItem}
                    categories={categories}
                    onClose={() => { setShowContentForm(false); setEditItem(undefined); }}
                    onSaved={saved => {
                        setItems(prev => editItem ? prev.map(i => i.id === saved.id ? saved : i) : [saved, ...prev]);
                        setShowContentForm(false); setEditItem(undefined);
                    }}
                />
            )}
            {showCatForm && (
                <CategoryForm
                    mode={editCat ? "edit" : "add"}
                    initial={editCat}
                    onClose={() => { setShowCatForm(false); setEditCat(undefined); }}
                    onSaved={saved => {
                        setCategories(prev => editCat ? prev.map(c => c.id === saved.id ? saved : c) : [...prev, saved]);
                        setShowCatForm(false); setEditCat(undefined);
                    }}
                />
            )}
        </div>
    );
}
