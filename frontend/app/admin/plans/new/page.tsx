import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PlanForm } from "../_components/PlanForm";

export default function NewPlanPage() {
    return (
        <div className="p-6 space-y-6">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2">
                <Link
                    href="/admin/plans"
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ChevronLeft size={15} />
                    Plans
                </Link>
                <span className="text-muted-foreground/40 text-sm">/</span>
                <span className="text-sm text-foreground font-medium">New Plan</span>
            </div>

            <div>
                <h1 className="text-xl font-bold text-foreground">Create Plan</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Define a new subscription plan for your clients
                </p>
            </div>

            <PlanForm mode="create" />
        </div>
    );
}
