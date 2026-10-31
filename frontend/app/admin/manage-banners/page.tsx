"use client";

import { useEffect, useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Eye, ImagePlus, Loader2, Pencil, Plus, RefreshCw, Save, Search, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import ImageCropModal from "../content/videos/_components/ImageCropModal";
import { uploadAssetToS3 } from "@/lib/upload/s3-upload";
import { BANNER_SIZES, listBanners, saveBanner, deleteBanner, type BannerSlot, type BannerImage, type ManagedBanner } from "@/lib/api/services/banners";

const pages = [
    { value: "/", label: "Home (/)" },
    { value: "/movies", label: "Movies (/movies)" },
    { value: "/series", label: "Series (/series)" },
    { value: "/tv-shows", label: "TV-Shows (/tv-shows)" },
    { value: "/ppv-events", label: "PPV-Events (/ppv-events)" },
] as const;
const positions = [
    { value: "top", label: "Top" },
    { value: "middle_1", label: "Middle 1" },
    { value: "middle_2", label: "Middle 2" },
    { value: "bottom", label: "Bottom" },
] as const;
const schema = z.object({
    name: z.string().trim().min(1, "Banner name is required").max(120),
    link: z.string().trim().max(2048).refine(value => {
        if (!value) return true;
        if (/[\\\s\u0000-\u001f\u007f]/.test(value)) return false;
        if (value.startsWith("/") && !value.startsWith("//")) return true;
        try {
            const url = new URL(value);
            return ["http:", "https:"].includes(url.protocol) && !!url.hostname && !url.username && !url.password;
        } catch { return false; }
    }, "Use an HTTP/HTTPS URL or a site-relative path, such as /movies"),
    page: z.enum(["/", "/movies", "/series", "/tv-shows", "/ppv-events"]),
    position: z.enum(["top", "middle_1", "middle_2", "bottom"]),
    border_enabled: z.boolean(),
    border_width: z.number().int().min(0).max(32),
    border_color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    border_radius: z.number().int().min(0).max(128),
    padding: z.number().int().min(0).max(128),
});
type FormValues = Required<z.infer<typeof schema>>;
const defaults: FormValues = { name: "", link: "", page: "/", position: "top", border_enabled: false, border_width: 1, border_color: "#cccccc", border_radius: 0, padding: 0 };
const slots: BannerSlot[] = ["custom", "desktop", "tablet", "mobile"];

export default function ManageBannersPage() {
    const { toast } = useToast();
    const { session, isAuthenticated } = useAdminAuth();
    const queryClient = useQueryClient();
    const bannerQueryKey = ["managed-banners", session?.email, session?.loginAt];
    const query = useQuery({ queryKey: bannerQueryKey, queryFn: listBanners, enabled: isAuthenticated });
    const [editingId, setEditingId] = useState<string>();
    const [editorOpen, setEditorOpen] = useState(false);
    const [activeSlot, setActiveSlot] = useState<BannerSlot>("custom");
    const [dragSlot, setDragSlot] = useState<BannerSlot | null>(null);
    const fileInputs = useRef<Partial<Record<BannerSlot, HTMLInputElement>>>({});
    const [images, setImages] = useState<Partial<Record<BannerSlot, BannerImage>>>({});
    const [crop, setCrop] = useState<{ src: string; filename: string; slot: BannerSlot } | null>(null);
    const [uploading, setUploading] = useState<BannerSlot | null>(null);
    const [progress, setProgress] = useState(0);
    const [imageError, setImageError] = useState("");
    const [deleting, setDeleting] = useState<ManagedBanner | null>(null);
    const [preview, setPreview] = useState<ManagedBanner | null>(null);
    const [previewErrors, setPreviewErrors] = useState<Partial<Record<BannerSlot, boolean>>>({});
    const [search, setSearch] = useState("");
    const { register, control, watch, reset, handleSubmit, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults });
    const border = watch("border_enabled");
    const borderWidth = watch("border_width");
    const borderColor = watch("border_color");
    const borderRadius = watch("border_radius");
    const padding = watch("padding");
    useEffect(() => () => { if (crop) URL.revokeObjectURL(crop.src); }, [crop]);

    const clearEditor = () => {
        reset(defaults); setEditingId(undefined); setImages({}); setImageError("");
        setEditorOpen(false);
        setActiveSlot("custom"); setDragSlot(null);
    };
    const save = useMutation({
        mutationFn: (values: FormValues) => saveBanner({ ...values, link: values.link || null, images }, editingId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: bannerQueryKey });
            clearEditor(); toast({ title: "Banner saved" });
        },
        onError: () => toast({ title: "Unable to save banner", description: "Your changes are still in the editor. Please try again.", variant: "destructive" }),
    });
    const remove = useMutation({
        mutationFn: deleteBanner,
        onSuccess: (_, id) => {
            queryClient.invalidateQueries({ queryKey: bannerQueryKey });
            if (editingId === id) clearEditor();
            setDeleting(null); toast({ title: "Banner deleted" });
        },
        onError: () => toast({ title: "Unable to delete banner", variant: "destructive" }),
    });
    const busy = save.isPending || uploading !== null || crop !== null || remove.isPending;
    const filteredBanners = (query.data ?? []).filter(banner =>
        [banner.name, banner.page, positions.find(position => position.value === banner.position)?.label ?? ""]
            .some(value => value.toLowerCase().includes(search.trim().toLowerCase())));
    function selectImage(file: File | undefined, slot: BannerSlot) {
        if (!file || busy) return;
        if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) {
            toast({ title: "Choose a PNG, JPEG, or WebP image under 10 MB", variant: "destructive" });
            return;
        }
        setCrop({ slot, filename: file.name, src: URL.createObjectURL(file) });
    }
    async function uploadCrop(blob: Blob, _filename: string, dimensions: { width: number; height: number }) {
        if (!crop) return;
        const { slot, filename } = crop;
        setCrop(null); setUploading(slot); setProgress(0);
        try {
            const file = new File([blob], `${filename.replace(/\.[^.]+$/, "")}-${slot}.jpg`, { type: "image/jpeg" });
            const result = await uploadAssetToS3(file, { onProgress: value => setProgress(Math.round(value.percent)) }, { width: dimensions.width, height: dimensions.height, purpose: "managed_banner" });
            setImages(current => ({ ...current, [slot]: { url: result.url, display_url: result.display_url, asset_id: result.id, width: dimensions.width, height: dimensions.height } }));
            setImageError("");
        } catch {
            toast({ title: "Banner upload failed", description: "Select the image again to retry.", variant: "destructive" });
        } finally { setUploading(null); }
    }
    function edit(banner: ManagedBanner) {
        const { id, images: savedImages, ...values } = banner;
        reset({ ...values, link: values.link ?? "" }); setEditingId(id); setImages(savedImages); setImageError("");
        setEditorOpen(true);
        setActiveSlot(slots.find(slot => savedImages[slot]) ?? "custom");
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    return (
        <div className="space-y-6 p-4 sm:p-6">
            <header className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl font-bold text-foreground">Manage Banners</h1>
            {!editorOpen && <Button onClick={() => { clearEditor(); setEditorOpen(true); }} disabled={busy} className="h-auto gap-2 rounded-lg px-4 py-2 text-sm font-semibold hover:brightness-110"><Plus size={15} /> New Banner</Button>}
            </header>
            {editorOpen && <form onSubmit={handleSubmit(values => {
                if (!Object.keys(images).length) { setImageError("Upload at least one banner image."); return; }
                save.mutate(values);
            })} className="space-y-6 pb-24">
                <div className="grid items-start gap-6 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
                    <section className="min-w-0 space-y-5 rounded-[6px] border border-border bg-card p-6">
                        <h2 className="border-b pb-3 text-base font-semibold">{editingId ? "Edit Banner" : "Banner Details"}</h2>
                        <div className="space-y-2">
                            <Label htmlFor="banner-name">Banner Name</Label>
                            <Input id="banner-name" {...register("name")} maxLength={120} disabled={busy} aria-invalid={!!errors.name} />
                            {errors.name && <p className="text-sm text-destructive" role="alert">{errors.name.message}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="banner-link">Link (optional)</Label>
                            <Input id="banner-link" {...register("link")} placeholder="https://example.com or /movies" maxLength={2048} disabled={busy} aria-invalid={!!errors.link} />
                            {errors.link && <p className="text-sm text-destructive" role="alert">{errors.link.message}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="banner-page">Page</Label>
                            <Controller name="page" control={control} render={({ field }) => <Select value={field.value} onValueChange={field.onChange} disabled={busy}><SelectTrigger id="banner-page"><SelectValue /></SelectTrigger><SelectContent>{pages.map(page => <SelectItem key={page.value} value={page.value}>{page.label}</SelectItem>)}</SelectContent></Select>} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="banner-position">Position</Label>
                            <Controller name="position" control={control} render={({ field }) => <Select value={field.value} onValueChange={field.onChange} disabled={busy}><SelectTrigger id="banner-position"><SelectValue /></SelectTrigger><SelectContent>{positions.map(position => <SelectItem key={position.value} value={position.value}>{position.label}</SelectItem>)}</SelectContent></Select>} />
                        </div>
                        <div className="flex items-center gap-3 border-t pt-5">
                            <Controller name="border_enabled" control={control} render={({ field }) => <Switch id="banner-border" checked={field.value} onCheckedChange={field.onChange} disabled={busy} />} />
                            <Label htmlFor="banner-border">Border</Label>
                        </div>
                        {border && <div className="grid gap-4 sm:grid-cols-2">
                            {([{ name: "border_width", label: "Border Width", max: 32 }, { name: "border_radius", label: "Border Radius", max: 128 }, { name: "padding", label: "Padding", max: 128 }] as const).map(setting => <div key={setting.name} className="space-y-2"><Label htmlFor={setting.name}>{setting.label} (px)</Label><Input id={setting.name} type="number" min={0} max={setting.max} step={1} {...register(setting.name, { valueAsNumber: true })} disabled={busy} />{errors[setting.name] && <p role="alert" className="text-xs text-destructive">Enter a whole number from 0 to {setting.max}.</p>}</div>)}
                            <div className="space-y-2"><Label htmlFor="banner-color">Border Color</Label><Input id="banner-color" type="color" {...register("border_color")} disabled={busy} className="w-20 p-1" /></div>
                        </div>}
                    </section>
                    <section className="min-w-0 space-y-5 rounded-[6px] border border-border bg-card p-6">
                        <h2 className="border-b pb-3 text-base font-semibold">Banner Images</h2>
                        <Tabs value={activeSlot} onValueChange={value => { setActiveSlot(value as BannerSlot); setDragSlot(null); }}>
                            <TabsList className="grid h-auto w-full grid-cols-4" aria-label="Banner size">
                                {slots.map(slot => <TabsTrigger key={slot} value={slot} disabled={busy} className="gap-1 px-2 text-xs sm:text-sm">
                                    {BANNER_SIZES[slot].label}
                                    {images[slot] && <Check size={12} aria-label="Image uploaded" />}
                                </TabsTrigger>)}
                            </TabsList>
                            {slots.map(slot => {
                                const size = BANNER_SIZES[slot];
                                const image = images[slot];
                                return <TabsContent key={slot} value={slot} className="min-w-0 space-y-3 pt-3">
                                    <Label htmlFor={`banner-${slot}`} className="block text-xs">{size.label} Banner <span className="font-normal text-muted-foreground">{slot === "custom" ? (image ? `(${image.width} x ${image.height} px)` : "(Custom size)") : `(${size.width} x ${size.height} px)`}</span></Label>
                                    <button
                                        type="button"
                                        disabled={busy}
                                        aria-label={`${image ? "Replace" : "Upload"} ${size.label} banner`}
                                        onClick={() => fileInputs.current[slot]?.click()}
                                        onDragOver={event => { event.preventDefault(); if (!busy) { event.dataTransfer.dropEffect = "copy"; setDragSlot(slot); } }}
                                        onDragLeave={() => setDragSlot(null)}
                                        onDrop={event => { event.preventDefault(); setDragSlot(null); selectImage(event.dataTransfer.files[0], slot); }}
                                        className={`flex h-56 w-full items-center justify-center overflow-hidden rounded-[6px] border-2 border-dashed p-4 text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50 ${dragSlot === slot ? "border-primary bg-primary/5" : "border-border bg-background hover:border-primary/60 hover:bg-muted/20"}`}
                                    >
                                        {image ? <span className="flex h-full w-full items-center justify-center overflow-hidden" style={border ? { border: `${borderWidth}px solid ${borderColor}`, borderRadius, padding } : undefined}><img src={image.display_url || image.url} alt={`${size.label} banner preview`} className="h-full w-full object-contain" /></span> : <span className="flex flex-col items-center gap-3"><Upload size={18} /><span className="text-xs font-medium">Click or drag image here</span><span className="text-[11px] text-muted-foreground/70">JPG, PNG, WebP</span></span>}
                                    </button>
                                    <Input ref={element => { fileInputs.current[slot] = element; }} id={`banner-${slot}`} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} className="sr-only" tabIndex={-1} onChange={event => {
                                        const file = event.target.files?.[0]; event.target.value = ""; selectImage(file, slot);
                                    }} />
                                    {uploading === slot && <p className="text-xs text-muted-foreground" role="status">Uploading {progress}%</p>}
                                    {image && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setImages(current => { const next = { ...current }; delete next[slot]; return next; })}><X size={14} /> Remove</Button>}
                                </TabsContent>;
                            })}
                        </Tabs>
                        {imageError && <p role="alert" className="text-sm text-destructive">{imageError}</p>}
                    </section>
                </div>
                <div className="fixed bottom-0 left-0 z-30 flex w-full items-center justify-end gap-2 border-t border-border/50 bg-background px-6 py-2.5">
                    <Button type="submit" disabled={busy} className="h-auto gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold hover:brightness-110">{save.isPending || uploading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {save.isPending ? "Saving..." : "Save Banner"}</Button>
                    <Button type="button" variant="ghost" onClick={clearEditor} disabled={busy} className="h-auto rounded-lg px-4 py-2.5 text-sm font-normal text-muted-foreground hover:bg-surface-hover hover:text-foreground">Cancel</Button>
                </div>
            </form>}
            {!editorOpen && <section className="space-y-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                    <div className="flex w-fit items-center gap-2 rounded-xl border border-border bg-surface-hover/50 p-1">
                        <span className="flex items-center gap-2 rounded-lg border border-border/50 bg-card px-3 py-0.5 text-sm font-medium shadow-sm"><ImagePlus size={14} /> All Banners <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">{query.data?.length ?? 0}</span></span>
                    </div>
                    <div className="flex w-full items-center gap-2 lg:ml-auto lg:w-auto">
                        <div className="relative min-w-0 flex-1 lg:w-80">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input value={search} onChange={event => setSearch(event.target.value)} aria-label="Search banners" placeholder="Search by name, page, position..." className="h-10 rounded-xl border-border bg-secondary pl-9 pr-3 text-sm" />
                        </div>
                        <Button variant="outline" disabled={query.isFetching} onClick={() => query.refetch()} className="h-auto shrink-0 gap-2 rounded-lg border-border bg-secondary px-3 py-2 text-sm font-normal text-muted-foreground hover:bg-muted/60 hover:text-foreground"><RefreshCw size={14} className={query.isFetching ? "animate-spin" : ""} /> Refresh</Button>
                    </div>
                </div>
                {query.isError && <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">Unable to load banners. Use Refresh to try again.</div>}
                <div className="overflow-hidden rounded-2xl border border-border bg-card">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="border-b border-border bg-muted/30 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"><tr>
                                <th className="whitespace-nowrap px-4 py-2.5">Banner Name</th>
                                <th className="px-4 py-2.5">Page</th>
                                <th className="px-4 py-2.5">Position</th>
                                <th className="px-4 py-2.5">Size</th>
                                <th className="px-2 py-2.5 text-center">Preview</th>
                                <th className="px-2 py-2.5 text-center">Edit</th>
                                <th className="px-2 py-2.5 text-center">Delete</th>
                            </tr></thead>
                            <tbody>
                                {query.isPending ? <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground" role="status">Loading banners...</td></tr> : !filteredBanners.length ? <tr><td colSpan={7} className="px-4 py-16 text-center text-muted-foreground"><div className="flex flex-col items-center gap-3"><ImagePlus size={32} className="opacity-30" /><p className="text-sm">{query.isError ? "Banner listing unavailable" : search.trim() ? "No banners match your search" : "No banners yet"}</p></div></td></tr> : filteredBanners.map(banner => <tr key={banner.id} className="border-b border-border transition-colors last:border-0 hover:bg-muted/20">
                                    <td className="max-w-64 break-words px-4 py-3 text-sm font-medium text-primary">{banner.name}</td>
                                    <td className="px-4 py-3 text-xs text-muted-foreground">{pages.find(page => page.value === banner.page)?.label}</td>
                                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{positions.find(position => position.value === banner.position)?.label}</td>
                                    <td className="px-4 py-3 text-xs text-muted-foreground">{slots.filter(slot => banner.images[slot]).map(slot => <div key={slot} className="whitespace-nowrap">{BANNER_SIZES[slot].label}: {banner.images[slot].width} x {banner.images[slot].height}</div>)}</td>
                                    <td className="px-2 py-3 text-center"><Button variant="ghost" size="icon" title="Preview banner" aria-label={`Preview ${banner.name}`} disabled={busy} onClick={() => { setPreviewErrors({}); setPreview(banner); }} className="h-auto w-auto rounded-md p-1.5 text-green-500 hover:bg-green-500/10 hover:text-green-600"><Eye className="!size-[13px]" /></Button></td>
                                    <td className="px-2 py-3 text-center"><Button variant="ghost" size="icon" title="Edit banner" aria-label={`Edit ${banner.name}`} disabled={busy} onClick={() => edit(banner)} className="h-auto w-auto rounded-md p-1.5 text-blue-500 hover:bg-blue-500/10 hover:text-blue-600"><Pencil className="!size-[13px]" /></Button></td>
                                    <td className="px-2 py-3 text-center"><Button variant="ghost" size="icon" title="Delete banner" aria-label={`Delete ${banner.name}`} disabled={busy} onClick={() => setDeleting(banner)} className="h-auto w-auto rounded-md p-1.5 text-red-500 hover:bg-red-500/10 hover:text-red-400"><Trash2 className="!size-[13px]" /></Button></td>
                                </tr>)}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>}
            {crop && <ImageCropModal src={crop.src} filename={crop.filename} aspect="16:9" freeForm={crop.slot === "custom"} output={crop.slot === "custom" ? undefined : BANNER_SIZES[crop.slot]} onConfirm={uploadCrop} onCancel={() => setCrop(null)} />}
            <Dialog open={!!preview} onOpenChange={open => { if (!open) setPreview(null); }}>
                <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] max-w-4xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="break-words pr-6">{preview?.name}</DialogTitle>
                        <DialogDescription>{pages.find(page => page.value === preview?.page)?.label} · {positions.find(position => position.value === preview?.position)?.label}</DialogDescription>
                    </DialogHeader>
                    {preview && (slots.some(slot => preview.images[slot]) ? (
                        <Tabs key={preview.id} defaultValue={slots.find(slot => preview.images[slot])}>
                            <TabsList className="flex h-auto flex-wrap justify-start" aria-label="Preview size">
                                {slots.filter(slot => preview.images[slot]).map(slot => <TabsTrigger key={slot} value={slot}>{BANNER_SIZES[slot].label}</TabsTrigger>)}
                            </TabsList>
                            {slots.filter(slot => preview.images[slot]).map(slot => {
                                const image = preview.images[slot];
                                return <TabsContent key={slot} value={slot} className="space-y-3">
                                    <p className="text-xs text-muted-foreground">{image.width} x {image.height} px</p>
                                    <div className="flex min-h-32 items-center justify-center overflow-auto bg-muted/20 p-4">
                                        {previewErrors[slot] ? <p role="status" className="text-sm text-muted-foreground">Unable to load this banner image.</p> : (
                                            <div className="max-w-full overflow-hidden" style={preview.border_enabled ? { border: `${preview.border_width}px solid ${preview.border_color}`, borderRadius: preview.border_radius, padding: preview.padding } : undefined}>
                                                <img src={image.display_url || image.url} alt={`${preview.name} - ${BANNER_SIZES[slot].label}`} className="block h-auto max-h-[55vh] max-w-full object-contain" onError={() => setPreviewErrors(current => ({ ...current, [slot]: true }))} />
                                            </div>
                                        )}
                                    </div>
                                </TabsContent>;
                            })}
                        </Tabs>
                    ) : <p className="text-sm text-muted-foreground">No banner images available.</p>)}
                </DialogContent>
            </Dialog>
            <Dialog open={!!deleting} onOpenChange={open => { if (!open && !remove.isPending) setDeleting(null); }}>
                <DialogContent><DialogHeader><DialogTitle>Delete Banner</DialogTitle></DialogHeader><p className="break-words text-sm text-muted-foreground">Delete {deleting?.name}? Uploaded images will remain in the media library.</p><DialogFooter><Button variant="outline" disabled={remove.isPending} onClick={() => setDeleting(null)}>Cancel</Button><Button variant="destructive" disabled={remove.isPending} onClick={() => deleting && remove.mutate(deleting.id)}>{remove.isPending ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} Delete</Button></DialogFooter></DialogContent>
            </Dialog>
        </div>
    );
}