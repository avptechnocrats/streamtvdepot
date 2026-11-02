"use client";

import { useEffect, useRef, useState } from "react";

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