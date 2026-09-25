import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PpvEventForm } from "../_components/PpvEventForm";

export default function NewPpvEventPage() {
    return (
        <div className="p-6 space-y-6">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2">
                <Link
                    href="/admin/content/ppv-events"
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ChevronLeft size={15} />
                    PPV Events
                </Link>
                <span className="text-muted-foreground/40 text-sm">/</span>
                <span className="text-sm text-foreground font-medium">New PPV Event</span>
            </div>

            <div>
                <h1 className="text-xl font-bold text-foreground">Add PPV Event</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Configure a new pay-per-view live event
                </p>
            </div>

            <PpvEventForm mode="create" />
        </div>
    );
}
