"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Plus, Pencil, Trash2, Film, AlertTriangle, CheckCircle2, Loader2, X } from "lucide-react";
import { getSeries, listSeriesEpisodes, createEpisode, updateEpisode, deleteEpisode, type SeriesOut, type EpisodeOut, type EpisodeCreate } from "@/lib/api";

interface EpisodesPageProps {
    params: Promise<{ id: string }>;
}

interface EpisodeFormState {
    title: string;
    description: string;
    season_number: number;
    episode_number: number;
    video_url: string;
    duration_seconds: string;
    status: "draft" | "published" | "archived";
}

const EMPTY_FORM: EpisodeFormState = {
    title: "",
    description: "",
    season_number: 1,
    episode_number: 1,
    video_url: "",
    duration_seconds: "",
    status: "draft",
};

function inputCls(hasError = false) {
    return `w-full h-9 rounded-lg bg-secondary border ${hasError ? "border-red-500/60" : "border-border"} px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors`;
}

function selectCls() {
    return `w-full h-9 rounded-lg bg-secondary border border-border px-3 pr-8 text-sm text-foreground appearance-none focus:outline-none focus:ring-1 focus:ring-primary transition-colors`;
}

export default function SeriesEpisodesPage({ params }: EpisodesPageProps) {
    const [series, setSeries] = useState<SeriesOut | null>(null);
    const [episodes, setEpisodes] = useState<EpisodeOut[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [seriesId, setSeriesId] = useState<string>("");
    const [toastMsg, setToastMsg] = useState<{ text: string; ok: boolean } | null>(null);

    // Episode form modal state
    const [modalOpen, setModalOpen] = useState(false);
    const [editingEpisode, setEditingEpisode] = useState<EpisodeOut | null>(null);
    const [form, setForm] = useState<EpisodeFormState>(EMPTY_FORM);
    const [formError, setFormError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    // Delete confirm state
    const [confirmDelete, setConfirmDelete] = useState<EpisodeOut | null>(null);

    function toast(text: string, ok = true) {
        setToastMsg({ text, ok });
        setTimeout(() => setToastMsg(null), 3000);
    }

    useEffect(() => {
        params.then(({ id }) => {
            setSeriesId(id);
            Promise.all([getSeries(id), listSeriesEpisodes(id)])
                .then(([s, eps]) => { setSeries(s); setEpisodes(eps); })
                .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load episodes"))
                .finally(() => setLoading(false));
        });
    }, [params]);

    const openCreate = () => {
        setEditingEpisode(null);
        const nextEp = episodes.length > 0 ? Math.max(...episodes.map((e) => e.episode_number)) + 1 : 1;
        setForm({ ...EMPTY_FORM, episode_number: nextEp });
        setFormError(null);
        setModalOpen(true);
    };

    const openEdit = (ep: EpisodeOut) => {
        setEditingEpisode(ep);
        setForm({
            title: ep.title,
            description: ep.description ?? "",
            season_number: ep.season_number,
            episode_number: ep.episode_number,
            video_url: ep.video_url ?? "",
            duration_seconds: ep.duration_seconds != null ? String(ep.duration_seconds) : "",
            status: ep.status,
        });
        setFormError(null);
        setModalOpen(true);
    };

    const handleSave = async () => {
        if (!form.title.trim()) { setFormError("Title is required"); return; }
        setSaving(true);
        setFormError(null);
        try {
            const payload: EpisodeCreate = {
                series_id: seriesId,
                title: form.title.trim(),
                description: form.description || null,
                season_number: Number(form.season_number),
                episode_number: Number(form.episode_number),
                video_url: form.video_url || null,
                duration_seconds: form.duration_seconds ? Number(form.duration_seconds) : null,
                status: form.status,
            };
            if (editingEpisode) {
                const updated = await updateEpisode(seriesId, editingEpisode.id, payload);
                setEpisodes((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
                toast("Episode updated");
            } else {
                const created = await createEpisode(seriesId, payload);
                setEpisodes((prev) => [...prev, created]);
                toast("Episode created");
            }
            setModalOpen(false);
        } catch (err: unknown) {
            setFormError(err instanceof Error ? err.message : "Failed to save episode");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!confirmDelete) return;
        try {
            await deleteEpisode(seriesId, confirmDelete.id);
            setEpisodes((prev) => prev.filter((e) => e.id !== confirmDelete.id));
            toast(`Episode deleted`);
        } catch {
            toast("Failed to delete episode", false);
        } finally {
            setConfirmDelete(null);
        }
    };

    // Group episodes by season
    const bySeasons: Record<number, EpisodeOut[]> = {};
    for (const ep of episodes) {
        if (!bySeasons[ep.season_number]) bySeasons[ep.season_number] = [];
        bySeasons[ep.season_number].push(ep);
    }
    const seasons = Object.keys(bySeasons)
        .map(Number)
        .sort((a, b) => a - b);

    return (
        <div className="p-6 space-y-6">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2">
                <Link
                    href="/admin/content/series"
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ChevronLeft size={15} />
                    Series
                </Link>
                <span className="text-muted-foreground/40 text-sm">/</span>
                {series && (
                    <>
                        <Link href={`/admin/content/series/${seriesId}/edit`} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                            {series.title}
                        </Link>
                        <span className="text-muted-foreground/40 text-sm">/</span>
                    </>
                )}
                <span className="text-sm text-foreground font-medium">Episodes</span>
            </div>

            {/* Header */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-xl font-bold text-foreground">
                        {series ? `${series.title} — Episodes` : "Episodes"}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        {episodes.length} episode{episodes.length !== 1 ? "s" : ""} across {seasons.length} season{seasons.length !== 1 ? "s" : ""}
                    </p>
                </div>
                <button
                    onClick={openCreate}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition-all"
                >
                    <Plus size={16} /> Add Episode
                </button>
            </div>

            {/* Error */}
            {error && (
                <div className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm text-red-300 border border-red-500/20 bg-red-500/8">
                    <AlertTriangle size={14} /> {error}
                </div>
            )}

            {/* Loading */}
            {loading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 size={14} className="animate-spin" /> Loading episodes…
                </div>
            )}

            {/* Seasons */}
            {!loading && !error && (
                seasons.length === 0 ? (
                    <div className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
                        <Film size={40} className="opacity-20" />
                        <p className="text-sm">No episodes yet</p>
                        <button onClick={openCreate} className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors">
                            <Plus size={13} /> Add the first episode
                        </button>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {seasons.map((season) => (
                            <section key={season} className="rounded-2xl border border-border bg-card overflow-hidden">
                                <div className="px-4 py-3 bg-muted/40 border-b border-border flex items-center justify-between">
                                    <h2 className="text-sm font-bold text-foreground">Season {season}</h2>
                                    <span className="text-xs text-muted-foreground">{bySeasons[season].length} episode{bySeasons[season].length !== 1 ? "s" : ""}</span>
                                </div>
                                <div className="divide-y divide-border">
                                    {bySeasons[season]
                                        .sort((a, b) => a.episode_number - b.episode_number)
                                        .map((ep) => (
                                            <div key={ep.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/20 transition-colors">
                                                {/* Thumbnail / icon */}
                                                <div className="shrink-0 w-16 h-10 rounded-lg bg-muted overflow-hidden flex items-center justify-center">
                                                    {ep.thumbnail_url ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img src={ep.thumbnail_url} alt={ep.title} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <Film size={14} className="text-muted-foreground/40" />
                                                    )}
                                                </div>

                                                {/* Episode info */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] font-bold text-muted-foreground shrink-0">E{ep.episode_number}</span>
                                                        <p className="text-sm font-medium text-foreground truncate">{ep.title}</p>
                                                    </div>
                                                    {ep.description && (
                                                        <p className="text-xs text-muted-foreground truncate mt-0.5">{ep.description}</p>
                                                    )}
                                                </div>

                                                {/* Meta */}
                                                <div className="flex items-center gap-3 shrink-0">
                                                    {ep.duration_seconds != null && (
                                                        <span className="text-[11px] text-muted-foreground">
                                                            {Math.floor(ep.duration_seconds / 60)}m
                                                        </span>
                                                    )}
                                                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${ep.status === "published" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : ep.status === "archived" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-muted text-muted-foreground border-border"}`}>
                                                        {ep.status}
                                                    </span>
                                                </div>

                                                {/* Actions */}
                                                <div className="flex items-center gap-1 shrink-0">
                                                    <button
                                                        type="button"
                                                        onClick={() => openEdit(ep)}
                                                        className="p-1.5 rounded-lg hover:bg-primary/10 hover:text-primary text-muted-foreground transition-colors"
                                                        title="Edit episode"
                                                    >
                                                        <Pencil size={13} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setConfirmDelete(ep)}
                                                        className="p-1.5 rounded-lg hover:bg-red-500/10 hover:text-red-400 text-muted-foreground transition-colors"
                                                        title="Delete episode"
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            </section>
                        ))}
                    </div>
                )
            )}

            {/* Episode Form Modal */}
            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 space-y-4 shadow-2xl">
                        <div className="flex items-center justify-between">
                            <h2 className="text-base font-semibold text-foreground">
                                {editingEpisode ? "Edit Episode" : "Add Episode"}
                            </h2>
                            <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground transition-colors">
                                <X size={14} />
                            </button>
                        </div>

                        <div className="space-y-3">
                            <div className="space-y-1">
                                <label className="block text-xs font-semibold text-muted-foreground">Title *</label>
                                <input
                                    value={form.title}
                                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                                    autoFocus
                                    placeholder="Episode title"
                                    className={inputCls(!form.title && !!formError)}
                                />
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                                <div className="space-y-1">
                                    <label className="block text-xs font-semibold text-muted-foreground">Season</label>
                                    <input
                                        type="number"
                                        min={1}
                                        value={form.season_number}
                                        onChange={(e) => setForm((f) => ({ ...f, season_number: Number(e.target.value) }))}
                                        className={inputCls()}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="block text-xs font-semibold text-muted-foreground">Episode #</label>
                                    <input
                                        type="number"
                                        min={1}
                                        value={form.episode_number}
                                        onChange={(e) => setForm((f) => ({ ...f, episode_number: Number(e.target.value) }))}
                                        className={inputCls()}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="block text-xs font-semibold text-muted-foreground">Duration (s)</label>
                                    <input
                                        type="number"
                                        min={0}
                                        value={form.duration_seconds}
                                        onChange={(e) => setForm((f) => ({ ...f, duration_seconds: e.target.value }))}
                                        placeholder="e.g. 2700"
                                        className={inputCls()}
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="block text-xs font-semibold text-muted-foreground">Description</label>
                                <textarea
                                    value={form.description}
                                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                                    rows={2}
                                    placeholder="Optional episode description…"
                                    className="w-full rounded-lg bg-secondary border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="block text-xs font-semibold text-muted-foreground">Video URL</label>
                                <input
                                    value={form.video_url}
                                    onChange={(e) => setForm((f) => ({ ...f, video_url: e.target.value }))}
                                    placeholder="https://…"
                                    className={inputCls()}
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="block text-xs font-semibold text-muted-foreground">Status</label>
                                <div className="relative">
                                    <select
                                        value={form.status}
                                        onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as EpisodeFormState["status"] }))}
                                        className={selectCls()}
                                    >
                                        <option value="draft">Draft</option>
                                        <option value="published">Published</option>
                                        <option value="archived">Archived</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {formError && (
                            <div className="flex items-center gap-2 text-xs text-red-400">
                                <AlertTriangle size={12} /> {formError}
                            </div>
                        )}

                        <div className="flex gap-3 justify-end pt-2">
                            <button
                                type="button"
                                onClick={() => setModalOpen(false)}
                                className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={saving}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition-all disabled:opacity-50"
                            >
                                {saving && <Loader2 size={13} className="animate-spin" />}
                                {editingEpisode ? "Save Changes" : "Add Episode"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete confirm dialog */}
            {confirmDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 space-y-4 shadow-2xl">
                        <h2 className="text-base font-semibold text-foreground">Delete Episode</h2>
                        <p className="text-sm text-muted-foreground">
                            Are you sure you want to delete{" "}
                            <span className="font-medium text-foreground">&ldquo;{confirmDelete.title}&rdquo;</span>?
                            This action cannot be undone.
                        </p>
                        <div className="flex gap-3 justify-end pt-2">
                            <button
                                type="button"
                                onClick={() => setConfirmDelete(null)}
                                className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleDelete}
                                className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast */}
            {toastMsg && (
                <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium ${toastMsg.ok ? "bg-card border-border text-foreground" : "bg-red-500/10 border-red-500/20 text-red-300"}`}>
                    {toastMsg.ok ? <CheckCircle2 size={14} className="text-emerald-400" /> : <AlertTriangle size={14} />}
                    {toastMsg.text}
                </div>
            )}
        </div>
    );
}
