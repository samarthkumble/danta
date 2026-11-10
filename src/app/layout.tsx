import type { Metadata } from "next";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/onest";
import "./globals.css";

export const metadata: Metadata = {
  title: "Danta",
  description:
    "Staged PayPal payments and an aftercare guarantee for patients travelling to India for dental care. Built for the PayPal AI Hackathon 2026.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
