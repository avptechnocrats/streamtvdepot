import type { Metadata } from "next";
import ForgotPasswordForm from "./_components/ForgotPasswordForm";

export const metadata: Metadata = {
    title: "Forgot Password",
    description: "Reset your SignalView account password.",
};

export default function ForgotPasswordPage() {
    return <ForgotPasswordForm />;
}
