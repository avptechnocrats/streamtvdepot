"use client";

import { useRef, useState } from "react";
import ReactCrop, { centerCrop, makeAspectCrop, type Crop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { X, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

export type CropAspect = "1:1" | "16:9" | "2:3" | "3:2";

export function aspectToNumber(aspect: CropAspect): number {
    return { "1:1": 1, "16:9": 16 / 9, "2:3": 2 / 3, "3:2": 3 / 2 }[aspect];
}

export function dimensionsForAspect(aspect: CropAspect): { width: number; height: number } {
    return {
        "1:1": { width: 1000, height: 1000 },
        "16:9": { width: 1920, height: 1080 },
        "2:3": { width: 600, height: 900 },
        "3:2": { width: 1200, height: 800 },
    }[aspect];
}

export async function getCroppedBlob(
    imgEl: HTMLImageElement,
    crop: PixelCrop,
    output: { width: number; height: number },
): Promise<Blob> {
    const canvas = document.createElement("canvas");
    const scaleX = imgEl.naturalWidth / imgEl.width;
    const scaleY = imgEl.naturalHeight / imgEl.height;
    canvas.width = output.width;
    canvas.height = output.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(imgEl, crop.x * scaleX, crop.y * scaleY, crop.width * scaleX, crop.height * scaleY, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) =>
        canvas.toBlob(b => b ? resolve(b) : reject(new Error("Canvas empty")), "image/jpeg", 0.92),
    );
}

/** Minimum pixel length required on each side of the cropped output. */
const MIN_CROP_DIM = 200;

/**
 * Validate whether an image is suitable for the requested crop format.
 * Returns an error string, or null if the image is fine.
 */
export function validateImageForCrop(
    naturalWidth: number,
    naturalHeight: number,
    aspect: CropAspect,
): string | null {
    const aspectNum = aspectToNumber(aspect);
    const imageAspect = naturalWidth / naturalHeight;
    const maxCropWidth = imageAspect >= aspectNum ? naturalHeight * aspectNum : naturalWidth;
    const maxCropHeight = imageAspect >= aspectNum ? naturalHeight : naturalWidth / aspectNum;

    if (maxCropWidth < MIN_CROP_DIM || maxCropHeight < MIN_CROP_DIM) {
        return (
            `Image too small for a ${aspect} crop. ` +
            `The largest possible crop is ${Math.round(maxCropWidth)}×${Math.round(maxCropHeight)}px, ` +
            `but at least ${MIN_CROP_DIM}px on each side is required. ` +
            `Please upload a higher-resolution image.`
        );
    }

    return null;
}

export interface ImageCropModalProps {
    src: string;
    filename: string;
    aspect: CropAspect;
    onConfirm: (blob: Blob, filename: string) => void;
    onCancel: () => void;
}

export default function ImageCropModal({ src, filename, aspect, onConfirm, onCancel }: ImageCropModalProps) {
    const imgRef = useRef<HTMLImageElement>(null);
    const [crop, setCrop] = useState<Crop>();
    const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
    const [confirming, setConfirming] = useState(false);
    const [suitabilityError, setSuitabilityError] = useState<string | null>(null);
    const aspectNum = aspectToNumber(aspect);
    const outputDimensions = dimensionsForAspect(aspect);

    function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
        const { width, height, naturalWidth, naturalHeight } = e.currentTarget;
        const error = validateImageForCrop(naturalWidth, naturalHeight, aspect);
        setSuitabilityError(error);
        if (error) return; // don't set a crop selection — image is unsuitable
        setCrop(centerCrop(makeAspectCrop({ unit: "%", width: 90 }, aspectNum, width, height), width, height));
    }

    async function handleConfirm() {
        if (!imgRef.current || !completedCrop || suitabilityError) return;
        setConfirming(true);
        try {
            const blob = await getCroppedBlob(imgRef.current, completedCrop, outputDimensions);
            onConfirm(blob, filename);
        } finally {
            setConfirming(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-2xl flex flex-col rounded-2xl border border-border bg-card shadow-2xl">
                <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
                    <div>
                        <h2 className="text-base font-semibold text-foreground">Crop Image</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">Resize and position the crop. Output: {outputDimensions.width} × {outputDimensions.height}px</p>
                    </div>
                    <button type="button" onClick={onCancel} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                        <X size={16} />
                    </button>
                </div>

                {/* Suitability error banner */}
                {suitabilityError && (
                    <div className="mx-5 mt-4 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300 shrink-0">
                        <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                        <p className="leading-relaxed">{suitabilityError}</p>
                    </div>
                )}

                <div className="flex items-center justify-center p-5 bg-black/30 overflow-auto max-h-[58vh]">
                    <ReactCrop
                        crop={crop}
                        onChange={c => setCrop(c)}
                        onComplete={c => setCompletedCrop(c)}
                        aspect={aspectNum}
                        minWidth={MIN_CROP_DIM}
                        minHeight={MIN_CROP_DIM}
                        keepSelection
                        disabled={!!suitabilityError}
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img ref={imgRef} src={src} alt="Crop preview" crossOrigin="anonymous" onLoad={onImageLoad} style={{ maxHeight: "52vh", width: "auto", display: "block", opacity: suitabilityError ? 0.4 : 1 }} />
                    </ReactCrop>
                </div>
                <div className="flex items-center justify-end gap-3 p-5 border-t border-border shrink-0">
                    <button type="button" onClick={onCancel}
                        className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                        Cancel
                    </button>
                    <button type="button" onClick={handleConfirm} disabled={!completedCrop || confirming || !!suitabilityError}
                        className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition-all disabled:opacity-50">
                        {confirming ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                        Apply Crop
                    </button>
                </div>
            </div>
        </div>
    );
}
