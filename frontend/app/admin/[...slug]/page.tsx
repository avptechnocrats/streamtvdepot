"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Clock } from "lucide-react";

export default function ComingSoon() {
    const params = useParams();
    const slugParts = Array.isArray(params.slug) ? params.slug : [params.slug];
    const feature = slugParts
        .map((s) => s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()))
        .join(" › ");

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-6 px-4">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary">
                <Clock size={32} />
            </div>
            <div className="space-y-2">
                <h1 className="text-2xl font-semibold tracking-tight">Coming Soon</h1>
                <p className="text-muted-foreground max-w-sm">
                    {feature
                        ? <><span className="font-medium text-foreground">{feature}</span> is not available yet.</>
                        : "This page is not available yet."}
                </p>
                <p className="text-sm text-muted-foreground">We're working on it and it'll be ready soon.</p>
            </div>
            <Link
                href="/admin"
                className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
                ← Back to Dashboard
            </Link>
        </div>
    );
}
