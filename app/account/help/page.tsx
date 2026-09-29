import type { Metadata } from "next";
import HelpSupportClient from "./_components/HelpSupportClient";

export const metadata: Metadata = {
    title: "Help & Support",
    description: "Raise a support ticket or check the status of your existing tickets.",
};

export default function HelpSupportPage() {
    return <HelpSupportClient />;
}
