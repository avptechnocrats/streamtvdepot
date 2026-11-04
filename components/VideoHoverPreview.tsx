"use client";

import { useEffect, useRef, useState } from "react";
import { BannerTrailer } from "@/components/BannerTrailer";

export const WIDER_LANDSCAPE_CARD_WIDTH = "w-[calc(100cqw-2rem)] sm:w-[calc((100cqw-1rem)/2)] lg:w-[min(40rem,calc((100cqw-1.5rem)/3))]";

export function VideoHoverPreview({ src, hlsSrc }: { src?: string | null; hlsSrc?: string | null }) {
    const previewRef = useRef<HTMLDivElement>(null);
    const [hovered, setHovered] = useState(false);

    useEffect(() => {
        const card = previewRef.current?.closest("a");
        if (!card) return;

        const onPointerEnter = (event: PointerEvent) => {
            if (event.pointerType === "mouse") setHovered(true);
        };
        const onPointerLeave = () => setHovered(false);
        const onFocusIn = () => setHovered(true);
        const onFocusOut = (event: FocusEvent) => {
            if (!(event.relatedTarget instanceof Node) || !card.contains(event.relatedTarget)) setHovered(false);
        };

        card.addEventListener("pointerenter", onPointerEnter);
        card.addEventListener("pointerleave", onPointerLeave);
        card.addEventListener("focusin", onFocusIn);
        card.addEventListener("focusout", onFocusOut);
        return () => {
            card.removeEventListener("pointerenter", onPointerEnter);
            card.removeEventListener("pointerleave", onPointerLeave);
            card.removeEventListener("focusin", onFocusIn);
            card.removeEventListener("focusout", onFocusOut);
        };
    }, []);

    if (!src && !hlsSrc) return null;

    return (
        <div ref={previewRef} className="absolute inset-0 z-10">
            <BannerTrailer
                src={src ?? null}
                hlsSrc={hlsSrc}
                hovered={hovered}
                showSoundControl
                soundControlPlacement="bottom-right"
            />
        </div>
    );
}