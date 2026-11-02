"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { ThumbnailView } from "@/lib/services/categories";

export function useRowScroll(itemCount: number) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    useEffect(() => {
        const element = scrollRef.current;
        if (!element) return;
        const update = () => {
            setCanScrollLeft(element.scrollLeft > 1);
            setCanScrollRight(element.scrollLeft + element.clientWidth < element.scrollWidth - 1);
        };
        update();
        element.addEventListener("scroll", update, { passive: true });
        const observer = new ResizeObserver(update);
        observer.observe(element);
        Array.from(element.children).forEach(child => observer.observe(child));
        return () => {
            element.removeEventListener("scroll", update);
            observer.disconnect();
        };
    }, [itemCount]);

    return { scrollRef, canScrollLeft, canScrollRight };
}

export function useCategoryRowMinimum(contentArea: RefObject<HTMLDivElement | null>, themeId: string) {
    const [minimum, setMinimum] = useState<Record<ThumbnailView, number> | null>(null);

    useEffect(() => {
        const area = contentArea.current;
        if (!area) return;
        const measure = () => {
            const viewport = window.innerWidth;
            const style = getComputedStyle(area);
            const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
            const isEmber = themeId === "ember";
            const padding = (viewport >= 1024 ? (isEmber ? 7 : 5) : viewport >= 640 ? 3 : 2) * rem;
            const available = area.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - padding;
            const count = (view: ThumbnailView) => {
                const landscape = isEmber && view === "landscape";
                const width = (landscape
                    ? (viewport >= 1024 ? 16 : viewport >= 640 ? 15 : 14)
                    : (viewport >= 1024 ? 13 : viewport >= 640 ? 12 : 11)) * rem;
                const gap = (landscape ? 0.75 : viewport >= 640 ? 1.5 : 1.25) * rem;
                return Math.max(1, Math.ceil((available + gap) / (width + gap)));
            };
            setMinimum({ landscape: count("landscape"), portrait: count("portrait") });
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(area);
        window.addEventListener("resize", measure);
        return () => {
            observer.disconnect();
            window.removeEventListener("resize", measure);
        };
    }, [contentArea, themeId]);

    return minimum;
}