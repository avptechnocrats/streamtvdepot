import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PricingPlanForm } from "../_components/PricingPlanForm";

export default function NewPricingPlanPage() {
    return (
        <div className="p-6 space-y-6">
            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Link href="/admin/pricing-plans" className="hover:text-foreground transition-colors">
                    Pricing Plans
                </Link>
                <ChevronRight size={13} />
                <span className="text-foreground font-medium">New Plan</span>
            </div>

            <PricingPlanForm mode="create" />
        </div>
    );
}
