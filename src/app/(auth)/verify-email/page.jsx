import VerifyEmailClient from "@/components/verify-email-client";

export const metadata = {
  title: "Verify your email | Wavo",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function VerifyEmailPage() {
  return <VerifyEmailClient />;
}
