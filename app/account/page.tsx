import type { Metadata } from "next";
import AccountClient from "./_components/AccountClient";

export const metadata: Metadata = {
    title: "My Account",
    description: "Manage your account details and security settings.",
};

export default function AccountPage() {
    return <AccountClient />;
}
