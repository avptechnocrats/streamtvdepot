"use client";

import { useState } from "react";
import { Sparkles, Loader2, RefreshCw, Check, AlertTriangle } from "lucide-react";

interface AiWriteButtonProps {
    /** Title of the content — used as primary context for generation */
    title: string;
    /** Optional category for better context */
    category?: string;
    /** "short" for 1–2 sentence summaries, "long" for full descriptions */
    hint?: "short" | "long";
    /** Called when the user accepts the generated text */
    onAccept: (text: string) => void;
}

export function AiWriteButton({ title, category, hint = "long", onAccept }: AiWriteButtonProps) {
    const [open, setOpen] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [result, setResult] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function generate() {
        if (!title.trim()) {
            setError("Please enter a title first.");
            return;
        }
        setGenerating(true);
        setError(null);
        setResult(null);
        try {
            const res = await fetch("/api/ai/generate-description", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: title.trim(), category, context_hint: hint }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Generation failed");
            setResult(data.description ?? "");
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Generation failed. Please try again.");
        } finally {
            setGenerating(false);
        }
    }

    function handleAccept() {
        if (result) {
            onAccept(result);
            setOpen(false);
            setResult(null);
        }
    }

    function handleOpen() {
        setOpen(true);
        setResult(null);
        setError(null);
        generate();
    }

    function handleClose() {
        setOpen(false);
        setResult(null);
        setError(null);
    }

    return (
        <>
            <button
                type="button"
                onClick={handleOpen}
                className="flex items-center gap-1 text-[11px] font-medium text-primary/80 hover:text-primary transition-colors"
                title="Write with AI"
            >
                <Sparkles size={11} />
                Write with AI
            </button>

            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl">
                        {/* Header */}
                        <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
                            <Sparkles size={15} className="text-primary" />
                            <h2 className="text-sm font-semibold text-foreground flex-1">AI Description Writer</h2>
                            <button onClick={handleClose} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                                Close
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-5 space-y-4">
                            <p className="text-xs text-muted-foreground">
                                Generating {hint === "short" ? "a short summary" : "a full description"} for{" "}
                                <span className="font-medium text-foreground">&ldquo;{title}&rdquo;</span>
                                {category ? ` in ${category}` : ""}.
                            </p>

                            {/* Loading */}
                            {generating && (
                                <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground">
                                    <Loader2 size={16} className="animate-spin text-primary" />
                                    <span className="text-xs">Generating…</span>
                                </div>
                            )}

                            {/* Error */}
                            {error && !generating && (
                                <div className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs text-red-300 border border-red-500/20 bg-red-500/8">
                                    <AlertTriangle size={13} /> {error}
                                </div>
                            )}

                            {/* Result */}
                            {result && !generating && (
                                <textarea
                                    value={result}
                                    onChange={(e) => setResult(e.target.value)}
                                    rows={hint === "short" ? 3 : 5}
                                    className="w-full rounded-lg bg-secondary border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                                />
                            )}
                        </div>

                        {/* Footer */}
                        <div className="flex items-center gap-2 px-5 py-4 border-t border-border">
                            <button
                                type="button"
                                onClick={generate}
                                disabled={generating}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary border border-border transition-colors disabled:opacity-40"
                            >
                                <RefreshCw size={12} className={generating ? "animate-spin" : ""} />
                                Regenerate
                            </button>
                            <div className="flex-1" />
                            <button
                                type="button"
                                onClick={handleClose}
                                className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                            >
                                Discard
                            </button>
                            <button
                                type="button"
                                onClick={handleAccept}
                                disabled={!result || generating}
                                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:brightness-110 transition-all disabled:opacity-40"
                            >
                                <Check size={12} /> Use this
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
