import Link from "next/link";
import { AdvertisementForm } from "../_components/AdvertisementForm";

export default function NewAdvertisementPage() {
    return (
        <div className="p-6 space-y-6">
            <div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                    <Link href="/admin/advertisements" className="hover:text-foreground transition-colors">
                        Advertisements
                    </Link>
                    <span>/</span>
                    <span className="text-foreground font-medium">New Advertisement</span>
                </div>
                <h1 className="text-xl font-bold text-foreground">New Advertisement</h1>
            </div>
            <AdvertisementForm mode="create" />
        </div>
    );
}
