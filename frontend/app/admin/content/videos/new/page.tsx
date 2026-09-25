import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { VideoForm } from "../_components/VideoForm";

export default function NewVideoPage() {
    return (
        <div className="p-6 space-y-6">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2">
                <Link
                    href="/admin/content/videos"
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ChevronLeft size={15} />
                    Videos
                </Link>
                <span className="text-muted-foreground/40 text-sm">/</span>
                <span className="text-sm text-foreground font-medium">New Video</span>
            </div>

            <div>
                <h1 className="text-xl font-bold text-foreground">Add Video</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Upload and configure a new video for your content library
                </p>
            </div>

            <VideoForm mode="create" />
        </div>
    );
}
