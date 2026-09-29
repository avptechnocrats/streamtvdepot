import type { Metadata } from "next";
import TransactionsClient from "./_components/TransactionsClient";

export const metadata: Metadata = {
    title: "My Transactions",
    description: "View your complete payment history.",
};

export default function TransactionsPage() {
    return <TransactionsClient />;
}
