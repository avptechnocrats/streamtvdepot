import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { SeriesForm } from "../_components/SeriesForm";

export default function NewSeriesPage() {
    return (
        <div className="p-6 space-y-6">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2">
                <Link
                    href="/admin/content/series"
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ChevronLeft size={15} />
                    Series
                </Link>
                <span className="text-muted-foreground/40 text-sm">/</span>
                <span className="text-sm text-foreground font-medium">New Series</span>
            </div>

            <div>
                <h1 className="text-xl font-bold text-foreground">Add Series</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Create a new TV series or show collection
                </p>
            </div>

            <SeriesForm mode="create" />
        </div>
    );
}
