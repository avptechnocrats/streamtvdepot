import type { Metadata } from "next";
import SecurityClient from "./_components/SecurityClient";

export const metadata: Metadata = {
    title: "Security",
    description: "Manage your password and account security.",
};

export default function SecurityPage() {
    return <SecurityClient />;
}
