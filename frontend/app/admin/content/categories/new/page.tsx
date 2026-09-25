import Link from "next/link";
import { CategoryForm } from "../_components/CategoryForm";

export default function NewCategoryPage() {
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
                    <span className="text-foreground font-medium">New Category</span>
                </div>
                <h1 className="text-xl font-bold text-foreground">New Category</h1>
            </div>
            <CategoryForm mode="create" />
        </div>
    );
}
