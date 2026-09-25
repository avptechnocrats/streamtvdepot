import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { AudioForm } from "../_components/AudioForm";

export default function NewAudioPage() {
    return (
        <div className="p-6 space-y-6">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2">
                <Link
                    href="/admin/content/audios"
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ChevronLeft size={15} />
                    Audios
                </Link>
                <span className="text-muted-foreground/40 text-sm">/</span>
                <span className="text-sm text-foreground font-medium">New Audio</span>
            </div>

            <div>
                <h1 className="text-xl font-bold text-foreground">Add Audio</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Upload a new audio track to your library
                </p>
            </div>

            <AudioForm mode="create" />
        </div>
    );
}
