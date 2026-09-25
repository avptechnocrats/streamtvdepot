import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { LiveTvForm } from "../_components/LiveTvForm";

export default function NewLiveTvPage() {
    return (
        <div className="p-6 space-y-6">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2">
                <Link
                    href="/admin/content/live-tv"
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ChevronLeft size={15} />
                    Live TV
                </Link>
                <span className="text-muted-foreground/40 text-sm">/</span>
                <span className="text-sm text-foreground font-medium">New Channel</span>
            </div>

            <LiveTvForm mode="create" />
        </div>
    );
}
