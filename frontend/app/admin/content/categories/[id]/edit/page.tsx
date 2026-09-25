"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { getCategory } from "@/lib/api";
import { CategoryForm, categoryToFormValues, type CategoryFormValues } from "../../_components/CategoryForm";

export default function EditCategoryPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const [formValues, setFormValues] = useState<CategoryFormValues | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        getCategory(id)
            .then((cat) => setFormValues(categoryToFormValues(cat)))
            .catch(() => setError("Failed to load category"));
    }, [id]);

    if (error) {
        return (
            <div className="p-6">
                <p className="text-sm text-red-400">{error}</p>
            </div>
        );
    }

    if (!formValues) {
        return (
            <div className="p-6 flex items-center justify-center py-24">
                <Loader2 size={20} className="animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            <div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                    <Link
                        href="/admin/content/categories"
                        className="hover:text-foreground transition-colors"
                    >
                        Categories
                    </Link>
                    <span>/</span>
                    <span className="text-foreground font-medium">Edit Category</span>
                </div>
                <h1 className="text-xl font-bold text-foreground">Edit Category</h1>
            </div>
            <CategoryForm mode="edit" categoryId={id} defaultValues={formValues} />
        </div>
    );
}
