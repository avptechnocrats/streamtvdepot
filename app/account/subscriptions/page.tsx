import type { Metadata } from "next";
import SubscriptionsClient from "./_components/SubscriptionsClient";

export const metadata: Metadata = {
    title: "My Subscriptions",
    description: "View and manage your active subscription plans.",
};

export default function SubscriptionsPage() {
    return <SubscriptionsClient />;
}
