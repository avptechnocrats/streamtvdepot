import type { Metadata } from "next";
import SignupForm from "./_components/SignupForm";

export const metadata: Metadata = {
    title: "Create Account",
    description: "Create a free SignalView account and start streaming today.",
};

export default function SignupPage() {
    return <SignupForm />;
}
