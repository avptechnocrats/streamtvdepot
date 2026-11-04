"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Upload, X } from "lucide-react";
import ImageCropModal, { dimensionsForAspect, type CropAspect } from "@/app/admin/content/videos/_components/ImageCropModal";
import MediaLibraryModal from "@/app/admin/content/videos/_components/MediaLibraryModal";
import { resolveMediaUrl } from "@/lib/media";
import { getApiErrorMessage } from "@/lib/api/error-utils";
import { uploadAssetToS3 } from "@/lib/upload/s3-upload";

interface ContentImageFieldProps {
    label: string;
    hint: string;
    aspect: CropAspect;
    value: string | null;
    onChange: (url: string) => void;
    onChangeAssetId?: (id: string | null) => void;
    onBeforeUpload?: () => Promise<boolean>;
    preserveOriginal?: boolean;
    purpose?: "thumbnail" | "banner";
}

export default function ContentImageField({ label, hint, aspect, value, onChange, onChangeAssetId, onBeforeUpload, preserveOriginal = false, purpose }: ContentImageFieldProps) {
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [pendingCrop, setPendingCrop] = useState<{ file: File; src: string } | null>(null);
    const [displayUrl, setDisplayUrl] = useState("");
    const lastValueRef = useRef(value);

    useEffect(() => {
        if (value !== lastValueRef.current) {
            lastValueRef.current = value;
            setDisplayUrl("");
        }
    }, [value]);

    useEffect(() => () => {
        if (pendingCrop) URL.revokeObjectURL(pendingCrop.src);
    }, [pendingCrop]);

    const saveUpload = useCallback(async (file: File, dimensions: { width: number; height: number }) => {
        const confirmed = await uploadAssetToS3(file, {}, { ...dimensions, ...(purpose ? { purpose } : {}) });
        lastValueRef.current = confirmed.url;
        setDisplayUrl(resolveMediaUrl(confirmed) ?? confirmed.url);
        onChange(confirmed.url);
        onChangeAssetId?.(confirmed.id);
    }, [onChange, onChangeAssetId, purpose]);

    const openCrop = useCallback(async (file: File) => {
        if (uploading) return;
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
            setUploadError("Please select a JPG, PNG, or WebP image");
            return;
        }
        if (onBeforeUpload && !(await onBeforeUpload())) return;
        setUploadError(null);
        if (!preserveOriginal) {
            setPendingCrop({ file, src: URL.createObjectURL(file) });
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            setUploadError("Choose a PNG, WebP, or JPEG image under 10 MB");
            return;
        }
        setUploading(true);
        try {
            const image = await createImageBitmap(file);
            const dimensions = { width: image.width, height: image.height };
            image.close();
            await saveUpload(file, dimensions);
        } catch (error) {
            setUploadError(getApiErrorMessage(error, "Unable to upload image"));
        } finally {
            setUploading(false);
        }
    }, [onBeforeUpload, preserveOriginal, saveUpload, uploading]);

    const openPicker = useCallback(async () => {
        if (uploading) return;
        if (onBeforeUpload && !(await onBeforeUpload())) return;
        setUploadError(null);
        setPickerOpen(true);
    }, [onBeforeUpload, uploading]);

    const handleCropConfirm = useCallback(async (blob: Blob, originalName: string) => {
        setPendingCrop(null);
        setUploading(true);
        setUploadError(null);
        try {
            const filename = originalName.replace(/\.[^.]+$/, ".jpg");
            await saveUpload(new File([blob], filename, { type: "image/jpeg" }), dimensionsForAspect(aspect));
        } catch (error) {
            setUploadError(getApiErrorMessage(error, "Upload failed. Please try again."));
        } finally {
            setUploading(false);
        }
    }, [aspect, saveUpload]);

    const previewAspect = aspect === "1:1" ? "aspect-square" : aspect === "2:3" ? "aspect-[2/3]" : aspect === "3:2" ? "aspect-[3/2]" : "aspect-video";
    const containerW = aspect === "2:3" ? "w-36 mx-auto" : aspect === "1:1" ? "w-48 mx-auto" : "w-full";
    const previewUrl = displayUrl || value;

    return <>
        {pendingCrop && <ImageCropModal src={pendingCrop.src} filename={pendingCrop.file.name} aspect={aspect} onConfirm={handleCropConfirm} onCancel={() => setPendingCrop(null)} />}
        <MediaLibraryModal
            open={pickerOpen}
            onClose={() => setPickerOpen(false)}
            filterType="image"
            onUploadFile={file => { void openCrop(file); }}
            usedUrls={value ? [value] : []}
            onSelect={(url, _filename, asset) => {
                const storedUrl = asset?.url ?? url;
                lastValueRef.current = storedUrl;
                setDisplayUrl(url);
                setUploadError(null);
                onChange(storedUrl);
                onChangeAssetId?.(asset?.id ?? null);
            }}
        />
        <div className="space-y-2">
            <div>
                <label className="block text-sm font-medium leading-none text-foreground">
                    {label} {!preserveOriginal && <span className="font-normal text-muted-foreground">({aspect})</span>}
                </label>
                <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
            </div>
            <div
                role={!value ? "button" : undefined}
                tabIndex={!value && !uploading ? 0 : undefined}
                aria-label={!value ? `Choose ${label.toLowerCase()} image` : undefined}
                aria-busy={uploading}
                onDrop={event => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) void openCrop(file); }}
                onDragOver={event => event.preventDefault()}
                onClick={() => { if (!value) void openPicker(); }}
                onKeyDown={event => { if (!value && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); void openPicker(); } }}
                className={`relative overflow-hidden rounded-xl border-2 transition-colors ${containerW} focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${value ? "border-border" : "group cursor-pointer border-dashed border-border hover:border-primary/50"}`}
            >
                {previewUrl ? <div className={`relative ${previewAspect}`}>
                    <img src={previewUrl} alt={label} className={`h-full w-full ${preserveOriginal ? "object-contain p-4" : "object-cover"}`} />
                    {uploading ? <div className="absolute inset-0 flex items-center justify-center bg-black/60"><Loader2 size={20} className="animate-spin text-white" /></div> : <div className="group absolute inset-0 flex items-center justify-center gap-2 bg-black/0 transition-colors hover:bg-black/50">
                        <button type="button" onClick={event => { event.stopPropagation(); void openPicker(); }} className="flex items-center gap-1.5 rounded-lg bg-black/70 px-3 py-1.5 text-sm font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"><Upload size={12} /> Replace</button>
                        <button type="button" aria-label={`Remove ${label.toLowerCase()} image`} onClick={event => { event.stopPropagation(); lastValueRef.current = ""; setDisplayUrl(""); onChange(""); onChangeAssetId?.(null); }} className="flex items-center gap-1 rounded-lg bg-red-500/80 px-2 py-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"><X size={12} /></button>
                    </div>}
                </div> : <div className={`${previewAspect} flex flex-col items-center justify-center gap-2 text-muted-foreground transition-colors group-hover:text-foreground`}>
                    {uploading ? <Loader2 size={18} className="animate-spin" /> : <><Upload size={18} /><p className="text-center text-sm font-medium">Click or drag image here</p><p className="text-xs opacity-60">JPG, PNG, WebP</p></>}
                </div>}
            </div>
            {uploadError && <p role="alert" className="text-xs text-red-400">{uploadError}</p>}
        </div>
    </>;
}